/**
 * "Take me to that field" — scroll the page to one field and outline it.
 *
 * The result list in the side panel is only useful if a seller can act on it, so
 * tapping a row brings the actual box into view on the Meesho page and rings it:
 * teal for a field we filled, amber-red for one that needs their attention. The
 * outline fades itself out after HIGHLIGHT_MS.
 *
 * It is drawn with one injected <style> and a class, not inline styles, so the
 * page's own attributes are never rewritten and nothing is left behind.
 */

import type { HighlightTone } from "@/lib/autofill-types";
import { HIGHLIGHT_MS } from "./config";
import { discoverFields } from "./discovery";

const STYLE_ID = "tk-autofill-highlight-style";
const OK_CLASS = "tk-autofill-ok";
const PROBLEM_CLASS = "tk-autofill-problem";

const CSS = `
.${OK_CLASS}, .${PROBLEM_CLASS} {
  outline-offset: 3px !important;
  border-radius: 6px;
  transition: outline-color 220ms ease;
  scroll-margin: 120px;
}
.${OK_CLASS} { outline: 2px solid #17b8a1 !important; }
.${PROBLEM_CLASS} { outline: 2px dashed #d1483a !important; }
`;

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.append(style);
}

let clearTimer = 0;

function clearAll(): void {
  for (const cls of [OK_CLASS, PROBLEM_CLASS]) {
    document.querySelectorAll(`.${cls}`).forEach((el) => el.classList.remove(cls));
  }
}

/**
 * Scroll to the field with this key and ring it. Returns false when the field is
 * no longer on the page (the seller navigated, or Meesho hid that step).
 */
export function highlightField(key: string, tone: HighlightTone): boolean {
  const field = discoverFields().find((f) => f.key === key);
  if (!field) return false;

  ensureStyle();
  clearAll();
  window.clearTimeout(clearTimer);

  const cls = tone === "ok" ? OK_CLASS : PROBLEM_CLASS;
  field.wrapper.classList.add(cls);
  field.wrapper.scrollIntoView({ behavior: "smooth", block: "center" });

  clearTimer = window.setTimeout(clearAll, HIGHLIGHT_MS);
  return true;
}
