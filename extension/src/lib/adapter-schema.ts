import { z } from "zod";
import type { AdapterConfigPayload, KillSwitchMap } from "./backend-types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  REMOTE ADAPTER CONFIG — fetch it, prove it, cache it. Never run it.
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  ── THE SECURITY RULE, STATED ONCE ────────────────────────────────────────
 *  Everything that arrives here is DATA. It becomes:
 *    • strings passed to querySelectorAll,
 *    • lower-cased words compared against visible page text,
 *    • numbers used as thresholds and timeouts,
 *    • ONE string compiled with `new RegExp(source, "i")`.
 *
 *  It is never passed to eval, never to Function(), never inserted into a
 *  <script>, never used to build a URL that is fetched, and never written into
 *  the page. The MV3 CSP would block injected script anyway, but the real
 *  guarantee is that there is no code path from this payload to execution —
 *  verified by there being no string→code call in the whole extension except the
 *  one RegExp below, which is wrapped and falls back on a bad pattern.
 *
 *  A remote config is a lovely vector for whoever can write to the admin
 *  settings table. Treating it as data means the worst a compromised admin
 *  account can do is break selector matching, which the kill switches already let
 *  them do openly.
 *
 *  ── WHY ZOD AND NOT A HAND-ROLLED CHECK ───────────────────────────────────
 *  Because the failure mode of a hand-rolled check is "the one field I forgot
 *  arrives as an object and discovery throws inside a MutationObserver on the
 *  seller's form". The schema below rejects the whole payload on anything it
 *  doesn't recognise as the right SHAPE, and the caller falls back to bundled
 *  defaults — which is always a working extension, just one with last week's
 *  selectors. This module is only ever loaded in the background worker, so zod
 *  stays out of the side panel's bundle.
 *
 *  ── FORWARD COMPATIBILITY ─────────────────────────────────────────────────
 *  Unknown keys are STRIPPED, not rejected. A server that has learned a new
 *  adapter key must not brick every extension that predates it: the old build
 *  ignores the key and keeps using its default for whatever that key controls.
 */

/* ─── the schema ────────────────────────────────────────────────────────── */

/** A selector or label list: non-empty, all non-blank strings, capped. */
const stringList = z
  .array(z.string().trim().min(1).max(300))
  .min(1)
  .max(120);

const bounded = (lo: number, hi: number) => z.number().finite().gte(lo).lte(hi);

/**
 * Bounds are rails, not tuning advice. They exist so a typo (a settle window of
 * 350_000 instead of 350) degrades to "rejected, defaults kept" rather than to a
 * fill that appears to hang for six minutes.
 */
const AdapterConfigSchema = z.object({
  version: bounded(0, 1_000_000).optional(),

  shipping: z
    .object({
      labels: stringList.optional(),
      negative: z.array(z.string().trim().min(1).max(300)).max(120).optional(),
      maxClimb: bounded(1, 12).optional(),
    })
    .optional(),

  form: z
    .object({
      anchorText: stringList.optional(),
      excludeSelectors: stringList.optional(),
      minControls: bounded(1, 50).optional(),
      /** Distinct FORM_ANCHOR_TEXT words needed before a container is a form. */
      minAnchors: bounded(1, 8).optional(),
      coverage: z
        .object({
          preferred: bounded(0.1, 1).optional(),
          fallback: bounded(0.1, 1).optional(),
        })
        .optional(),
    })
    .optional(),

  labels: z
    .object({
      maxLen: bounded(10, 400).optional(),
      sectionMaxLen: bounded(10, 400).optional(),
      defaultSection: z.string().trim().min(1).max(60).optional(),
      placeholderNoise: z.string().min(1).max(500).optional(),
    })
    .optional(),

  dropdown: z
    .object({
      selectors: stringList.optional(),
      listbox: stringList.optional(),
      option: stringList.optional(),
      confirmLabels: stringList.optional(),
      optionFallbackMaxLen: bounded(5, 400).optional(),
    })
    .optional(),

  timing: z
    .object({
      retries: bounded(1, 10).optional(),
      perFieldTimeoutMs: bounded(500, 60_000).optional(),
      betweenFieldsMs: bounded(0, 5_000).optional(),
      settleQuietMs: bounded(50, 10_000).optional(),
      settleMaxMs: bounded(100, 30_000).optional(),
      optionWaitMs: bounded(100, 20_000).optional(),
      maxPasses: bounded(1, 12).optional(),
    })
    .optional(),

  fuzzyThreshold: bounded(0.5, 1).optional(),
});

const KillSwitchSchema = z.record(
  z.string().min(1).max(40),
  z.object({
    enabled: z.boolean(),
    message: z.string().trim().max(400).optional(),
  }),
);

/**
 * Validate a payload. Returns the cleaned config, or null with the reason —
 * the reason is reported as a health event so a broken config is visible in
 * /admin rather than silently ignored on every install.
 */
export function validateAdapterConfig(
  raw: unknown,
): { ok: true; config: AdapterConfigPayload } | { ok: false; reason: string } {
  const parsed = AdapterConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first?.path?.join(".") || "(root)";
    return { ok: false, reason: `${path}: ${first?.message ?? "invalid"}`.slice(0, 160) };
  }

  // One last check the schema can't do: does the placeholder pattern compile?
  // An invalid RegExp source is a perfectly valid string.
  const noise = parsed.data.labels?.placeholderNoise;
  if (noise !== undefined) {
    try {
      new RegExp(noise, "i");
    } catch {
      return { ok: false, reason: "labels.placeholderNoise is not a valid regular expression" };
    }
  }

  return { ok: true, config: parsed.data as AdapterConfigPayload };
}

export function validateKillSwitches(raw: unknown): KillSwitchMap {
  const parsed = KillSwitchSchema.safeParse(raw);
  // An unparseable switch map means "nothing is switched off", which is the only
  // safe default: the alternative — treating a malformed map as "everything is
  // off" — would silently disable a paying seller's whole toolkit.
  return parsed.success ? (parsed.data as KillSwitchMap) : {};
}

