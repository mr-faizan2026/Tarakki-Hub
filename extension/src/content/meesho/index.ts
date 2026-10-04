/**
 * ════════════════════════════════════════════════════════════════════════════
 *  MEESHO ADAPTER — the only part of the extension coupled to Meesho's DOM.
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Part 1 had this as a single file. Part 2 needed form discovery, control-type
 *  detection and a fill handler per type, so it became a folder — same rule, more
 *  rooms:
 *
 *    config.ts       ⭐ EVERY Meesho-specific selector, label word and timing.
 *                       When Meesho changes its UI, this is the file to edit.
 *    dom.ts            generic DOM plumbing (visibility, shadow roots, waiting,
 *                       realistic clicks). Knows nothing about Meesho.
 *    shipping.ts       Feature A — read the live shipping charge (Part 1).
 *    images.ts         Feature C — put an image in the front-image input (Part 1).
 *    discovery.ts      find the catalog form; list its fields with label, section,
 *                       type, value, occurrence. Everything in Part 2 rests on it.
 *    match.ts          a saved field → the control on the page in front of us.
 *    highlight.ts      scroll to a field and ring it, for the result list.
 *    fill/             the engine and one handler per control type.
 *
 *  Meesho's internal API (the live per-image shipping quote) is separate again,
 *  in ../meesho-api.ts.
 *
 *  ── IF SOMETHING BREAKS ───────────────────────────────────────────────────
 *  Open the side panel's **Field scan** view on the real form (dev builds; see
 *  DEV_TOOLS in lib/config.ts). It lists every control the adapter sees. Then
 *  follow the "WHEN SOMETHING BREAKS, START HERE" table at the top of config.ts.
 */

export { readShipping, type ShippingHit } from "./shipping";
export { applyImageToListing } from "./images";
export {
  categoryPath,
  currentValue,
  discoverFields,
  formRoot,
  formStatus,
  toCaptured,
  toScanned,
  type LiveField,
} from "./discovery";
export { confidenceFor } from "./match";
export { highlightField } from "./highlight";
export { cancelFill, fillRunning, runFill, type FillHooks } from "./fill";
