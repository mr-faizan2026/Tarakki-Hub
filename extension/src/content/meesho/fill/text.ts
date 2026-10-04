/**
 * text · textarea · number — the React-safe write.
 *
 * `el.value = x` alone does nothing useful on a controlled React input: React
 * caches the last value it set and treats an identical-looking DOM change as a
 * no-op, so the field shows the text and the component's state never hears about
 * it. Going through the NATIVE prototype setter bypasses React's own descriptor,
 * and the bubbling `input` event is what its synthetic event system reacts to.
 *
 * Order matters and each step earns its place:
 *   focus  — some fields only mount their validator on focus
 *   setter — the native one, so React's value tracker sees a real change
 *   input  — React state updates here
 *   change — non-React listeners and Meesho's own validators
 *   blur   — several Meesho fields validate and reformat on blur; skipping it
 *            leaves the field looking filled and flagged red
 * Then the value is read back, and only a match counts.
 */

import { currentValue } from "../discovery";
import { fireInputChange } from "../dom";
import { asText, fail, ok, valuesEqual, type FillHandler } from "./shared";

function nativeSetter(el: HTMLElement): ((value: string) => void) | null {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : el instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : null;
  if (!proto) return null;
  const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
  const setter = descriptor?.set;
  return setter ? (value: string) => setter.call(el, value) : null;
}

export const fillText: FillHandler = async (field, value, ctx) => {
  const text = asText(value);
  const el = field.el;

  try {
    el.focus({ preventScroll: true });
  } catch {
    /* not focusable — carry on, the setter still works */
  }

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const setter = nativeSetter(el);
    if (setter) setter(text);
    else el.value = text;
    fireInputChange(el);
  } else if (el.getAttribute("contenteditable") === "true") {
    el.textContent = text;
    el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  } else {
    return fail("This field is not a text box any more — fill it by hand.");
  }

  // Several Meesho fields validate and reformat on blur; skipping it leaves the
  // field looking filled and flagged red. blur() fires the real event, so there
  // is nothing to dispatch by hand.
  el.blur();

  if (valuesEqual(currentValue(field), text)) return ok("Filled");

  // The isolated-world write did not take. Try again from inside the page.
  if (ctx.cancelled()) return fail("Cancelled");
  const viaPage = await ctx.mainWorldSet(el, text);
  if (viaPage && valuesEqual(currentValue(field), text)) {
    return ok("Filled (via the page)");
  }

  return fail("Typed the value but the form did not keep it.");
};
