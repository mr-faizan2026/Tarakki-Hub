/**
 * Custom dropdowns and comboboxes — the part that actually earns its keep.
 *
 * Most of Meesho's catalog form is NOT native <select>. It is React widgets: a
 * trigger showing the chosen text, and an options list that mounts on click —
 * often portalled to <body>, sometimes rendered asynchronously, sometimes
 * virtualised so only the visible dozen options exist in the DOM.
 *
 * ── THE STRATEGY CHAIN ─────────────────────────────────────────────────────
 * Three ways in, tried in order, each verified by reading the displayed value
 * back afterwards:
 *
 *   (a) CLICK      open the list, find the option whose text matches, click it.
 *                  Handles the ordinary case. Scrolls the list while looking, so
 *                  a virtualised option that has not rendered yet gets a chance.
 *   (b) SEARCH     type the wanted text into the widget's own filter input, wait
 *                  for the filtered results, click the match. This is the only
 *                  thing that works on long virtualised lists (Fabric, Brand).
 *   (c) KEYBOARD   focus the trigger and walk it with ArrowDown, watching the
 *                  active option, then Enter. The last resort for widgets that
 *                  swallow synthetic clicks.
 *
 * Then the list is closed cleanly (Escape, and a click elsewhere if it lingers),
 * because a dropdown left open covers the next field and breaks the rest of the
 * run.
 *
 * ── WHAT IS NOT DONE ───────────────────────────────────────────────────────
 * No option is invented. If the wanted text is not offered on this form, the
 * field is reported as "not offered here" and left exactly as the seller had it.
 * Nothing is typed into a combobox and abandoned unselected: a search box holding
 * "Cotton" with no option chosen looks filled and submits empty, which is the
 * single most expensive way this feature could fail.
 */

import type { FieldValue } from "@/lib/autofill-types";
import {
  DROPDOWN_SEARCH_SELECTOR,
  LISTBOX_SELECTOR,
  LIST_CONFIRM_LABELS,
  OPTION_FALLBACK_MAX_LEN,
  OPTION_SELECTOR,
  TIMING,
} from "../config";
import { currentValue, type LiveField } from "../discovery";
import {
  isVisible,
  normalizeLabel,
  pressKey,
  realClick,
  sleep,
  textOf,
  tidy,
  waitFor,
  waitForSettle,
} from "../dom";
import {
  asList,
  asText,
  bestOption,
  fail,
  ok,
  optionMatches,
  valuesEqual,
  type FillContext,
  type FillHandler,
} from "./shared";

/* ─── finding the popup ────────────────────────────────────────────────── */

function byId(el: Element, id: string): Element | null {
  const root = el.getRootNode() as ParentNode & {
    getElementById?: (id: string) => Element | null;
  };
  return typeof root.getElementById === "function"
    ? root.getElementById(id)
    : document.getElementById(id);
}

/** Distance between two rects — used to pick the popup belonging to a trigger. */
function distance(a: DOMRect, b: DOMRect): number {
  const dx = Math.abs(a.left - b.left);
  const dy = Math.abs(a.bottom - b.top);
  return dx + dy;
}

/** How far from its trigger an undeclared popup may sit and still be its popup. */
const ATTACHED_PX = 48;

/**
 * Is this list visually attached to that trigger — directly under it, directly
 * above it, or overlaying it?
 *
 * Without this test, "the nearest visible list on the page" is the answer, and one
 * widget that stays open (a multiselect, by design) becomes the answer for every
 * later field in the run. That is exactly how "India is not offered on this form"
 * was reported for a dropdown whose second option is India.
 */
function isAttachedTo(list: HTMLElement, trigger: HTMLElement): boolean {
  const t = trigger.getBoundingClientRect();
  const l = list.getBoundingClientRect();
  const overlapsX = Math.min(t.right, l.right) - Math.max(t.left, l.left) > 0;
  if (!overlapsX) return false;
  // "Overlaying it", in the literal sense the comment above promises. A long
  // option list does not sit under its control — the popover is placed so the
  // list BRACKETS it. Meesho's colour list measured 386→1620 around a control at
  // 992→1034: 600px from every edge test below, so all three missed it and the
  // field failed with "took too long to respond" while its menu sat open on
  // screen. Containment is deliberately stricter than plain overlap, so a
  // multiselect left open elsewhere still cannot claim a later field.
  const bracketsY = l.top <= t.top && l.bottom >= t.bottom;
  return (
    bracketsY ||
    Math.abs(l.top - t.bottom) <= ATTACHED_PX ||
    Math.abs(t.top - l.bottom) <= ATTACHED_PX ||
    Math.abs(l.top - t.top) <= ATTACHED_PX
  );
}

/**
 * The open options list for this trigger, or null when it has none open.
 *
 * `aria-controls` / `aria-owns` is authoritative BOTH ways: a widget that names
 * its popup has no popup open when that element is absent. Only a widget that
 * declares nothing falls back to geometry — React portals render popups at the
 * end of <body>, where no ancestor link exists, but they are still drawn against
 * their trigger.
 */
function findListbox(trigger: HTMLElement): HTMLElement | null {
  const declared = trigger.getAttribute("aria-controls") ?? trigger.getAttribute("aria-owns");
  if (declared) {
    for (const one of declared.split(/\s+/)) {
      const el = byId(trigger, one);
      if (el instanceof HTMLElement && isVisible(el) && hasOptions(el)) return el;
    }
    return null;
  }

  const triggerRect = trigger.getBoundingClientRect();
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(LISTBOX_SELECTOR))
    .filter(
      (el) =>
        isVisible(el) && hasOptions(el) && !el.contains(trigger) && isAttachedTo(el, trigger),
    )
    .map((el) => ({ el, d: distance(triggerRect, el.getBoundingClientRect()) }))
    .sort((a, b) => a.d - b.d);
  if (candidates.length) return candidates[0].el;

  // No ARIA at all: a newly visible container holding several option-ish rows.
  const loose = Array.from(document.querySelectorAll<HTMLElement>("ul,div"))
    .filter(
      (el) =>
        isVisible(el) &&
        el.querySelectorAll('[role="option"]').length > 1 &&
        !el.contains(trigger) &&
        isAttachedTo(el, trigger),
    )
    .map((el) => ({ el, d: distance(triggerRect, el.getBoundingClientRect()) }))
    .sort((a, b) => a.d - b.d);
  return loose[0]?.el ?? null;
}

/**
 * Is this the open list? Asked of EVERY candidate list on the page, on a poll —
 * so it must stay cheap. It deliberately does NOT hunt for unmarked rows: doing
 * that here ran the row scan over every list many times a second and saturated
 * the tab's main thread until it stopped responding.
 */
function hasOptions(listbox: HTMLElement): boolean {
  if (markedOptionsIn(listbox).length > 0) return true;
  // Meesho's Size list marks nothing — a <ul role="menu"> of bare divs. Its ROLE
  // is the evidence; the rows get found later, once this list has been chosen.
  return listbox.matches(LISTBOX_SELECTOR) && textOf(listbox).length > 0;
}

/** Rows this list marks as options. Cheap — safe to call while hunting. */
function markedOptionsIn(listbox: HTMLElement): HTMLElement[] {
  return Array.from(listbox.querySelectorAll<HTMLElement>(OPTION_SELECTOR)).filter(
    (el) => isVisible(el) && tidy(el.textContent).length > 0,
  );
}

/**
 * The rows to pick from, once this list IS the open one. Only ever called on a
 * list we have already chosen — see hasOptions for why that separation matters.
 */
function optionsIn(listbox: HTMLElement): HTMLElement[] {
  const marked = markedOptionsIn(listbox);
  return marked.length ? marked : unmarkedOptionsIn(listbox);
}

/**
 * Rows in a list that marks none of them.
 *
 * Meesho's Size list is a `<ul role="menu">` of bare
 * `<div><svg/><p>M</p></div>` rows: no role, no <li>, no checkbox input. The
 * strict selector finds nothing there, every strategy reported "did not open",
 * and Size came back empty on every run while its panel stayed on screen.
 *
 * The rule is deliberately narrow: the INNERMOST elements inside the open list
 * that carry short visible text, with anything that is or contains a button
 * dropped — that last part is what keeps the "Clear Filter / Apply" footer from
 * being offered as an option called "Clear Filter Apply".
 */
function unmarkedOptionsIn(listbox: HTMLElement): HTMLElement[] {
  const texty = Array.from(listbox.querySelectorAll<HTMLElement>("*")).filter((el) => {
    if (el.closest("button") || el.querySelector("button")) return false;
    if (!isVisible(el)) return false;
    const text = textOf(el);
    return text.length > 0 && text.length <= OPTION_FALLBACK_MAX_LEN;
  });
  // querySelectorAll gives document order, so a row's own descendants are the
  // entries that immediately follow it — one linear pass finds the innermost.
  return texty.filter((el, i) => {
    const next = texty[i + 1];
    return !next || !el.contains(next);
  });
}

/**
 * What to actually click for an option row.
 *
 * On Meesho's Size list the handler sits on the tick GLYPH, not on the row and
 * not on its text: clicking the row or the `<p>` leaves the box unticked and
 * the value empty, while clicking the `<svg>` toggles it. Verified on a live
 * Kurtis form. A list whose rows are properly marked up is clicked as before.
 */
function clickTargetFor(option: HTMLElement): HTMLElement | SVGElement {
  if (option.matches(OPTION_SELECTOR)) return option;
  const glyph =
    option.querySelector<SVGElement>("svg") ??
    option.parentElement?.querySelector<SVGElement>("svg");
  return glyph ?? option;
}

/**
 * The button that commits this list, if it has one. Searched INSIDE the open
 * list only, so the form's own Save/Submit can never be reached from here.
 */
function confirmButtonIn(listbox: HTMLElement): HTMLElement | null {
  for (const button of Array.from(listbox.querySelectorAll<HTMLElement>("button"))) {
    if (!isVisible(button)) continue;
    if (LIST_CONFIRM_LABELS.includes(normalizeLabel(textOf(button)))) return button;
  }
  return null;
}

/** The element that opens the list: the trigger itself, or its wrapper. */
function triggerFor(field: LiveField): HTMLElement {
  const el = field.el;
  if (el.getAttribute("aria-expanded") != null) return el;
  const wrapperTrigger = field.wrapper.querySelector<HTMLElement>(
    '[aria-expanded],[role="combobox"],[aria-haspopup="listbox"]',
  );
  return wrapperTrigger ?? el;
}

function searchInputIn(field: LiveField, listbox: HTMLElement | null): HTMLInputElement | null {
  const scopes: (HTMLElement | null)[] = [listbox, field.wrapper];
  for (const scope of scopes) {
    if (!scope) continue;
    const input = scope.querySelector<HTMLInputElement>(DROPDOWN_SEARCH_SELECTOR);
    if (input && isVisible(input)) return input;
  }
  if (field.el instanceof HTMLInputElement) return field.el;
  return null;
}

/* ─── opening / closing ────────────────────────────────────────────────── */

async function openList(field: LiveField): Promise<HTMLElement | null> {
  const trigger = triggerFor(field);
  const already = findListbox(trigger);
  if (already) return already;

  // Put the control on screen before opening it, the way a seller would. Where
  // the popup lands is decided by where the control is: with the field near the
  // bottom of the viewport Meesho drew a 1200px option list that BRACKETED it,
  // 600px from every edge isAttachedTo measures, and the field failed with
  // "took too long to respond" while its own menu sat open. Centred, the same
  // widget puts its list right under the control. isAttachedTo tolerates both;
  // this keeps us in the ordinary case instead of relying on that tolerance.
  trigger.scrollIntoView({ block: "center" });
  await sleep(TIMING.scrollSettleMs);

  realClick(trigger);
  const listbox = await waitFor(() => findListbox(trigger), TIMING.optionWaitMs);
  return listbox;
}

/**
 * Close the list, and mean it. A list left open covers the next field for the rest
 * of the run, so this escalates rather than hoping.
 */
async function closeList(field: LiveField): Promise<void> {
  const trigger = triggerFor(field);
  if (!findListbox(trigger)) return;

  pressKey(trigger, "Escape");
  await sleep(60);
  if (!findListbox(trigger)) return;

  // Still open: click something inert well away from any field.
  realClick(document.body);
  await sleep(60);
  if (!findListbox(trigger)) return;

  // Last resort: toggle the trigger. Multiselects deliberately stay open so
  // several values can be picked, and some ignore both Escape and an outside
  // click — but they all respond to their own trigger.
  realClick(trigger);
  await sleep(60);
}

/* ─── the three strategies ─────────────────────────────────────────────── */

/** (a) open, look (scrolling if the list is virtualised), click. */
async function pickByClick(
  field: LiveField,
  wanted: string,
  ctx: FillContext,
): Promise<boolean> {
  const listbox = await openList(field);
  if (!listbox) return false;

  const confirm = confirmButtonIn(listbox);
  const parts = splitTicks(wanted);
  const ticksSeveral = confirm != null && parts.length > 1;

  /**
   * A tick list is matched EXACTLY, never by bestOption's fuzzy containment.
   *
   * bestOption scores a hit when the wanted text merely CONTAINS the option, so
   * on a size list the row "S" answers almost any string — asking for
   * "M, Nonexistent Size" ticked S and left the listing reading "M, L, S". A
   * wrong size silently added to a seller's catalog is far worse than a field
   * reported as not offered, and these rows ("M", "Free Size") are exact tokens
   * that never need the leniency.
   */
  const exact = confirm != null;

  // A list that commits on a button lets several rows be ticked before it is
  // applied, and Meesho reads those back comma-joined ("M, L"). The whole value
  // still gets first refusal — "Top M, Bottom L" is one real size, not two — and
  // only then is it read as several values.
  let chosen = await clickOneOption(listbox, field, wanted, ctx, exact);

  if (!chosen && ticksSeveral) {
    for (const part of parts) {
      if (ctx.cancelled()) break;
      // Re-ticking something already ticked would turn it OFF.
      if (tickedValues(field).includes(normalizeLabel(part))) {
        chosen = true;
        continue;
      }
      if (await clickOneOption(listbox, field, part, ctx, exact)) chosen = true;
    }
  }

  if (!chosen) return false;

  if (confirm && isVisible(confirm)) {
    realClick(confirm);
    await waitForSettle(field.wrapper);
  }
  return true;
}

/** Find one value in the open list — scrolling a virtualised one — and click it. */
async function clickOneOption(
  listbox: HTMLElement,
  field: LiveField,
  wanted: string,
  ctx: FillContext,
  exact = false,
): Promise<boolean> {
  const steps = 8;
  for (let step = 0; step < steps && !ctx.cancelled(); step++) {
    const options = optionsIn(listbox);
    const hit = exact
      ? (options.find((o) => normalizeLabel(textOf(o)) === normalizeLabel(wanted)) ?? null)
      : bestOption(options, (o) => textOf(o), wanted);
    if (hit) {
      hit.scrollIntoView({ block: "nearest" });
      realClick(clickTargetFor(hit));
      await waitForSettle(field.wrapper);
      return true;
    }
    // Virtualised list: scroll a page and look again.
    const before = listbox.scrollTop;
    listbox.scrollTop = before + listbox.clientHeight * 0.9;
    if (listbox.scrollTop === before) break; // nothing more to see
    await sleep(120);
  }
  return false;
}

/** A comma-joined value as its parts, or a single-item list. */
function splitTicks(wanted: string): string[] {
  return wanted
    .split(",")
    .map((part) => tidy(part))
    .filter(Boolean);
}

/** What this control already holds, one normalised value per tick. */
function tickedValues(field: LiveField): string[] {
  return asList(currentValue(field))
    .flatMap((value) => value.split(","))
    .map((value) => normalizeLabel(value))
    .filter(Boolean);
}

/** (b) type into the widget's own filter, then click the filtered match. */
async function pickBySearch(
  field: LiveField,
  wanted: string,
  ctx: FillContext,
): Promise<boolean> {
  const trigger = triggerFor(field);
  let listbox = findListbox(trigger);
  const input = searchInputIn(field, listbox);
  if (!input) return false;

  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  const type = (text: string) => {
    if (setter) setter.call(input, text);
    else input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };

  /**
   * What the box held before we typed — and the promise this function keeps.
   *
   * On a combobox the filter input IS the control (searchInputIn falls back to
   * field.el), so text left behind by a search that matched nothing is not a
   * stray keystroke: it is the field's value, as far as the page, the seller and
   * our own read-back are all concerned. Abandoning it there is the failure this
   * module's header swears off, and it bites twice — the Fabric box ends up
   * holding a word no option matches and submits empty, and the NEXT retry reads
   * that text back, finds exactly what it typed, and reports the field filled.
   * One run in the lab turned "Unobtanium" into a green "Filled 18".
   *
   * So every path out of here that did not click an option puts the box back
   * exactly as it was.
   */
  const before = input.value;
  const abandon = (): false => {
    if (input.value !== before) type(before);
    return false;
  };

  try {
    input.focus({ preventScroll: true });
  } catch {
    /* ignore */
  }
  type("");
  await sleep(60);
  type(wanted);

  if (ctx.cancelled()) return abandon();

  listbox = await waitFor(() => findListbox(trigger), TIMING.optionWaitMs);
  if (!listbox) return abandon();

  const hit = await waitFor(
    () => bestOption(optionsIn(listbox as HTMLElement), (o) => textOf(o), wanted),
    TIMING.optionWaitMs,
  );
  if (!hit) return abandon();

  realClick(hit);
  await waitForSettle(field.wrapper);
  return true;
}

/** (c) ArrowDown until the active option matches, then Enter. */
async function pickByKeyboard(
  field: LiveField,
  wanted: string,
  ctx: FillContext,
): Promise<boolean> {
  const trigger = triggerFor(field);
  try {
    trigger.focus({ preventScroll: true });
  } catch {
    /* ignore */
  }
  pressKey(trigger, "ArrowDown");
  const listbox = await waitFor(() => findListbox(trigger), TIMING.optionWaitMs);
  if (!listbox) return false;

  for (let step = 0; step < TIMING.keyboardSteps && !ctx.cancelled(); step++) {
    const active = activeOption(trigger, listbox);
    if (active && optionMatches(textOf(active), wanted)) {
      pressKey(trigger, "Enter");
      await waitForSettle(field.wrapper);
      return true;
    }
    pressKey(trigger, "ArrowDown");
    await sleep(35);
  }
  return false;
}

function activeOption(trigger: HTMLElement, listbox: HTMLElement): HTMLElement | null {
  const id = trigger.getAttribute("aria-activedescendant");
  if (id) {
    const el = byId(trigger, id);
    if (el instanceof HTMLElement) return el;
  }
  return (
    listbox.querySelector<HTMLElement>('[role="option"][aria-selected="true"]') ??
    listbox.querySelector<HTMLElement>('[aria-current="true"]')
  );
}

/* ─── the handler ──────────────────────────────────────────────────────── */

/**
 * Select `wanted` on a custom dropdown. Shared with the multiselect handler,
 * which calls it once per saved value.
 *
 * Returns true only when the widget's own displayed value says so afterwards.
 */
export async function selectFromDropdown(
  field: LiveField,
  wanted: string,
  ctx: FillContext,
  verify: () => boolean,
): Promise<{ ok: boolean; offered: boolean }> {
  let sawOptions = false;

  for (const strategy of [pickByClick, pickBySearch, pickByKeyboard]) {
    if (ctx.cancelled()) break;
    const clicked = await strategy(field, wanted, ctx);
    if (clicked) {
      await closeList(field);
      if (verify()) return { ok: true, offered: true };
      sawOptions = true;
      continue;
    }
    // Did the list even open? If it did, the option genuinely is not there.
    const listbox = findListbox(triggerFor(field));
    if (listbox) sawOptions = true;
    await closeList(field);
  }

  await closeList(field);
  return { ok: false, offered: sawOptions };
}

export const fillDropdown: FillHandler = async (field, value: FieldValue, ctx) => {
  const wanted = tidy(asText(value));
  if (!wanted) return fail("Nothing saved for this field.");

  const matches = () => valuesEqual(currentValue(field), wanted);
  if (matches()) return ok("Already set");

  /**
   * Forgive a value the widget REFORMATTED; never one it left incomplete.
   *
   * Every part of what was saved has to be on the page, and each part has to be
   * answered by a whole value the control is showing — so "Cotton" still passes
   * when the widget renders "Cotton (100%)", while a saved "M, L" that ticked
   * only M fails. The old test asked optionMatches(shown, wanted), which is true
   * in BOTH directions: "M" answered "M, L" and the run reported Size filled
   * when one of the two sizes had been chosen.
   */
  const verify = () => {
    if (matches()) return true;
    const shownParts = tickedValues(field);
    if (!shownParts.length) return false;
    return splitTicks(wanted)
      .map((part) => normalizeLabel(part))
      .filter(Boolean)
      .every((part) => shownParts.some((s) => s === part || s.startsWith(part)));
  };

  const result = await selectFromDropdown(field, wanted, ctx, verify);
  if (result.ok) return ok("Selected");
  if (ctx.cancelled()) return fail("Cancelled");
  return result.offered
    ? fail(`"${wanted}" is not offered on this form.`)
    : fail("This dropdown did not open — pick it by hand.");
};
