/**
 * ════════════════════════════════════════════════════════════════════════════
 *  MEESHO ADAPTER — the single place that knows about Meesho's DOM.
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Meesho's supplier panel is a React SPA whose markup changes over time. This
 *  module is intentionally the ONLY file coupled to that markup, so when the
 *  panel's layout shifts, this is the one file to update.
 *
 *  Two responsibilities:
 *    A) readShipping()          — find the live shipping charge on the page.
 *    C) applyImageToListing()   — put a generated image into the listing's
 *                                 primary image <input type="file">.
 *
 *  Both use LABEL-ANCHORED, resilient heuristics (find by nearby text, not by a
 *  brittle fixed CSS path) so they survive minor UI changes. Nothing here ever
 *  auto-submits or mutates the catalog on its own — every action is triggered by
 *  the seller from the panel.
 *
 *  ── WHERE TO UPDATE IF MEESHO CHANGES ──────────────────────────────────────
 *    • SHIPPING_LABELS       — words that sit next to the shipping amount.
 *    • CURRENCY_RE           — how a rupee value is written.
 *    • FRONT_IMAGE_INPUT_IDS — the panel's own front-image inputs, in priority.
 *    • IMAGE_INPUT_HINTS     — fallback heuristics for the image upload input.
 *  Everything else is generic DOM walking that shouldn't need touching.
 *
 *  (Meesho's internal API — used for the live per-image shipping quote — lives
 *  in meesho-api.ts, not here.)
 */

/* ─── tunables ─────────────────────────────────────────────────────────── */

/** Text that labels the shipping figure. Lower-cased substring match. */
const SHIPPING_LABELS = [
  "shipping (added separately)",
  "shipping charge",
  "shipping charges",
  "shipping fee",
  "shipping",
];

/** Labels that mean "NOT the shipping charge" — reject anchors that are these. */
const SHIPPING_NEGATIVE = ["free shipping", "shipping address", "shipping to"];

/** A rupee amount: ₹ then digits with optional thousands separators/decimals. */
const CURRENCY_RE = /₹\s*([0-9][0-9,]*(?:\.[0-9]+)?)/;

/** How many ancestor levels to climb from a label when hunting for the value. */
const MAX_CLIMB = 4;

/**
 * The Add Single Catalog screen's own inputs, most specific first:
 *   changeFrontImage — "CHANGE" under the current product's Front Image;
 *   getFile          — the first-image picker that starts a new catalog.
 * (Its "addMoreImagesInput" adds side/back shots — never the front image.)
 */
const FRONT_IMAGE_INPUT_IDS = ["changeFrontImage", "getFile"];
const NOT_FRONT_IMAGE_IDS = ["addMoreImagesInput"];

/** Fallback hints that an <input type="file"> is the primary product-image input. */
const IMAGE_INPUT_HINTS = {
  accept: /image|png|jpe?g|webp/i,
  nearbyText: /image|photo|upload|catalog|product/i,
};

/* ─── types ────────────────────────────────────────────────────────────── */

export type ShippingHit = {
  value: number;
  raw: string;
  source: string;
};

/* ─── A) live shipping read ────────────────────────────────────────────── */

function parseRupees(raw: string): number | null {
  const m = raw.match(CURRENCY_RE);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Direct, visible text of an element (children's text excluded is overkill —
 *  we use full textContent but keep anchors small by preferring leaf labels). */
function visibleText(el: Element): string {
  return (el.textContent ?? "").replace(/\s+/g, " ").trim();
}

function isLabelText(text: string): boolean {
  const t = text.toLowerCase();
  if (SHIPPING_NEGATIVE.some((neg) => t.includes(neg))) return false;
  return SHIPPING_LABELS.some((lbl) => t.includes(lbl));
}

/**
 * Find the shipping charge by anchoring on its label. Strategy, in order:
 *   1. If a label element's own text already contains a ₹ amount → use it.
 *   2. Otherwise climb up to MAX_CLIMB ancestors and, at each level, look for a
 *      ₹ amount in that container (a table row / flex row typically holds the
 *      label on the left and the value on the right).
 * Returns the first plausible hit, or null — never a fabricated number.
 */
export function readShipping(root: ParentNode = document): ShippingHit | null {
  // Candidate label anchors: the smallest elements whose text names shipping.
  const anchors: Element[] = [];
  const all = root.querySelectorAll<HTMLElement>("body *");
  for (const el of all) {
    // Skip huge containers: we want a tight label, so require the element to be
    // reasonably small in text length (a label, not a whole panel).
    const text = visibleText(el);
    if (!text || text.length > 60) continue;
    if (isLabelText(text)) anchors.push(el);
  }

  for (const anchor of anchors) {
    const anchorText = visibleText(anchor);

    // 1) Value sits in the same element as the label.
    const inline = parseRupees(anchorText);
    if (inline != null) {
      return {
        value: inline,
        raw: (anchorText.match(CURRENCY_RE) ?? [])[0] ?? `₹${inline}`,
        source: "label-inline",
      };
    }

    // 2) Climb ancestors; at each level scan for the nearest ₹ amount that is
    //    not the label text itself.
    let node: Element | null = anchor;
    for (let level = 0; level < MAX_CLIMB && node; level++) {
      node = node.parentElement;
      if (!node) break;
      const hit = firstCurrencyIn(node, anchor);
      if (hit) {
        return { value: hit.value, raw: hit.raw, source: `label-climb-${level}` };
      }
    }
  }

  return null;
}

/** Find the first ₹ amount inside `container`, ignoring text inside `exclude`. */
function firstCurrencyIn(
  container: Element,
  exclude: Element,
): { value: number; raw: string } | null {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (exclude.contains(node)) return NodeFilter.FILTER_REJECT;
      return CURRENCY_RE.test(node.nodeValue ?? "")
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_SKIP;
    },
  });
  const textNode = walker.nextNode();
  if (!textNode) return null;
  const raw = (textNode.nodeValue ?? "").match(CURRENCY_RE)?.[0] ?? "";
  const value = parseRupees(raw);
  return value == null ? null : { value, raw };
}

/* ─── C) apply a generated image to the listing ────────────────────────── */

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
