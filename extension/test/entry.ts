/**
 * Bundle entry for the accuracy tests (scripts/test-accuracy.mjs).
 *
 * It re-exports the REAL quoting modules — nothing is reimplemented for the
 * test, so the assertions run against the code that ships.
 */
export { MeeshoApiError, quoteImage } from "@/content/meesho-api";
export {
  pingProbe,
  pricingContext,
  pricingTemplate,
  probeInstalled,
  watchPanelCalls,
} from "@/content/panel-context";
export {
  calibrate,
  comparableBasis,
  isCalibrated,
  panelFigure,
  savingBetween,
} from "@/lib/calibration";
export { buildVariantSpecs, describeSpec } from "@/lib/image/variants";
export { productRectFor, sourceRectFor, stickerRectFor } from "@/lib/image/compositor";
/* Part 2 — option matching. Pure string logic, so it is testable in Node even
 * though the rest of the fill engine needs a real browser (see the autofill lab). */
export { bestOption, optionMatches } from "@/content/meesho/fill/shared";
