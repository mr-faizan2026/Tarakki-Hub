/**
 * Feature C — put a generated image into the listing's front-image input.
 *
 * Unchanged behaviour from Part 1; it moved into this folder when the adapter
 * grew from one file into one module per concern. Its tunables
 * (FRONT_IMAGE_INPUT_IDS, NOT_FRONT_IMAGE_IDS, IMAGE_INPUT_HINTS) are in
 * config.ts.
 *
 * ── DELIBERATELY ABSENT: re-pricing the listing ────────────────────────────
 * Applying a new front image does not make Meesho re-price; the seller has to
 * un-tick the size, tick it again and re-enter price and MRP. A `repriceListing()`
 * that did this for them was written, tested and REMOVED on the user's decision
 * (2026-09-26). De-selecting a size makes Meesho destroy that size's price and
 * MRP, so automating it means writing to the listing form and betting the
 * seller's typed values on our restore working against markup we do not control.
 * The side panel tells them the three steps instead. Don't reinstate it without
 * asking.
 *
 * (Autofill DOES write to the form — but only into fields the seller saved
 * themselves, only on their click, and every write is read back. It never
 * touches price/MRP unless that value came from their own profile or override.)
 */

import {
  FRONT_IMAGE_INPUT_IDS,
  IMAGE_INPUT_HINTS,
  NOT_FRONT_IMAGE_IDS,
} from "./config";

function fileInputs(): HTMLInputElement[] {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>('input[type="file"]'),
  );
}

/** The panel's own front-image input if present, else the best heuristic match. */
function findFrontImageInput(): HTMLInputElement | null {
  for (const id of FRONT_IMAGE_INPUT_IDS) {
    const el = document.getElementById(id);
    if (el instanceof HTMLInputElement && el.type === "file") return el;
  }
  const candidates = fileInputs()
    .filter((input) => !NOT_FRONT_IMAGE_IDS.includes(input.id))
    .map((input) => ({ input, score: scoreImageInput(input) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);
  return candidates[0]?.input ?? null;
}

/** Rank file inputs so the most likely "primary product image" input wins. */
function scoreImageInput(input: HTMLInputElement): number {
  let score = 0;
  if (IMAGE_INPUT_HINTS.accept.test(input.accept || "")) score += 3;
  // Nearby text / attributes hinting at product images.
  const haystack = [
    input.name,
    input.id,
    input.getAttribute("aria-label") ?? "",
    input.closest("[class]")?.className ?? "",
    input.parentElement?.textContent?.slice(0, 120) ?? "",
  ]
    .join(" ")
    .toLowerCase();
  if (IMAGE_INPUT_HINTS.nearbyText.test(haystack)) score += 2;
  // Visible / attached inputs beat hidden orphans.
  if (input.isConnected) score += 1;
  return score;
}

/**
 * Inject `file` into the listing's primary image input using a DataTransfer, and
 * dispatch native `input`+`change` events so React's controlled handler picks it
 * up. Returns false if no suitable input was found. USER-INITIATED only — the
 * seller triggers this from a variation card; we never submit the catalog.
 */
export function applyImageToListing(file: File): boolean {
  const target = findFrontImageInput();
  if (!target) return false;

  const dt = new DataTransfer();
  dt.items.add(file);
  target.files = dt.files;

  // React tracks input values via a native setter; nudging it makes sure the
  // controlled component notices the programmatic change.
  target.dispatchEvent(new Event("input", { bubbles: true }));
  target.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}
