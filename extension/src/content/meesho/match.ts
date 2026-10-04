/**
 * Matching a SAVED field to a control on the page in front of us.
 *
 * The identity we saved is what the seller sees (section + label + which
 * occurrence), because that is the only thing about a React SPA that survives a
 * deploy. This module walks that identity down four rungs, stopping at the first
 * that gives exactly one answer:
 *
 *   exact  — same section, same normalised label, same occurrence.
 *   label  — same normalised label + occurrence, section moved (Meesho renamed a
 *            heading, or the field was regrouped).
 *   attrs  — a stable attribute agrees (name / id / data-testid / aria-label).
 *            Secondary by design: Meesho supplies these inconsistently, so they
 *            confirm a field, they do not define one.
 *   fuzzy  — tolerant label comparison (see similarity()), accepted only when
 *            ONE candidate clears FUZZY_THRESHOLD. Two plausible candidates mean
 *            we do not know, and a field written into the wrong box is worse
 *            than one the seller fills by hand.
 *
 * A control is never claimed twice: `used` is threaded through so two saved
 * fields cannot both land on the same box.
 */

import type { CapturedField, MatchConfidence } from "@/lib/autofill-types";
import { FUZZY_THRESHOLD } from "./config";
import type { LiveField } from "./discovery";
import { similarity } from "./dom";

export type FieldMatch = {
  field: LiveField;
  confidence: MatchConfidence;
};

function attrsAgree(record: CapturedField, live: LiveField): boolean {
  const a = record.attrs;
  if (!a) return false;
  const b = live.attrs;
  if (a.testId && b.testId && a.testId === b.testId) return true;
  if (a.name && b.name && a.name === b.name) return true;
  if (a.id && b.id && a.id === b.id) return true;
  if (a.ariaLabel && b.ariaLabel && a.ariaLabel === b.ariaLabel) return true;
  return false;
}

/**
 * Types that can stand in for one another. Meesho has swapped a native <select>
 * for a React dropdown and back again; a saved "select" should still fill the
 * combobox that replaced it. What must NOT interchange is a value shape —
 * a boolean can never fill a text box.
 */
const INTERCHANGEABLE: Record<string, string[]> = {
  text: ["text", "textarea", "number", "combobox"],
  textarea: ["textarea", "text"],
  number: ["number", "text"],
  select: ["select", "dropdown", "combobox"],
  dropdown: ["dropdown", "select", "combobox"],
  combobox: ["combobox", "dropdown", "select", "text"],
  radio: ["radio", "select", "dropdown"],
  checkbox: ["checkbox"],
  multiselect: ["multiselect"],
};

function typeCompatible(record: CapturedField, live: LiveField): boolean {
  if (record.type === live.type) return true;
  return (INTERCHANGEABLE[record.type] ?? [record.type]).includes(live.type);
}

/** Find the one control on this page that corresponds to a saved field. */
export function matchField(
  record: CapturedField,
  live: LiveField[],
  used: Set<LiveField>,
): FieldMatch | null {
  const free = live.filter((f) => !used.has(f) && typeCompatible(record, f));
  if (!free.length) return null;

  // 1) exact — section + label + occurrence
  const exact = free.find(
    (f) =>
      f.section === record.section &&
      f.normalizedLabel === record.normalizedLabel &&
      f.occurrence === record.occurrence,
  );
  if (exact) return { field: exact, confidence: "exact" };

  // 2) label + occurrence, any section
  const sameLabel = free.filter((f) => f.normalizedLabel === record.normalizedLabel);
  const byOccurrence = sameLabel.find((f) => f.occurrence === record.occurrence);
  if (byOccurrence) return { field: byOccurrence, confidence: "label" };
  if (sameLabel.length === 1) return { field: sameLabel[0], confidence: "label" };

  // 3) stable attributes agree
  const byAttrs = free.filter((f) => attrsAgree(record, f));
  if (byAttrs.length === 1) return { field: byAttrs[0], confidence: "attrs" };

  // 4) fuzzy label — only when a single candidate clears the bar
  const scored = free
    .map((f) => ({ f, score: similarity(record.normalizedLabel, f.normalizedLabel) }))
    .filter((c) => c.score >= FUZZY_THRESHOLD)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 1) return { field: scored[0].f, confidence: "fuzzy" };
  if (scored.length > 1 && scored[0].score - scored[1].score > 0.1) {
    return { field: scored[0].f, confidence: "fuzzy" };
  }

  return null;
}

/**
 * Confidence for display only — used by the field-scan dev view to show how well
 * each live control lines up with the selected profile.
 */
export function confidenceFor(
  live: LiveField,
  records: CapturedField[],
): MatchConfidence {
  for (const record of records) {
    const match = matchField(record, [live], new Set());
    if (match) return match.confidence;
  }
  return "none";
}
