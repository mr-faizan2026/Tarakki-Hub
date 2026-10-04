/**
 * Bundle entry for the adapter fixture tests (scripts/test-fixtures.mjs).
 *
 * It re-exports the REAL adapter — nothing is reimplemented for the test, so a
 * regression in shipped discovery or shipping-read code fails here.
 *
 * Deliberately excludes the fill engine: writing into a form needs real event
 * dispatch, focus and a layout engine that jsdom does not have, and a fill test
 * that passes against a fake DOM would be worse than no fill test. That half is
 * exercised by the autofill lab (`npm run dev:preview`) against real markup.
 */
export {
  categoryPath,
  discoverFields,
  formRoot,
  formStatus,
  toCaptured,
  toScanned,
} from "@/content/meesho/discovery";
export { readShipping } from "@/content/meesho/shipping";
export { matchField } from "@/content/meesho/match";
export { normalizeLabel, similarity } from "@/content/meesho/dom";
export {
  adapterConfigVersion,
  applyAdapterConfig,
  FORM_COVERAGE,
  SHIPPING_LABELS,
  TIMING,
} from "@/content/meesho/config";

/* Part 3 — pure logic that needs no DOM, bundled here so one harness covers it. */
export { validateAdapterConfig, validateKillSwitches } from "@/lib/adapter-schema";
export { compareVersions, isBelow } from "@/lib/version";
export { sanitisePath } from "@/lib/health";
export { featureState } from "@/lib/kill-switches";
