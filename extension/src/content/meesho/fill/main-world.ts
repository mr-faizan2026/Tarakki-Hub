/**
 * The MAIN-world write fallback.
 *
 * A content script runs in an ISOLATED JavaScript world: same DOM, different
 * globals. That is normally fine — setting an input's value through the native
 * prototype setter and dispatching `input` is exactly what React's own value
 * tracker listens for. But a few controls on Meesho's form ignore it, because
 * their tracker was installed against the page's own prototypes.
 *
 * The fix is to run the identical write inside the page. Only an extension page
 * may call `chrome.scripting.executeScript`, so the content script marks the
 * element with a one-shot attribute, asks the background to do the injection, and
 * removes the marker afterwards. The DOM is shared between the two worlds, so the
 * page-world function finds the element by that attribute.
 *
 * No new permission is needed: `scripting` is already in the manifest (Part 1
 * uses it for the pricing probe), and the host permission is Meesho only.
 */

import { requestFromBackground } from "@/lib/messages";

/**
 * The one-shot marker attribute. It exists for the duration of one write and is
 * removed in a `finally`, so it is never left on the seller's page. The
 * page-world function in background/index.ts looks for exactly this name — change
 * one and you must change both.
 */
export const FILL_MARKER_ATTR = "data-tk-fill";

let sequence = 0;

/**
 * Set `el`'s value from the page's own world. Resolves true only when the
 * page-world write read back correctly.
 */
export async function mainWorldSet(el: HTMLElement, value: string): Promise<boolean> {
  sequence += 1;
  const marker = `${Date.now().toString(36)}-${sequence}`;
  el.setAttribute(FILL_MARKER_ATTR, marker);
  try {
    const res = await requestFromBackground({
      type: "BG_MAIN_WORLD_SET",
      marker,
      value,
    });
    return res?.ok === true;
  } catch {
    // The background could not inject (tab navigating, or the API refused).
    // The caller already tried the isolated-world write, so this is a dead end
    // for this field — it gets reported as needing attention, never as filled.
    return false;
  } finally {
    el.removeAttribute(FILL_MARKER_ATTR);
  }
}
