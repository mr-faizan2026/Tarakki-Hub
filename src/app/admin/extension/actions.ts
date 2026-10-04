"use server";

import { revalidatePath } from "next/cache";
import { authorizeAdminAction, logAdminAction } from "@/lib/admin";
import type { Json } from "@/lib/supabase/types";
import type { AdapterConfigPayload, KillSwitchMap } from "@/lib/extension-protocol";

/**
 * Server actions behind /admin/extension — the controls that change how every
 * installed extension behaves WITHOUT shipping a new release.
 *
 * ── THE ONE RULE ──────────────────────────────────────────────────────────
 * Everything written here is DATA. The extension validates it, merges the valid
 * parts over its bundled defaults and uses them as selectors, label words and
 * timings. Nothing stored here is ever evaluated as code — not by the extension,
 * not by the content script, not by the page. If a future change makes that
 * untrue, it is a security bug, not a feature.
 *
 * ── WHY THE VERSION BUMP IS AUTOMATIC ─────────────────────────────────────
 * Installed extensions re-fetch the config when a heartbeat reports a version
 * newer than their cached one. An admin who edits the selectors and forgets to
 * bump reaches nobody until each seller's next browser restart — in the middle of
 * a Meesho UI break, that is the difference between a ten-minute fix and a day of
 * support. So saving the config bumps the version itself.
 */

type ActionResult = { ok: true } | { ok: false; error: string };

const SETTINGS = {
  adapterConfig: "adapter_config",
  killSwitches: "kill_switches",
  minVersion: "ext_min_version",
  latestVersion: "ext_latest_version",
  deviceLimit: "ext_device_limit",
} as const;

/** A dotted version, 1–4 numeric parts. Matches what the extension compares. */
const VERSION_RE = /^\d+(\.\d+){0,3}$/;

/** Keys the adapter config may contain. Anything else is rejected, not ignored —
 *  a typo'd key that silently does nothing is a selector fix that never lands. */
const ADAPTER_KEYS = new Set([
  "version",
  "shipping",
  "form",
  "labels",
  "dropdown",
  "timing",
  "fuzzyThreshold",
]);

const FEATURES = ["live_shipping", "image_generator", "autofill"] as const;

/* ─── adapter config ───────────────────────────────────────────────────── */

/**
 * Validate and save the adapter config.
 *
 * Validation here is structural: the shape is right, the arrays hold strings, the
 * numbers are numbers, and `placeholderNoise` compiles as a RegExp. The extension
 * validates again on receipt and falls back to bundled defaults on anything it
 * doesn't like — but an admin pasting JSON deserves to be told what is wrong
 * while they are looking at it, not to find out from a seller three days later.
 */
export async function saveAdapterConfig(raw: string): Promise<ActionResult> {
  const gate = await authorizeAdminAction();
  if (!gate.ok) return gate;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { ok: false, error: `That isn't valid JSON — ${(err as Error).message}` };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "The config must be a JSON object." };
  }

  const config = parsed as Record<string, unknown>;
  const unknown = Object.keys(config).filter((k) => !ADAPTER_KEYS.has(k));
  if (unknown.length) {
    return {
      ok: false,
      error: `Unknown key${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}. Allowed: ${[...ADAPTER_KEYS].join(", ")}.`,
    };
  }

  const problem = validateAdapter(config);
  if (problem) return { ok: false, error: problem };

  // Bump the version so installed extensions actually pick this up.
  const { data: current } = await gate.db
    .from("app_settings")
    .select("value")
    .eq("key", SETTINGS.adapterConfig)
    .maybeSingle();
  const currentVersion = Number(
    (current?.value as AdapterConfigPayload | null)?.version ?? 0,
  );
  const nextVersion = Math.max(currentVersion, Number(config.version ?? 0)) + 1;
  const value = { ...config, version: nextVersion } as unknown as Json;

  const { error } = await gate.db
    .from("app_settings")
    .upsert({ key: SETTINGS.adapterConfig, value, updated_at: new Date().toISOString() });
  if (error) return { ok: false, error: "Couldn't save the config." };

  await logAdminAction(gate.db, gate.admin, "extension.adapter_config", null, {
    version: nextVersion,
  });
  revalidatePath("/admin/extension");
  return { ok: true };
}

/**
 * Structural validation, one section at a time. Deliberately plain: a clever
 * validator is one nobody extends when a new adapter key appears.
 *
 * Returns the first problem as a sentence an admin can act on, or null.
 */
function validateAdapter(config: Record<string, unknown>): string | null {
  const strings = (key: string, value: unknown): string | null =>
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((v) => typeof v === "string" && v.trim())
      ? null
      : `${key} must be a non-empty array of non-empty strings.`;

  const num = (key: string, value: unknown, lo: number, hi: number): string | null =>
    typeof value === "number" && Number.isFinite(value) && value >= lo && value <= hi
      ? null
      : `${key} must be a number between ${lo} and ${hi}.`;

  /** null = the key is absent; a string = the problem; an object = check inside. */
  const objectAt = (key: string): Record<string, unknown> | string | null => {
    const value = config[key];
    if (value === undefined) return null;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return `${key} must be an object.`;
    }
    return value as Record<string, unknown>;
  };

  if (config.version !== undefined) {
    const e = num("version", config.version, 0, 1_000_000);
    if (e) return e;
  }
  if (config.fuzzyThreshold !== undefined) {
    const e = num("fuzzyThreshold", config.fuzzyThreshold, 0.5, 1);
    if (e) return e;
  }

  /* shipping — the live rupee read (Part 1). */
  const shipping = objectAt("shipping");
  if (typeof shipping === "string") return shipping;
  if (shipping) {
    if (shipping.labels !== undefined) {
      const e = strings("shipping.labels", shipping.labels);
      if (e) return e;
    }
    if (shipping.negative !== undefined) {
      const e = strings("shipping.negative", shipping.negative);
      if (e) return e;
    }
    if (shipping.maxClimb !== undefined) {
      const e = num("shipping.maxClimb", shipping.maxClimb, 1, 12);
      if (e) return e;
    }
  }

  /* form — catalog-form discovery (Part 2). */
  const form = objectAt("form");
  if (typeof form === "string") return form;
  if (form) {
    if (form.anchorText !== undefined) {
      const e = strings("form.anchorText", form.anchorText);
      if (e) return e;
    }
    if (form.excludeSelectors !== undefined) {
      const e = strings("form.excludeSelectors", form.excludeSelectors);
      if (e) return e;
    }
    if (form.minControls !== undefined) {
      const e = num("form.minControls", form.minControls, 1, 50);
      if (e) return e;
    }
    if (form.minAnchors !== undefined) {
      const e = num("form.minAnchors", form.minAnchors, 1, 8);
      if (e) return e;
    }
    if (form.coverage !== undefined) {
      const cov = form.coverage;
      if (!cov || typeof cov !== "object" || Array.isArray(cov)) {
        return "form.coverage must be an object.";
      }
      const c = cov as Record<string, unknown>;
      for (const key of ["preferred", "fallback"] as const) {
        if (c[key] !== undefined) {
          const e = num(`form.coverage.${key}`, c[key], 0.1, 1);
          if (e) return e;
        }
      }
    }
  }

  /* labels and sections. */
  const labels = objectAt("labels");
  if (typeof labels === "string") return labels;
  if (labels) {
    if (labels.maxLen !== undefined) {
      const e = num("labels.maxLen", labels.maxLen, 10, 400);
      if (e) return e;
    }
    if (labels.sectionMaxLen !== undefined) {
      const e = num("labels.sectionMaxLen", labels.sectionMaxLen, 10, 400);
      if (e) return e;
    }
    if (labels.defaultSection !== undefined && typeof labels.defaultSection !== "string") {
      return "labels.defaultSection must be a string.";
    }
    if (labels.placeholderNoise !== undefined) {
      if (typeof labels.placeholderNoise !== "string") {
        return "labels.placeholderNoise must be a string holding a regular expression.";
      }
      try {
        new RegExp(labels.placeholderNoise, "i");
      } catch (err) {
        return `labels.placeholderNoise isn't a valid regular expression — ${(err as Error).message}`;
      }
    }
  }

  /* custom dropdowns. */
  const dropdown = objectAt("dropdown");
  if (typeof dropdown === "string") return dropdown;
  if (dropdown) {
    for (const key of ["selectors", "listbox", "option", "confirmLabels"] as const) {
      if (dropdown[key] !== undefined) {
        const e = strings(`dropdown.${key}`, dropdown[key]);
        if (e) return e;
      }
    }
    if (dropdown.optionFallbackMaxLen !== undefined) {
      const e = num("dropdown.optionFallbackMaxLen", dropdown.optionFallbackMaxLen, 5, 400);
      if (e) return e;
    }
  }

  /* timing. The bounds are sanity rails, not tuning advice — a settle window of
   * half an hour is not a slow fill, it is a hung one. */
  const timing = objectAt("timing");
  if (typeof timing === "string") return timing;
  if (timing) {
    const bounds: Record<string, [number, number]> = {
      retries: [1, 10],
      perFieldTimeoutMs: [500, 60_000],
      betweenFieldsMs: [0, 5_000],
      settleQuietMs: [50, 10_000],
      settleMaxMs: [100, 30_000],
      optionWaitMs: [100, 20_000],
      maxPasses: [1, 12],
    };
    const extra = Object.keys(timing).filter((k) => !(k in bounds));
    if (extra.length) {
      return `Unknown timing key${extra.length > 1 ? "s" : ""}: ${extra.join(", ")}.`;
    }
    for (const [key, [lo, hi]] of Object.entries(bounds)) {
      if (timing[key] !== undefined) {
        const e = num(`timing.${key}`, timing[key], lo, hi);
        if (e) return e;
      }
    }
  }

  return null;
}

/* ─── kill switches ────────────────────────────────────────────────────── */

/**
 * Turn one feature off for every installed extension, with the message the panel
 * shows inside that feature's own card.
 *
 * A disabled feature does NOTHING on the page — no DOM reads, no writes, no
 * Meesho calls. That is the point: when Meesho changes something and the adapter
 * starts getting it wrong, this stops the wrongness in minutes instead of waiting
 * out a Web Store review.
 */
export async function saveKillSwitches(
  input: { feature: string; enabled: boolean; message: string }[],
): Promise<ActionResult> {
  const gate = await authorizeAdminAction();
  if (!gate.ok) return gate;

  const map: KillSwitchMap = {};
  for (const row of input) {
    if (!FEATURES.includes(row.feature as (typeof FEATURES)[number])) continue;
    const message = row.message.trim().slice(0, 300);
    map[row.feature] = {
      enabled: row.enabled,
      ...(message ? { message } : {}),
    };
  }

  const { error } = await gate.db.from("app_settings").upsert({
    key: SETTINGS.killSwitches,
    value: map as unknown as Json,
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: "Couldn't save the kill switches." };

  await logAdminAction(gate.db, gate.admin, "extension.kill_switches", null, {
    disabled: Object.entries(map)
      .filter(([, v]) => v && !v.enabled)
      .map(([k]) => k),
  });
  revalidatePath("/admin/extension");
  return { ok: true };
}

/* ─── version gates + device limit ─────────────────────────────────────── */

/**
 * `min_version` is a hard floor: below it the panel shows a blocking "please
 * update" screen and nothing else runs. `latest_version` is advisory — a quiet
 * note. Set latest_version only AFTER the Web Store has approved the build;
 * pointing sellers at a version that isn't published yet is worse than silence.
 */
export async function saveVersionGates(input: {
  minVersion: string;
  latestVersion: string;
  deviceLimit: string;
}): Promise<ActionResult> {
  const gate = await authorizeAdminAction();
  if (!gate.ok) return gate;

  const min = input.minVersion.trim();
  const latest = input.latestVersion.trim();
  if (!VERSION_RE.test(min)) {
    return { ok: false, error: "Minimum version must look like 1.2.3." };
  }
  if (!VERSION_RE.test(latest)) {
    return { ok: false, error: "Latest version must look like 1.2.3." };
  }
  if (compareVersions(min, latest) > 0) {
    return {
      ok: false,
      error: "The minimum version can't be newer than the latest published one — every seller would be blocked.",
    };
  }

  const limit = Number.parseInt(input.deviceLimit, 10);
  if (!Number.isFinite(limit) || limit < 1 || limit > 50) {
    return { ok: false, error: "The device limit must be between 1 and 50." };
  }

  const now = new Date().toISOString();
  const { error } = await gate.db.from("app_settings").upsert([
    { key: SETTINGS.minVersion, value: min as unknown as Json, updated_at: now },
    { key: SETTINGS.latestVersion, value: latest as unknown as Json, updated_at: now },
    { key: SETTINGS.deviceLimit, value: limit as unknown as Json, updated_at: now },
  ]);
  if (error) return { ok: false, error: "Couldn't save those settings." };

  await logAdminAction(gate.db, gate.admin, "extension.versions", null, {
    min_version: min,
    latest_version: latest,
    device_limit: limit,
  });
  revalidatePath("/admin/extension");
  return { ok: true };
}

/** Numeric, part-by-part. "0.10.0" is newer than "0.9.0". */
function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}
