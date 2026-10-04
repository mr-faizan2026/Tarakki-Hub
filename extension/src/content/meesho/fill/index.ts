/**
 * ════════════════════════════════════════════════════════════════════════════
 *  THE FILL ENGINE — one click, many fields, nothing claimed that is not true.
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Called only from a seller's click on "Autofill". It never presses Next, Save,
 *  Submit or Publish, and never advances a step; the catalog is theirs to review
 *  and submit.
 *
 *  ── HOW A RUN GOES ────────────────────────────────────────────────────────
 *  PASSES. Meesho reveals fields as earlier ones are answered — pick a GST type
 *  and two more boxes appear. So the run does not walk one list: each pass
 *  re-discovers the form, fills whatever now matches, and a new pass starts only
 *  if the previous one filled something. It stops at TIMING.maxPasses.
 *
 *  BETWEEN FIELDS. After every write the engine waits for the DOM to be quiet
 *  (waitForSettle), then pauses briefly. Writing into a form that is still
 *  re-rendering loses the write silently, which is the failure mode that makes
 *  autofill untrustworthy.
 *
 *  PER FIELD. Up to TIMING.retries attempts with backoff, under a hard
 *  per-field timeout so one stuck widget can never hang the run.
 *
 *  OVERWRITE. Default: only empty controls are touched. With the toggle on, a
 *  control that already holds something is replaced. Either way, a field the
 *  profile has NO value for is never cleared — the engine only ever visits
 *  fields the profile knows about.
 *
 *  CANCEL. `cancelFill()` flips a flag the loop and the handlers both check. The
 *  fields already written stay written (undoing them would be a second round of
 *  writes into the seller's form, which is worse), and the report says what was
 *  reached.
 *
 *  EVERY OUTCOME IS EARNED. "filled" means the value was read back off the page.
 *  Anything else is "skipped" (deliberately not written, with the reason) or
 *  "needs attention" (tried, could not verify) so the seller knows exactly which
 *  boxes to finish by hand.
 *
 *  AND THE FORM GETS THE LAST WORD. A profile only knows the fields it was
 *  captured with, so "every field in the profile was filled" is not the same
 *  claim as "this catalog is ready". A run that touches all 21 of its fields can
 *  leave Inventory, price and MRP blank and still report Filled 21 · Skipped 0.
 *  So when the writing is done the engine re-reads the form and lists the
 *  REQUIRED boxes that are still empty — read off the page, not inferred from
 *  the profile, and named whether or not the profile ever knew about them.
 */

import type {
  CapturedField,
  FillItem,
  FillProgress,
  FillRequest,
  FillResult,
  UnfilledRequired,
} from "@/lib/autofill-types";
import { TIMING } from "../config";
import {
  currentValue,
  discoverFields,
  formRoot,
  isEmptyValue,
  type LiveField,
} from "../discovery";
import { sleep, waitForSettle } from "../dom";
import { matchField } from "../match";
import { fillDropdown } from "./dropdown";
import { mainWorldSet } from "./main-world";
import { fillMultiselect } from "./multiselect";
import { fillNativeSelect } from "./native-select";
import {
  valuesEqual,
  type FillAttempt,
  type FillContext,
  type FillHandler,
} from "./shared";
import { fillText } from "./text";
import { fillCheckbox, fillRadio } from "./toggle";

/* ─── handler table ────────────────────────────────────────────────────── */

/** One handler per control type. The whole per-type logic lives in its module. */
function handlerFor(field: LiveField): FillHandler {
  switch (field.type) {
    case "text":
    case "textarea":
    case "number":
      return fillText;
    case "select":
      return field.el instanceof HTMLSelectElement ? fillNativeSelect : fillDropdown;
    case "dropdown":
    case "combobox":
      return fillDropdown;
    case "radio":
      return fillRadio;
    case "checkbox":
      return fillCheckbox;
    case "multiselect":
      // One handler, two shapes: it branches on <select multiple> vs chips.
      return fillMultiselect;
  }
}

/* ─── cancellation ─────────────────────────────────────────────────────── */

let cancelRequested = false;
let running = false;

/** Ask the current run to stop at the next safe point. */
export function cancelFill(): void {
  if (running) cancelRequested = true;
}

export function fillRunning(): boolean {
  return running;
}

/* ─── one field, with retries and a hard timeout ────────────────────────── */

async function withTimeout(
  work: Promise<FillAttempt>,
  ms: number,
): Promise<FillAttempt> {
  let timer = 0;
  const timeout = new Promise<FillAttempt>((resolve) => {
    timer = window.setTimeout(
      () => resolve({ ok: false, reason: "This field took too long to respond." }),
      ms,
    );
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    window.clearTimeout(timer);
  }
}

async function fillOne(
  field: LiveField,
  record: CapturedField,
  ctx: FillContext,
): Promise<FillAttempt> {
  const handler = handlerFor(field);
  let last: FillAttempt = { ok: false, reason: "Not attempted." };

  for (let attempt = 0; attempt < TIMING.retries; attempt++) {
    if (ctx.cancelled()) return { ok: false, reason: "Cancelled" };
    last = await withTimeout(
      handler(field, record.value, ctx).catch((err: unknown) => ({
        ok: false,
        reason: `Could not write this field (${String(err)}).`,
      })),
      TIMING.perFieldTimeoutMs,
    );
    if (last.ok) return last;
    await sleep(TIMING.retryBackoffMs[attempt] ?? 400);
  }
  return last;
}

/* ─── the run ──────────────────────────────────────────────────────────── */

export type FillHooks = {
  onProgress: (progress: FillProgress) => void;
};

export async function runFill(
  request: FillRequest,
  hooks: FillHooks,
): Promise<FillResult> {
  cancelRequested = false;
  running = true;

  const ctx: FillContext = {
    mainWorldSet,
    cancelled: () => cancelRequested,
  };

  const items: FillItem[] = [];
  const done = new Map<string, CapturedField>();
  /** Live-field keys this run routed a profile value into, across all passes. */
  const touched = new Set<string>();
  let remaining = request.fields.slice();
  const total = remaining.length;
  /** Passes that actually ran — not the loop counter, which ends one past. */
  let passesRun = 0;

  const report = (label: string) =>
    hooks.onProgress({
      running: true,
      done: items.length,
      total,
      label,
      pass: Math.max(passesRun, 1),
    });

  try {
    const root = formRoot();
    if (!root) {
      return finish(
        request.fields.map((f) => skipped(f, "No catalog form is open on this tab.")),
        false,
        0,
        total,
        [],
        hooks,
      );
    }

    report("Reading the form");

    for (let pass = 1; pass <= TIMING.maxPasses && remaining.length && !cancelRequested; pass++) {
      const live = discoverFields(formRoot());
      if (!live.length) break;
      passesRun = pass;

      // Claim the controls already written in an earlier pass, so a later record
      // can never be routed into a box that is already answered.
      const used = new Set<LiveField>();
      for (const record of done.values()) {
        const match = matchField(record, live, used);
        if (match) used.add(match.field);
      }

      let filledThisPass = 0;
      const stillMissing: CapturedField[] = [];

      for (const record of remaining) {
        if (cancelRequested) {
          stillMissing.push(record);
          continue;
        }

        const match = matchField(record, live, used);
        if (!match) {
          stillMissing.push(record); // may appear in a later pass
          continue;
        }
        used.add(match.field);
        touched.add(match.field.key);

        const field = match.field;
        report(field.label);

        const before = currentValue(field);
        if (valuesEqual(before, record.value)) {
          items.push({
            key: record.key,
            label: record.label,
            section: record.section,
            outcome: "skipped",
            reason: "Already matches your profile.",
            confidence: match.confidence,
          });
          done.set(record.key, record);
          continue;
        }

        if (!request.overwrite && !isEmptyValue(before)) {
          items.push({
            key: record.key,
            label: record.label,
            section: record.section,
            outcome: "skipped",
            reason: "Already had a value — turn on overwrite to replace it.",
            confidence: match.confidence,
          });
          done.set(record.key, record);
          continue;
        }

        const attempt = await fillOne(field, record, ctx);
        items.push({
          key: record.key,
          label: record.label,
          section: record.section,
          outcome: attempt.ok ? "filled" : cancelRequested ? "skipped" : "failed",
          reason: attempt.ok
            ? attempt.reason
            : cancelRequested
              ? "Stopped before this field."
              : attempt.reason,
          confidence: match.confidence,
        });
        done.set(record.key, record);
        if (attempt.ok) filledThisPass += 1;

        report(field.label);

        // Cascading fields: let Meesho finish reacting before the next write.
        await waitForSettle(root);
        await sleep(TIMING.betweenFieldsMs);
      }

      remaining = stillMissing;
      if (filledThisPass === 0) break; // nothing new appeared; more passes won't help
    }

    // Anything still unmatched simply is not on this form.
    for (const record of remaining) {
      items.push(
        skipped(
          record,
          cancelRequested ? "Stopped before this field." : "Not on this form.",
        ),
      );
    }

    return finish(items, cancelRequested, passesRun, total, unfilledRequired(touched), hooks);
  } finally {
    running = false;
    cancelRequested = false;
  }
}

/**
 * Read the form back and list the required boxes Meesho still has empty.
 *
 * Deliberately a fresh discovery rather than a filter over the run's own items:
 * the point is to catch the fields the profile never knew about, and those
 * appear nowhere in the run. `touched` only decides HOW each one is explained —
 * "your profile doesn't cover this" vs "we wrote here and it came back empty".
 */
function unfilledRequired(touched: Set<string>): UnfilledRequired[] {
  const root = formRoot();
  if (!root) return [];
  return discoverFields(root)
    .filter((field) => field.required && isEmptyValue(currentValue(field)))
    .map((field) => ({
      key: field.key,
      label: field.label,
      section: field.section,
      outsideProfile: !touched.has(field.key),
    }));
}

function skipped(record: CapturedField, reason: string): FillItem {
  return {
    key: record.key,
    label: record.label,
    section: record.section,
    outcome: "skipped",
    reason,
  };
}

function finish(
  items: FillItem[],
  cancelled: boolean,
  passes: number,
  total: number,
  stillRequired: UnfilledRequired[],
  hooks: FillHooks,
): FillResult {
  const result: FillResult = {
    items,
    filled: items.filter((i) => i.outcome === "filled").length,
    skipped: items.filter((i) => i.outcome === "skipped").length,
    failed: items.filter((i) => i.outcome === "failed").length,
    cancelled,
    passes,
    stillRequired,
  };
  hooks.onProgress({
    running: false,
    done: items.length,
    total,
    label: "",
    pass: passes,
  });
  return result;
}
