/**
 * Feature A — read the live shipping charge off the supplier panel.
 *
 * Unchanged behaviour from Part 1; it moved into this folder when the adapter
 * grew from one file into one module per concern. All of its tunables
 * (SHIPPING_LABELS, SHIPPING_NEGATIVE, CURRENCY_RE, MAX_CLIMB) live in config.ts.
 *
 * LABEL-ANCHORED on purpose: find the words the seller reads, then look beside
 * them for a rupee amount. Never a fixed CSS path, and never a fabricated
 * number — no hit means "not detected", which the panel says plainly.
 */

import {
  CURRENCY_RE,
  MAX_CLIMB,
  SHIPPING_LABELS,
  SHIPPING_NEGATIVE,
} from "./config";

export type ShippingHit = {
  value: number;
  raw: string;
  source: string;
};

function parseRupees(raw: string): number | null {
  const m = raw.match(CURRENCY_RE);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Direct, visible text of an element (anchors stay small by preferring leaves). */
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
