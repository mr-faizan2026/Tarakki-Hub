import type { QuoteBasis } from "./messages";

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  CALIBRATION — the one rule the whole feature now hangs on.
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Before any figure is shown, we quote the seller's OWN photo and check it
 *  against the figure their supplier panel is displaying for that same photo.
 *
 *    • They agree      → every figure in the run is the panel's own arithmetic
 *                        with one thing changed, so it can be shown.
 *    • They disagree   → our request is answering a different question. Not a
 *                        rounding difference, not something to caveat: every
 *                        number in the run is void, including the savings.
 *    • No panel figure → nothing to check against, which is the same as not
 *                        knowing. Also void.
 *
 *  This exists because the alternative was shipped and was worse than useless:
 *  a seller was shown "₹149 · ₹139 less than your photo" while their panel
 *  priced the same photo at ₹110 — the "saving" was ₹39 of extra cost, stated
 *  with a live-price badge and charged a credit. A wrong number with a
 *  confident label is not a smaller version of a right one.
 *
 *  Lives in lib/ rather than inside the side-panel component so it can be
 *  tested directly (scripts/test-accuracy.mjs) — this rule must never quietly
 *  regress into a warning.
 */

export type Calibration =
  /** The seller's own photo hasn't produced a figure yet. */
  | { status: "pending" }
  /** Our figure reproduces the panel's. The run may show prices. */
  | { status: "ok"; panel: number; ours: number }
  /** Our figure contradicts the panel's. Show nothing, charge nothing. */
  | { status: "mismatch"; panel: number; ours: number }
  /** The panel isn't showing a figure to check against. Same treatment. */
  | { status: "no-reference"; ours: number };

/**
 * `ours` is our quote for the seller's own photo; `panel` is what their panel
 * shows for it. Exact equality is the bar: both are the same integer rupee
 * field from the same Meesho endpoint, so anything else is a real difference.
 */
export function calibrate(ours: number | null, panel: number | null): Calibration {
  if (ours == null) return { status: "pending" };
  if (panel == null) return { status: "no-reference", ours };
  return panel === ours
    ? { status: "ok", panel, ours }
    : { status: "mismatch", panel, ours };
}

/** Only a calibrated run may show a price or claim a saving. */
export function isCalibrated(calibration: Calibration): boolean {
  return calibration.status === "ok";
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  COMPARABILITY — the second half of the same lesson.
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Calibration proves our request reproduces the panel's. It does NOT prove
 *  that two figures may be subtracted from each other, and that is the step the
 *  ₹288 incident actually failed: the variants were priced against a matched
 *  product and the baseline they were compared with was not. Both numbers were
 *  real. The subtraction was meaningless, and it read "₹139 less" while being
 *  ₹39 more.
 *
 *  So a saving is not arithmetic on two numbers, it is arithmetic on two
 *  numbers that answered the same question. `savingBetween` is the only way the
 *  UI is allowed to do that subtraction, and it returns null rather than a
 *  wrong answer when the bases differ.
 */

/** May these two figures be subtracted at all? Only if they asked the same. */
export function comparableBasis(a: QuoteBasis, b: QuoteBasis): boolean {
  return a === b;
}

/**
 * `baseline − candidate` in rupees (positive = cheaper than the seller's photo),
 * or null when the two figures are not answers to the same question.
 *
 * Null is not "no saving" — it is "we must not claim one". Callers show nothing
 * rather than a number they can't stand behind.
 */
export function savingBetween(
  baseline: { shipping: number; basis: QuoteBasis } | null,
  candidate: { shipping: number; basis: QuoteBasis } | null,
): number | null {
  if (!baseline || !candidate) return null;
  if (!comparableBasis(baseline.basis, candidate.basis)) return null;
  return baseline.shipping - candidate.shipping;
}

/**
 * The panel's own figure, from the most authoritative source available: the
 * response to the very request we mirrored, then the panel context, then the
 * number rendered on the page. The first two are the same field Meesho returned
 * to the panel; the page read is corroboration for when the capture is older
 * than the seller's last edit.
 */
export function panelFigure(...candidates: (number | null | undefined)[]): number | null {
  for (const value of candidates) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}
