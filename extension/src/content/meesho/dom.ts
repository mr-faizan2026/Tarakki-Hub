/**
 * Generic DOM helpers for the Meesho adapter. Nothing in here knows anything
 * about Meesho — it is the plumbing the Meesho-aware modules sit on, kept
 * separate so config.ts stays the only file that drifts with their UI.
 */

import { EXCLUDE_SELECTORS, TIMING } from "./config";

/* ─── text ─────────────────────────────────────────────────────────────── */

/**
 * Collapse whitespace; the form is full of newlines and nbsp.
 *
 * Zero-width characters go FIRST, and they are not cosmetic. Meesho's outlined
 * text fields render a `<legend>` holding nothing but a U+200B, and `\s` does
 * not match U+200B — so without this every one of those legends survived as a
 * one-character "section heading", and every captured field came back filed
 * under "​" instead of "Product Details".
 */
export function tidy(text: string | null | undefined): string {
  return (text ?? "").replace(/[​-‍⁠﻿]/g, "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

/**
 * A label reduced to its identity: lower-cased, required-asterisks and trailing
 * punctuation gone, whitespace collapsed. "Fabric *" and "fabric:" both become
 * "fabric", so a Meesho copy tweak does not orphan a saved field.
 */
export function normalizeLabel(text: string): string {
  return tidy(text)
    .toLowerCase()
    .replace(/[*†]/g, " ")
    .replace(/\(.*?\)/g, " ")
    .replace(/[:?]+\s*$/, "")
    .replace(/[^a-z0-9%/&+.\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Text of an element as the seller reads it. */
export function textOf(el: Element | null | undefined): string {
  if (!el) return "";
  return tidy((el as HTMLElement).innerText ?? el.textContent ?? "");
}

/**
 * Token-overlap similarity, 0–1. Used only as the LAST matching resort, so it is
 * deliberately conservative: it rewards shared words, not shared letters, which
 * keeps "Packer Name" from matching "Importer Name".
 */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ta = new Set(a.split(" ").filter(Boolean));
  const tb = new Set(b.split(" ").filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  const overlap = (2 * shared) / (ta.size + tb.size);
  // A containment bonus: "hsn" inside "hsn code" should score well.
  const contained = a.includes(b) || b.includes(a) ? 0.15 : 0;
  return Math.min(1, overlap + contained);
}

/* ─── visibility ───────────────────────────────────────────────────────── */

/** Visible to the seller: laid out, not display:none / visibility:hidden / opacity 0. */
export function isVisible(el: Element): boolean {
  const he = el as HTMLElement;
  if (!he.isConnected) return false;
  if (he.hidden) return false;
  if (he.getAttribute("aria-hidden") === "true") return false;
  const rects = he.getClientRects();
  if (rects.length === 0) {
    // Custom widgets sometimes size to zero until opened; accept if it has a
    // laid-out ancestor and is not explicitly hidden.
    if (he.offsetParent == null) return false;
  }
  const style = window.getComputedStyle(he);
  if (style.display === "none" || style.visibility === "hidden") return false;
  if (Number(style.opacity) === 0) return false;
  return true;
}

/**
 * Enabled: not [disabled], not aria-disabled.
 *
 * `readOnly` is deliberately NOT checked here. Meesho builds every one of its
 * dropdowns as `<input readonly placeholder="Select">` — readonly because you
 * pick from a list instead of typing, not because the field is locked. Treating
 * readonly as "unfillable" silently dropped 18 of 34 controls on a live Kurtis
 * form, including Colour, Fabric, Size and Brand. Whether a readonly control is
 * genuinely locked is a question about the widget, so discovery asks it (see
 * isListingControl), where dropdown-ness is known.
 */
export function isEnabled(el: Element): boolean {
  const he = el as HTMLElement & { disabled?: boolean };
  if (he.disabled) return false;
  if (he.getAttribute("aria-disabled") === "true") return false;
  if (he.closest("[disabled],[aria-disabled=true],fieldset[disabled]")) return false;
  return true;
}

/** True when the element sits inside page chrome we must never touch. */
export function inExcludedRegion(el: Element): boolean {
  return EXCLUDE_SELECTORS.some((sel) => {
    try {
      return el.closest(sel) != null;
    } catch {
      return false;
    }
  });
}

/**
 * True when THIS element IS one of the excluded regions (not merely inside one).
 *
 * The distinction matters for tree pruning: a walker that rejects an element skips
 * its whole subtree, so it needs "is this the <nav>?" rather than "is this
 * somewhere under a <nav>?". See anchorText in discovery.ts.
 *
 * Selectors can come from the remote adapter config, so a malformed one is
 * possible; it is treated as "not excluded" rather than allowed to throw inside a
 * tree walk.
 */
export function isExcludedRegion(el: Element): boolean {
  return EXCLUDE_SELECTORS.some((sel) => {
    try {
      return el.matches(sel);
    } catch {
      return false;
    }
  });
}

/* ─── shadow-DOM-aware querying ────────────────────────────────────────── */

/**
 * querySelectorAll that also descends into OPEN shadow roots. Meesho's own panel
 * is plain React today, but embedded widgets (address pickers, date pickers) do
 * use shadow DOM, and a field the adapter cannot see is a field the seller has
 * to type by hand.
 */
export function deepQueryAll(root: ParentNode, selector: string): Element[] {
  const out: Element[] = [];
  const seen = new Set<ParentNode>();

  const walk = (node: ParentNode) => {
    if (seen.has(node)) return;
    seen.add(node);
    try {
      out.push(...Array.from(node.querySelectorAll(selector)));
    } catch {
      /* an invalid selector should never break discovery */
    }
    const hosts = node.querySelectorAll<HTMLElement>("*");
    for (const host of hosts) {
      const shadow = host.shadowRoot;
      if (shadow) walk(shadow);
    }
  };

  walk(root);
  return out;
}

/** CSS.escape with a fallback for engines that lack it. */
export function cssEscape(value: string): string {
  const esc = (globalThis as { CSS?: { escape?: (s: string) => string } }).CSS?.escape;
  return esc ? esc(value) : value.replace(/["\\]/g, "\\$&");
}

/* ─── waiting ──────────────────────────────────────────────────────────── */

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * Resolve once the DOM under `root` has been quiet for `quietMs`, or after
 * `maxMs` regardless.
 *
 * This is what makes cascading fields work. Meesho reveals new controls after
 * certain choices (pick a GST type and two more fields appear), and writing the
 * next field while React is still re-rendering loses the write silently. Waiting
 * for quiet is slower and correct.
 */
export function waitForSettle(
  root: Node = document.body,
  quietMs: number = TIMING.settleQuietMs,
  maxMs: number = TIMING.settleMaxMs,
): Promise<void> {
  return new Promise((resolve) => {
    let quietTimer = 0;
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      window.clearTimeout(quietTimer);
      window.clearTimeout(hardTimer);
      observer.disconnect();
      resolve();
    };

    const observer = new MutationObserver(() => {
      window.clearTimeout(quietTimer);
      quietTimer = window.setTimeout(finish, quietMs);
    });

    const hardTimer = window.setTimeout(finish, maxMs);
    quietTimer = window.setTimeout(finish, quietMs);

    try {
      observer.observe(root, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      });
    } catch {
      finish();
    }
  });
}

/**
 * Poll `check` until it returns something truthy, or `timeoutMs` passes.
 * Used for "has the options list rendered yet?" — Meesho renders some option
 * lists asynchronously and virtualises long ones.
 */
export async function waitFor<T>(
  check: () => T | null | undefined | false,
  timeoutMs: number,
  intervalMs = 60,
): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const hit = check();
    if (hit) return hit;
    if (Date.now() >= deadline) return null;
    await sleep(intervalMs);
  }
}

/* ─── synthetic interaction ────────────────────────────────────────────── */

/**
 * Click the way a person does: pointer down/up then click, all bubbling and
 * trusted-looking enough for React's synthetic event system. A bare
 * `el.click()` misses widgets that listen on pointerdown (most React dropdowns).
 */
export function realClick(el: Element): void {
  const he = el as HTMLElement;
  const rect = he.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const base = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y };

  he.dispatchEvent(new PointerEvent("pointerdown", { ...base, isPrimary: true }));
  he.dispatchEvent(new MouseEvent("mousedown", base));
  try {
    he.focus({ preventScroll: true });
  } catch {
    /* not focusable — the click still lands */
  }
  he.dispatchEvent(new PointerEvent("pointerup", { ...base, isPrimary: true }));
  he.dispatchEvent(new MouseEvent("mouseup", base));
  he.dispatchEvent(new MouseEvent("click", base));
}

/** Press a key on an element, bubbling both keydown and keyup. */
export function pressKey(el: Element, key: string): void {
  const init: KeyboardEventInit = { key, bubbles: true, cancelable: true, composed: true };
  el.dispatchEvent(new KeyboardEvent("keydown", init));
  el.dispatchEvent(new KeyboardEvent("keyup", init));
}

/** Fire the input/change pair React listens for. */
export function fireInputChange(el: Element): void {
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}
