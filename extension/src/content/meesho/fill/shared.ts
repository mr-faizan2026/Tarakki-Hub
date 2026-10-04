/**
 * The contract every fill handler implements, plus the helpers they share.
 *
 * ── THE ONE RULE ───────────────────────────────────────────────────────────
 * A handler may only return `ok: true` after READING THE VALUE BACK off the page
 * and finding what it wrote. Nothing is reported as filled on the strength of
 * having dispatched an event: React can ignore a synthetic write, a dropdown can
 * close without selecting, and a validated field can revert on blur. A seller who
 * trusts "Filled 27" and submits a half-empty catalog is worse off than one told
 * "Needs attention 3".
 */

import type { FieldValue } from "@/lib/autofill-types";
import type { LiveField } from "../discovery";
import { normalizeLabel, tidy } from "../dom";

/** Services the engine lends to each handler. */
export type FillContext = {
  /**
   * Re-set an element's value from the PAGE's own JavaScript world.
   *
   * Some React setups install their value tracker in a way that ignores a write
   * made from the extension's isolated world. Running the identical native-setter
   * write inside the page (chrome.scripting, world: "MAIN" — routed through the
   * background, which is the only context that may call it) gets past that. It is
   * a fallback, never the first move: the isolated-world write works for almost
   * every field and involves no extra machinery.
   */
  mainWorldSet: (el: HTMLElement, value: string) => Promise<boolean>;
  /** True once the seller has pressed Cancel. Handlers bail out politely. */
  cancelled: () => boolean;
};

export type FillAttempt = {
  ok: boolean;
  /** Plain English, shown in the result list. */
  reason: string;
};

export type FillHandler = (
  field: LiveField,
  value: FieldValue,
  ctx: FillContext,
) => Promise<FillAttempt>;

export const ok = (reason: string): FillAttempt => ({ ok: true, reason });
export const fail = (reason: string): FillAttempt => ({ ok: false, reason });

/* ─── comparing values ─────────────────────────────────────────────────── */

/** One saved value as text, for writing into a single-value control. */
export function asText(value: FieldValue): string {
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

/** One saved value as a list, for a multi-value control. */
export function asList(value: FieldValue): string[] {
  if (Array.isArray(value)) return value.map((v) => tidy(v)).filter(Boolean);
  if (typeof value === "boolean") return value ? ["yes"] : [];
  return tidy(value) ? [tidy(value)] : [];
}

/**
 * Do two values mean the same thing? Compared the way a person would: case and
 * spacing ignored, list order ignored. Used both to skip needless writes and to
 * verify the ones we make.
 */
export function valuesEqual(a: FieldValue, b: FieldValue): boolean {
  if (typeof a === "boolean" || typeof b === "boolean") return Boolean(a) === Boolean(b);
  if (Array.isArray(a) || Array.isArray(b)) {
    const la = asList(a).map(normalizeLabel).sort();
    const lb = asList(b).map(normalizeLabel).sort();
    return la.length === lb.length && la.every((v, i) => v === lb[i]);
  }
  return normalizeLabel(String(a)) === normalizeLabel(String(b));
}

/**
 * Does an option's text answer the wanted value? Exact first, then prefix, then
 * containment — because Meesho writes options like "Cotton Blend (Mixed)" for a
 * saved "Cotton Blend", and "1 N" for "1".
 */
export function optionMatches(optionText: string, wanted: string): boolean {
  const o = normalizeLabel(optionText);
  const w = normalizeLabel(wanted);
  if (!o || !w) return false;
  return o === w || o.startsWith(w) || prefixOfWanted(o, w) || containsWord(o, w);
}

/**
 * Does `needle` appear in `haystack` as a WHOLE WORD?
 *
 * Bare substring containment is what makes the loosest rung dangerous, and it is
 * dangerous in proportion to how short the saved value is. A size list asking for
 * "M" scored a hit on "Bamboo" — "bamboo" contains an m — and because that was
 * the only candidate scoring at all, bestOption returned it as the answer. In a
 * run against the lab, Fabric's options were still on screen when Size was
 * filled, and the engine ticked Bamboo for M: a value the seller never chose,
 * written into their catalog and reported as filled.
 *
 * A word boundary keeps every case containment was added for — "Dark Blue" for a
 * saved "Blue", "Round Neck" for "Neck" — and refuses the letter-inside-a-word
 * coincidences. A refusal here costs the seller one field to fill by hand; a
 * wrong size costs them a return.
 */
function containsWord(haystack: string, needle: string): boolean {
  if (!needle || !haystack) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\W)${escaped}($|\\W)`).test(haystack);
}

/**
 * The option is a leading piece of the wanted value ("Cotton" offered for a saved
 * "Cotton Blend"). Guarded by length for the same reason as above: without it the
 * one-letter option "M" answers a wanted "Medium".
 */
function prefixOfWanted(option: string, wanted: string): boolean {
  return option.length >= 3 && wanted.startsWith(option);
}

/** Rank candidate options so the closest wording wins. */
export function bestOption<T>(
  candidates: T[],
  textOfCandidate: (c: T) => string,
  wanted: string,
): T | null {
  const w = normalizeLabel(wanted);
  if (!w) return null;
  let best: T | null = null;
  let bestScore = -1;
  for (const candidate of candidates) {
    const o = normalizeLabel(textOfCandidate(candidate));
    if (!o) continue;
    let score = -1;
    if (o === w) score = 3;
    else if (o.startsWith(w)) score = 2;
    else if (containsWord(o, w) || prefixOfWanted(o, w)) score = 1;
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return bestScore >= 1 ? best : null;
}
