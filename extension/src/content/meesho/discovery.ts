/**
 * ════════════════════════════════════════════════════════════════════════════
 *  FORM DISCOVERY — "what fields are on this screen, and what are they called?"
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Everything else in Part 2 depends on this being right, so it is the piece to
 *  verify first (the panel's **Field scan** dev view exists for exactly that).
 *
 *  Four jobs:
 *    1. formRoot()      — find the catalog form, and ONLY the catalog form.
 *    2. discoverFields() — every visible, enabled control inside it, with its
 *                         label, section heading, type, value and occurrence.
 *    3. categoryPath()  — which category the listing is for.
 *    4. formStatus()    — the cheap "is a form here?" answer the panel polls.
 *
 *  ── HOW THE FORM IS FOUND (and why not by selector) ───────────────────────
 *  Meesho ships generated class names, so `.catalog-form` does not exist and
 *  `.css-1x2y3z` will not survive their next deploy. Instead:
 *
 *    a. collect every form control on the page, minus page chrome (header, nav,
 *       search, account menus — see EXCLUDE_SELECTORS) and minus anything that
 *       is never listing data (files, passwords, bank fields);
 *    b. for each ancestor, count how many of those controls it contains;
 *    c. take the DEEPEST ancestor still holding FORM_COVERAGE.preferred of them
 *       — nearly all — falling back to a bare majority only if nothing reaches
 *       that. Deepest gives the tightest box around the cluster and drops strays
 *       elsewhere on the page; the high share is what stops one half of a
 *       two-column form (Meesho's "Product Details" holds 22 of 31 controls on
 *       its own) from passing as the whole form and losing the other half;
 *    d. require one of FORM_ANCHOR_TEXT inside it, climbing if needed. Without
 *       that check, an empty dashboard with three filter selects would look
 *       like a catalog form and we would offer to "save" it.
 *
 *  If (a) finds fewer than MIN_FORM_CONTROLS controls, or (d) never matches,
 *  there is no form: the panel says "Open a product listing form" instead of
 *  saving an empty profile.
 *
 *  PRIVACY: (a) is the mechanism behind "we only read the catalog form". The
 *  adapter never looks at account, payment, bank or order screens — those are
 *  either outside the form root or excluded by name.
 */

import type {
  CapturedField,
  FieldAttrs,
  FieldType,
  FieldValue,
  FormStatus,
  ScannedField,
} from "@/lib/autofill-types";
import {
  CATEGORY_HINTS,
  CHIP_SELECTOR,
  CONTROL_SELECTOR,
  DEFAULT_SECTION,
  DROPDOWN_HINTS,
  EXCLUDE_FIELD_HINTS,
  FORM_ANCHOR_TEXT,
  FORM_MIN_ANCHORS,
  LABEL_HINTS,
  LABEL_MAX_LEN,
  LISTBOX_SELECTOR,
  FORM_COVERAGE,
  MIN_FORM_CONTROLS,
  PLACEHOLDER_NOISE,
  REQUIRED_MARK,
  SECTION_HEADING_SELECTOR,
  SECTION_MAX_LEN,
  SKIP_INPUT_TYPES,
} from "./config";
import {
  cssEscape,
  deepQueryAll,
  inExcludedRegion,
  isExcludedRegion,
  isEnabled,
  isVisible,
  normalizeLabel,
  textOf,
  tidy,
} from "./dom";

/* ─── types ────────────────────────────────────────────────────────────── */

/**
 * A control as it exists on the page right now. Superset of CapturedField: it
 * carries the live elements, which never get serialised.
 */
export type LiveField = {
  key: string;
  label: string;
  normalizedLabel: string;
  section: string;
  type: FieldType;
  occurrence: number;
  attrs: FieldAttrs;
  /** The element to read, click or type into. */
  el: HTMLElement;
  /** Radio/checkbox group members. Empty for single controls. */
  members: HTMLElement[];
  /** The smallest box holding this field and its label — used for highlighting. */
  wrapper: HTMLElement;
  value: FieldValue;
  empty: boolean;
  /** Meesho marks this as a field the catalog can't be submitted without. */
  required: boolean;
  /** Visible option texts, when they can be read without opening a popup. */
  options: string[];
};

/* ─── 1) the form root ─────────────────────────────────────────────────── */

/** Controls that could plausibly be listing data, anywhere on the page. */
function candidateControls(): HTMLElement[] {
  const raw = deepQueryAll(document, CONTROL_SELECTOR) as HTMLElement[];
  return raw.filter(isListingControl);
}

function isListingControl(el: HTMLElement): boolean {
  if (inExcludedRegion(el)) return false;
  if (!isVisible(el)) return false;
  if (!isEnabled(el)) return false;

  if (el instanceof HTMLInputElement) {
    const type = (el.getAttribute("type") ?? "text").toLowerCase();
    if (SKIP_INPUT_TYPES.includes(type)) return false;
    if (el.autocomplete === "current-password" || el.autocomplete === "new-password") {
      return false;
    }
    // Readonly cuts both ways. Meesho's dropdowns are readonly by design (you
    // pick, you don't type), so rejecting them outright loses most of the form.
    // A readonly box that is NOT a dropdown really is locked — a computed total,
    // a derived code — and writing to it can only ever produce a failed row.
    if (el.readOnly && !isDropdownWidget(el)) return false;
  }

  // Options and menu items are parts of a widget, never fields of their own.
  const role = el.getAttribute("role");
  if (role === "option" || role === "menuitem" || role === "menuitemradio") return false;
  if (role === "listbox") {
    // A single-select listbox is a dropdown's popup, not a field.
    if (el.getAttribute("aria-multiselectable") !== "true") return false;
    // A multi-selectable one still might be — see isPopupList.
    if (isPopupList(el)) return false;
  }

  // Page chrome by name: search boxes, logins, banking, coupons.
  const haystack = [
    el.getAttribute("name") ?? "",
    el.id,
    el.getAttribute("aria-label") ?? "",
    el.getAttribute("placeholder") ?? "",
    el.getAttribute("autocomplete") ?? "",
  ].join(" ");
  if (EXCLUDE_FIELD_HINTS.test(haystack)) return false;

  return true;
}

/**
 * Is this list the OPEN POPUP of a dropdown rather than a field in its own right?
 *
 * It matters because a rescan while a dropdown is open would otherwise invent a
 * phantom field out of the popup — and then try to fill it. Three tells, any of
 * which is conclusive: it sits inside a combobox, something on the page declares
 * `aria-controls`/`aria-owns` pointing at it, or the element immediately before it
 * is the trigger that opened it.
 */
function isPopupList(el: HTMLElement): boolean {
  if (el.closest('[role="combobox"],[aria-haspopup="listbox"],[aria-haspopup="menu"]')) {
    return true;
  }
  if (el.id) {
    const id = cssEscape(el.id);
    if (document.querySelector(`[aria-controls="${id}"],[aria-owns="${id}"]`)) return true;
  }
  const previous = el.previousElementSibling;
  return (
    previous != null &&
    previous.matches('[role="combobox"],[aria-haspopup="listbox"],[aria-expanded]')
  );
}

/** Depth from the document root — used to pick the tightest container. */
function depthOf(el: Element): number {
  let d = 0;
  let node: Element | null = el;
  while (node) {
    d += 1;
    node = node.parentElement;
  }
  return d;
}

/**
 * Does this container mention the things only a catalog form mentions?
 *
 * ── WHY IT COUNTS DISTINCT WORDS INSTEAD OF ANY SINGLE ONE ────────────────
 * Because one anchor word is not evidence. The supplier panel's ORDERS LIST has a
 * "SKU" column header and a column of row checkboxes, which is three controls and
 * one anchor — enough, under a one-word rule, to be declared a catalog form. The
 * panel then offers to autofill a seller's order filters, and a fill run ticks
 * checkboxes in their orders table. The negative fixture
 * (test/fixtures/orders-list.html) exists precisely to hold this line.
 *
 * A real catalog form mentions many of these words at once — product name, MRP,
 * size, inventory, HSN, country of origin, manufacturer, packer. Requiring two
 * distinct ones costs nothing there and rules out every list and table in the
 * panel.
 *
 * FORM_MIN_ANCHORS is remotely configurable along with FORM_ANCHOR_TEXT, so a
 * Meesho rename that leaves a real form with only one recognised word is fixable
 * from /admin without a release — the same escape hatch as every other selector.
 */
function hasFormAnchor(el: Element): boolean {
  const text = anchorText(el);
  if (!text) return false;
  let found = 0;
  for (const word of FORM_ANCHOR_TEXT) {
    if (!text.includes(word)) continue;
    found += 1;
    if (found >= FORM_MIN_ANCHORS) return true;
  }
  return false;
}

/**
 * The container's text with PAGE CHROME REMOVED — nav, header, footer, search,
 * menus, tablists, anything in EXCLUDE_SELECTORS.
 *
 * ── WHY THE EXCLUSIONS APPLY TO EVIDENCE, NOT JUST TO FIELDS ──────────────
 * EXCLUDE_SELECTORS was written to keep the adapter from READING or WRITING page
 * chrome. But chrome was still being allowed to ARGUE that a page is a catalog
 * form: the supplier panel's sidebar has a "Catalogs" link, so every page in the
 * panel carried the "catalog" anchor for free. Combined with the orders table's
 * "SKU" column that is two anchors on the orders list, and the panel offered to
 * autofill a seller's order filters.
 *
 * A nav link is not evidence about the page it links away from. So the same list
 * that decides what we may read also decides what may count as proof.
 *
 * FILTER_REJECT on an element prunes its whole subtree, so this costs one walk,
 * not one `closest()` per text node.
 */
function anchorText(el: Element): string {
  // The root is never visited by the walker, so an excluded root is rejected here
  // — otherwise asking "is this <nav> a catalog form?" would read its own text.
  if (isExcludedRegion(el)) return "";

  const parts: string[] = [];
  const walker = document.createTreeWalker(
    el,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (node.nodeType === Node.TEXT_NODE) return NodeFilter.FILTER_ACCEPT;
        return isExcludedRegion(node as Element)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_SKIP;
      },
    },
  );

  let node = walker.nextNode();
  while (node) {
    const value = node.nodeValue;
    if (value && value.trim()) parts.push(value);
    node = walker.nextNode();
  }

  return parts.join(" ").replace(/\s+/g, " ").toLowerCase();
}

/**
 * The catalog form container, or null when this screen has no form.
 * See the header comment for the algorithm and why it is not a selector.
 */
export function formRoot(): HTMLElement | null {
  const controls = candidateControls();
  if (controls.length < MIN_FORM_CONTROLS) return null;

  // A real <form> that holds the cluster is the best possible answer.
  const formEl = controls[0].closest("form");
  if (
    formEl instanceof HTMLElement &&
    controls.filter((c) => formEl.contains(c)).length >= MIN_FORM_CONTROLS &&
    hasFormAnchor(formEl)
  ) {
    return formEl;
  }

  // Count controls per ancestor, then take the deepest holding a majority.
  const counts = new Map<HTMLElement, number>();
  for (const control of controls) {
    let node: HTMLElement | null = control.parentElement;
    const seen = new Set<HTMLElement>();
    while (node && node !== document.documentElement) {
      if (!seen.has(node)) {
        seen.add(node);
        counts.set(node, (counts.get(node) ?? 0) + 1);
      }
      node = node.parentElement;
    }
  }

  // Deepest ancestor holding the required share. Try the strict share first:
  // at 60% one half of a two-column form can win on its own and the other half
  // is lost silently, which is exactly what Meesho's layout does to us.
  const deepestHolding = (share: number): HTMLElement | null => {
    const needed = Math.max(MIN_FORM_CONTROLS, Math.ceil(controls.length * share));
    let found: HTMLElement | null = null;
    let foundDepth = -1;
    for (const [node, count] of counts) {
      if (count < needed) continue;
      const d = depthOf(node);
      if (d > foundDepth) {
        found = node;
        foundDepth = d;
      }
    }
    return found;
  };

  const best =
    deepestHolding(FORM_COVERAGE.preferred) ?? deepestHolding(FORM_COVERAGE.fallback);
  if (!best) return null;

  // The tight cluster may sit below the section headings; climb until the
  // container proves it is a catalog form (and so that headings are in scope).
  let root: HTMLElement | null = best;
  while (root && root !== document.body && !hasFormAnchor(root)) {
    root = root.parentElement;
  }
  if (!root || root === document.documentElement) return null;
  // body-wide means we never found an anchor in any real container.
  if (root === document.body && !hasFormAnchor(document.body)) return null;
  return root;
}

/* ─── 2) labels, sections, wrappers ────────────────────────────────────── */

/**
 * The smallest ancestor that holds this field and nothing else fieldish — the
 * "field wrapper". Labels are searched inside it, and it is what gets outlined
 * when the seller taps a result row.
 */
function fieldWrapper(el: HTMLElement, members: HTMLElement[], root: HTMLElement): HTMLElement {
  const own = new Set<HTMLElement>([el, ...members]);
  /** Ours = the control, its group members, and anything inside them (a combobox
   *  wrapper owns the input it renders). Anything else means we have climbed too
   *  far and would steal the next field's label. */
  const isOurs = (candidate: HTMLElement) =>
    own.has(candidate) || Array.from(own).some((o) => o.contains(candidate));

  let wrapper: HTMLElement = el;
  let node: HTMLElement | null = el.parentElement;
  for (let i = 0; i < 6 && node && node !== root.parentElement; i++) {
    const inside = Array.from(node.querySelectorAll<HTMLElement>(CONTROL_SELECTOR)).filter(
      (c) => isListingControl(c) || own.has(c),
    );
    if (inside.some((c) => !isOurs(c))) break;
    wrapper = node;
    node = node.parentElement;
  }
  return wrapper;
}

/** Text of a label element with any nested control's own text removed. */
function labelText(el: Element): string {
  const clone = el.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll("input,textarea,select,[role=combobox],[role=listbox],button")
    .forEach((n) => n.remove());
  return tidy(clone.textContent);
}

/** Resolve a control's visible label, in the documented priority order. */
function resolveLabel(el: HTMLElement, wrapper: HTMLElement): string {
  // 1) <label for="…">
  if (el.id) {
    const escaped = cssEscape(el.id);
    const forLabel = (el.getRootNode() as ParentNode).querySelector(`label[for="${escaped}"]`);
    if (forLabel) {
      const text = labelText(forLabel);
      if (usableLabel(text)) return text;
    }
  }

  // 2) aria-labelledby
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const rootNode = el.getRootNode() as ParentNode & { getElementById?: (id: string) => Element | null };
    const parts = labelledBy
      .split(/\s+/)
      .map((id) => {
        const found =
          typeof rootNode.getElementById === "function"
            ? rootNode.getElementById(id)
            : document.getElementById(id);
        return found ? labelText(found) : "";
      })
      .filter(Boolean);
    const text = tidy(parts.join(" "));
    if (usableLabel(text)) return text;
  }

  // 3) aria-label
  const aria = tidy(el.getAttribute("aria-label"));
  if (usableLabel(aria)) return aria;

  // 4) an enclosing <label>, then the nearest label-ish text inside the wrapper
  const enclosing = el.closest("label");
  if (enclosing) {
    const text = labelText(enclosing);
    if (usableLabel(text)) return text;
  }
  const nearby = nearestLabelIn(wrapper, el);
  if (nearby) return nearby;

  // 5) placeholder — last resort; better than an unnamed field.
  const placeholder = tidy(el.getAttribute("placeholder"));
  if (usableLabel(placeholder)) return placeholder;

  return "";
}

function usableLabel(text: string): boolean {
  if (!text) return false;
  if (text.length > LABEL_MAX_LEN) return false;
  return normalizeLabel(text).length > 0;
}

/** Is `node` positioned before `el` in document order? */
function isBefore(node: Node, el: Node): boolean {
  return (node.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

/**
 * The last label-ish text inside `wrapper` that appears BEFORE `el`. Meesho
 * renders most fields as "<div>Label</div><widget/>", with no <label> at all.
 *
 * "Before" is checked by document position, not by walking until the control's
 * own text appears — an <input> contains no text nodes, so that would happily
 * pick up the NEXT field's label.
 */
function nearestLabelIn(wrapper: HTMLElement, el: HTMLElement): string {
  const explicit = Array.from(wrapper.querySelectorAll<HTMLElement>(LABEL_HINTS.join(",")));
  const before = explicit.filter((cand) => !cand.contains(el) && isBefore(cand, el));
  for (let i = before.length - 1; i >= 0; i--) {
    const text = labelText(before[i]);
    if (usableLabel(text)) return text;
  }

  // No label element: take the last short text node before the control.
  const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT);
  let best = "";
  let node = walker.nextNode();
  while (node) {
    if (!el.contains(node) && isBefore(node, el)) {
      const text = tidy(node.nodeValue);
      if (usableLabel(text)) best = text;
    }
    node = walker.nextNode();
  }
  return best;
}

/**
 * Sweep the form once in document order, remembering the last heading seen, so
 * every control learns the section it sits under. One pass, exact order — much
 * more reliable than climbing and guessing which sibling is a heading.
 */
function sectionMap(root: HTMLElement): Map<HTMLElement, string> {
  const map = new Map<HTMLElement, string>();
  let current = DEFAULT_SECTION;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let node = walker.currentNode as HTMLElement | null;
  while (node) {
    if (node.matches(SECTION_HEADING_SELECTOR)) {
      const text = tidy(node.textContent);
      if (text && text.length <= SECTION_MAX_LEN) current = text;
    } else if (node.matches(CONTROL_SELECTOR)) {
      map.set(node, current);
    }
    node = walker.nextNode() as HTMLElement | null;
  }
  return map;
}

/** The section for a control, including ones living inside a shadow root. */
function sectionFor(
  el: HTMLElement,
  map: Map<HTMLElement, string>,
  root: HTMLElement,
): string {
  const direct = map.get(el);
  if (direct) return direct;

  // Shadow-hosted: use the host's section, then any heading inside the shadow.
  const host = (el.getRootNode() as ShadowRoot).host as HTMLElement | undefined;
  if (host) {
    const viaHost = map.get(host) ?? nearestHeadingAbove(host, root);
    if (viaHost) return viaHost;
  }
  return nearestHeadingAbove(el, root) ?? DEFAULT_SECTION;
}

function nearestHeadingAbove(el: HTMLElement, root: HTMLElement): string | null {
  let node: HTMLElement | null = el;
  while (node && node !== root.parentElement) {
    let sib = node.previousElementSibling;
    while (sib) {
      const heading = sib.matches(SECTION_HEADING_SELECTOR)
        ? sib
        : sib.querySelector(SECTION_HEADING_SELECTOR);
      if (heading) {
        const text = tidy(heading.textContent);
        if (text && text.length <= SECTION_MAX_LEN) return text;
      }
      sib = sib.previousElementSibling;
    }
    node = node.parentElement;
  }
  return null;
}

/* ─── 3) control types ─────────────────────────────────────────────────── */

function matchesAny(el: Element, selectors: string[]): boolean {
  return selectors.some((sel) => {
    try {
      return el.matches(sel);
    } catch {
      return false;
    }
  });
}

/** Is this element (or its wrapper) one of Meesho's custom list widgets? */
function isDropdownWidget(el: HTMLElement): boolean {
  if (matchesAny(el, DROPDOWN_HINTS.selectors)) return true;
  // A wrapper one level up sometimes carries the ARIA, with a plain div inside.
  const parent = el.parentElement;
  return parent ? matchesAny(parent, ['[role="combobox"]', '[aria-haspopup="listbox"]']) : false;
}

function isSearchable(el: HTMLElement): boolean {
  if (el instanceof HTMLInputElement && !SKIP_INPUT_TYPES.includes(el.type)) {
    if (matchesAny(el, DROPDOWN_HINTS.searchable)) return true;
  }
  return el.querySelector("input[aria-autocomplete],input[role=combobox]") != null;
}

/** Chips visible inside the widget mean it holds several values at once. */
function looksMultiValued(el: HTMLElement, wrapper: HTMLElement): boolean {
  if (el.getAttribute("aria-multiselectable") === "true") return true;
  if (wrapper.getAttribute("aria-multiselectable") === "true") return true;
  try {
    return wrapper.querySelectorAll(CHIP_SELECTOR).length > 1;
  } catch {
    return false;
  }
}

function detectType(el: HTMLElement, wrapper: HTMLElement): FieldType {
  if (el instanceof HTMLTextAreaElement) return "textarea";
  if (el.getAttribute("contenteditable") === "true") return "textarea";

  if (el instanceof HTMLSelectElement) return el.multiple ? "multiselect" : "select";

  if (el instanceof HTMLInputElement) {
    const type = (el.getAttribute("type") ?? "text").toLowerCase();
    if (type === "radio") return "radio";
    if (type === "checkbox") return "checkbox";
    if (type === "number" || type === "range") return "number";
    if (isDropdownWidget(el)) {
      if (looksMultiValued(el, wrapper)) return "multiselect";
      return isSearchable(el) ? "combobox" : "dropdown";
    }
    // A text box the seller types digits into. The distinction is cosmetic — the
    // text handler writes both — but it makes the field scan readable.
    const numeric = el.inputMode === "numeric" || el.inputMode === "decimal";
    return numeric ? "number" : "text";
  }

  const role = el.getAttribute("role");
  if (role === "radiogroup") return "radio";
  if (role === "radio") return "radio";
  if (role === "checkbox" || role === "switch") return "checkbox";
  if (role === "spinbutton") return "number";
  if (role === "listbox") return "multiselect"; // only multi-selectable ones survive the filter

  if (isDropdownWidget(el)) {
    if (looksMultiValued(el, wrapper)) return "multiselect";
    return isSearchable(el) ? "combobox" : "dropdown";
  }
  if (role === "textbox") return "text";
  return "text";
}

/* ─── 4) reading a value ───────────────────────────────────────────────── */

/** Placeholder text masquerading as a chosen value ("Select", "—", "N/A"). */
function isNoise(text: string): boolean {
  return PLACEHOLDER_NOISE.test(text);
}

/**
 * Everything in a container that is NOT the value: the field's own label, icons,
 * buttons and nested inputs.
 *
 * This matters more than it looks. An empty custom dropdown shows "Select", which
 * PLACEHOLDER_NOISE catches — but if the search widens to the field wrapper, the
 * wrapper's text is "Colour Select", which is neither empty nor noise. Read as a
 * value it makes every untouched dropdown look filled, and "fill only empty
 * fields" then skips every one of them. So the label is stripped explicitly, by
 * class hint AND by the label text we resolved for this field.
 *
 * An OPEN options list is stripped for the same reason, and it is the worse of
 * the two. While a popup is on screen it lives inside the field's wrapper, so
 * the wrapper's text is the whole menu: an empty Fabric box read back as
 * "AcrylicArt SilkBambooChiffonCorduroy". That is not merely a wrong string —
 * it is non-empty, so the field looks answered to everything downstream. It
 * would be skipped by "fill only empty fields", saved into a profile as that
 * value by a capture, and left out of the end-of-run "still required" list while
 * the box is in fact blank. Lists do usually close on their own; closeList()
 * carries three fallbacks precisely because some do not, and a multiselect stays
 * open on purpose. A control's own options are never its value.
 */
function valueTextIn(container: HTMLElement, label: string): string {
  const clone = container.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll(
      `${LABEL_HINTS.join(",")},${LISTBOX_SELECTOR},svg,button,input,textarea`,
    )
    .forEach((n) => n.remove());

  let text = tidy(clone.textContent);
  const placeholder = tidy(container.getAttribute("aria-placeholder") ?? "");
  if (placeholder) text = tidy(text.replace(placeholder, ""));
  text = stripLabelPrefix(text, label);

  // What is left is the label and nothing else → there is no value here.
  if (label && normalizeLabel(text) === normalizeLabel(label)) return "";
  return text;
}

/** Remove a leading copy of the field's label, however Meesho punctuated it. */
function stripLabelPrefix(text: string, label: string): string {
  if (!label || !text) return text;
  const candidates = [label, label.replace(/[*†]/g, "").trim()].filter(Boolean);
  for (const candidate of candidates) {
    if (text.toLowerCase().startsWith(candidate.toLowerCase())) {
      return tidy(text.slice(candidate.length).replace(/^[:\-–—*\s]+/, ""));
    }
  }
  return text;
}

/** The text a custom dropdown is currently displaying, or "" when unset. */
function displayedSelection(el: HTMLElement, wrapper: HTMLElement, label: string): string {
  // aria-activedescendant points at the chosen option when the widget uses it.
  const activeId = el.getAttribute("aria-activedescendant");
  if (activeId) {
    const root = el.getRootNode() as ParentNode & { getElementById?: (id: string) => Element | null };
    const active =
      typeof root.getElementById === "function"
        ? root.getElementById(activeId)
        : document.getElementById(activeId);
    const text = tidy(active?.textContent);
    if (text && !isNoise(text)) return text;
  }

  // An input-backed combobox shows its value in the input.
  if (el instanceof HTMLInputElement) {
    const v = tidy(el.value);
    if (v && !isNoise(v)) return v;
  }
  const inner = el.querySelector("input");
  if (inner instanceof HTMLInputElement) {
    const v = tidy(inner.value);
    if (v && !isNoise(v)) return v;
  }

  // Otherwise the trigger's own text, then the wrapper's — label stripped out of
  // both, placeholders rejected.
  for (const candidate of [el, wrapper]) {
    const text = valueTextIn(candidate, label);
    if (text && !isNoise(text)) return text;
  }
  return "";
}

/** Chip texts, for a multi-value widget. */
function chipValues(wrapper: HTMLElement): string[] {
  try {
    return Array.from(wrapper.querySelectorAll<HTMLElement>(CHIP_SELECTOR))
      .map((chip) => tidy(chip.textContent))
      .filter((t) => t && !isNoise(t));
  } catch {
    return [];
  }
}

function readValue(
  type: FieldType,
  el: HTMLElement,
  members: HTMLElement[],
  wrapper: HTMLElement,
  /** The field's resolved label, so it can be told apart from its value. */
  label: string,
): FieldValue {
  switch (type) {
    case "checkbox": {
      if (el instanceof HTMLInputElement) return el.checked;
      return el.getAttribute("aria-checked") === "true";
    }
    case "radio": {
      const chosen = members.find((m) =>
        m instanceof HTMLInputElement ? m.checked : m.getAttribute("aria-checked") === "true",
      );
      return chosen ? optionLabel(chosen) : "";
    }
    case "select": {
      const sel = el as HTMLSelectElement;
      const text = tidy(sel.selectedOptions[0]?.text ?? "");
      return isNoise(text) ? "" : text;
    }
    case "multiselect": {
      if (el instanceof HTMLSelectElement) {
        return Array.from(el.selectedOptions)
          .map((o) => tidy(o.text))
          .filter((t) => t && !isNoise(t));
      }
      const chips = chipValues(wrapper);
      if (chips.length) return chips;
      const selected = Array.from(
        el.querySelectorAll<HTMLElement>('[role="option"][aria-selected="true"]'),
      )
        .map((o) => tidy(o.textContent))
        .filter((t) => t && !isNoise(t));
      return selected;
    }
    case "dropdown":
    case "combobox":
      return displayedSelection(el, wrapper, label);
    case "number":
    case "text":
    case "textarea": {
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        return el.value;
      }
      return tidy(el.textContent);
    }
  }
}

/** The visible text of one radio/checkbox option. */
function optionLabel(el: HTMLElement): string {
  const aria = tidy(el.getAttribute("aria-label"));
  if (aria) return aria;
  if (el.id) {
    const forLabel = (el.getRootNode() as ParentNode).querySelector(
      `label[for="${cssEscape(el.id)}"]`,
    );
    const text = tidy(forLabel?.textContent);
    if (text) return text;
  }
  const enclosing = el.closest("label");
  if (enclosing) {
    const text = labelText(enclosing);
    if (text) return text;
  }
  const parentText = tidy(el.parentElement?.textContent);
  if (parentText && parentText.length <= LABEL_MAX_LEN) return parentText;
  return el instanceof HTMLInputElement ? tidy(el.value) : "";
}

/** Option texts we can read without opening anything. */
function readOptions(type: FieldType, el: HTMLElement, members: HTMLElement[]): string[] {
  if (el instanceof HTMLSelectElement) {
    return Array.from(el.options)
      .map((o) => tidy(o.text))
      .filter((t) => t && !isNoise(t));
  }
  if (type === "radio") return members.map(optionLabel).filter(Boolean);
  const rendered = Array.from(el.querySelectorAll<HTMLElement>('[role="option"]'))
    .map((o) => tidy(o.textContent))
    .filter((t) => t && !isNoise(t));
  return rendered;
}

/**
 * Re-read one live field's value from the page, right now.
 *
 * This is the verification primitive the whole engine rests on: every handler
 * calls it after writing and only reports success when what came back is what it
 * wrote. It re-reads the element rather than trusting the cached `value`, because
 * the point is to learn whether React kept the write.
 */
export function currentValue(field: LiveField): FieldValue {
  return readValue(field.type, field.el, field.members, field.wrapper, field.label);
}

/** Has the seller left this control blank? */
export function isEmptyValue(value: FieldValue): boolean {
  if (typeof value === "boolean") return value === false;
  if (Array.isArray(value)) return value.length === 0;
  const text = tidy(value);
  return text === "" || isNoise(text);
}

/* ─── 5) grouping + the public discovery call ───────────────────────────── */

/**
 * Collapse radio groups and drop the inner parts of composite widgets, so one
 * question on screen becomes exactly one field.
 */
function groupControls(controls: HTMLElement[]): { el: HTMLElement; members: HTMLElement[] }[] {
  const dropped = new Set<HTMLElement>();
  const groups: { el: HTMLElement; members: HTMLElement[] }[] = [];

  // a) [role=radiogroup] owns its radios.
  for (const el of controls) {
    if (el.getAttribute("role") !== "radiogroup") continue;
    const members = Array.from(
      el.querySelectorAll<HTMLElement>('[role="radio"],input[type="radio"]'),
    );
    members.forEach((m) => dropped.add(m));
    groups.push({ el, members });
    dropped.add(el);
  }

  // b) native radios sharing a name are one question.
  const byName = new Map<string, HTMLElement[]>();
  for (const el of controls) {
    if (dropped.has(el)) continue;
    if (!(el instanceof HTMLInputElement) || el.type !== "radio") continue;
    const name = el.name || `__anon_${el.id || groups.length}`;
    const list = byName.get(name) ?? [];
    list.push(el);
    byName.set(name, list);
  }
  for (const members of byName.values()) {
    members.forEach((m) => dropped.add(m));
    groups.push({ el: members[0], members });
  }

  // c) a composite widget (combobox wrapper) swallows the controls inside it.
  for (const el of controls) {
    if (dropped.has(el)) continue;
    if (!isDropdownWidget(el)) continue;
    const inside = controls.filter((other) => other !== el && el.contains(other));
    if (!inside.length) continue;
    inside.forEach((other) => dropped.add(other));
  }

  // d) everything left standing is a field of its own.
  for (const el of controls) {
    if (dropped.has(el)) continue;
    groups.push({ el, members: [] });
  }

  // Document order keeps `occurrence` meaningful and the preview readable.
  // Elements in different shadow trees compare as DISCONNECTED; leave those in
  // the order discovery found them rather than inventing one.
  return groups.sort((a, b) => {
    const position = a.el.compareDocumentPosition(b.el);
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });
}

/**
 * Every field on the catalog form, in the order the seller sees them.
 * Returns [] when there is no form on screen.
 */
export function discoverFields(root: HTMLElement | null = formRoot()): LiveField[] {
  if (!root) return [];

  // deepQueryAll covers the light DOM and any open shadow roots inside the form.
  // A Set keeps a control that both queries find from appearing twice.
  const controls = Array.from(
    new Set(deepQueryAll(root, CONTROL_SELECTOR) as HTMLElement[]),
  ).filter(isListingControl);

  const sections = sectionMap(root);
  const seen = new Map<string, number>();
  const fields: LiveField[] = [];

  for (const { el, members } of groupControls(controls)) {
    const wrapper = fieldWrapper(el, members, root);
    const type = detectType(el, wrapper);
    // A radio group's identity is the QUESTION ("Sleeve Length"), not the first
    // option's label ("Sleeveless") — and the first option's <label> is exactly
    // what resolveLabel would find, so the group label has to be tried first.
    const label =
      type === "radio" && members.length > 1
        ? resolveGroupLabel(el, wrapper) || resolveLabel(el, wrapper)
        : resolveLabel(el, wrapper);
    const normalizedLabel = normalizeLabel(label);
    if (!normalizedLabel) continue; // an unnameable control cannot be matched later

    const section = sectionFor(el, sections, root);
    const dedupeKey = `${section}|${normalizedLabel}`;
    const occurrence = seen.get(dedupeKey) ?? 0;
    seen.set(dedupeKey, occurrence + 1);

    const value = readValue(type, el, members, wrapper, label);
    fields.push({
      key: `${section}|${normalizedLabel}|${occurrence}`,
      label,
      normalizedLabel,
      section,
      type,
      occurrence,
      attrs: readAttrs(el),
      el,
      members,
      wrapper,
      value,
      empty: isEmptyValue(value),
      required: isRequired(el, members, label),
      options: readOptions(type, el, members),
    });
  }

  return fields;
}

/** A radio group's question, when the individual radios carry the answers. */
function resolveGroupLabel(el: HTMLElement, wrapper: HTMLElement): string {
  const group = el.closest('[role="radiogroup"],fieldset') ?? wrapper;
  const legend = group.querySelector("legend");
  if (legend) {
    const text = labelText(legend);
    if (usableLabel(text)) return text;
  }
  const aria = tidy(group.getAttribute("aria-label"));
  if (usableLabel(aria)) return aria;
  return nearestLabelIn(group as HTMLElement, el);
}

/**
 * Does Meesho insist on this field?
 *
 * Three sources, cheapest first. The asterisk is last but does most of the work:
 * Meesho sets `required` on almost nothing and `aria-required` on little more,
 * while it renders "*" into the label of every field its own validation blocks
 * on. The RAW label is tested, because normalizeLabel strips the mark.
 *
 * A false positive costs one extra name in "still needed"; a false negative
 * costs the seller a rejected catalog, so the asterisk is trusted.
 */
function isRequired(el: HTMLElement, members: HTMLElement[], label: string): boolean {
  for (const node of [el, ...members]) {
    if ((node as HTMLElement & { required?: boolean }).required) return true;
    if (node.getAttribute("aria-required") === "true") return true;
  }
  return REQUIRED_MARK.test(label);
}

function readAttrs(el: HTMLElement): FieldAttrs {
  const attrs: FieldAttrs = {};
  const name = el.getAttribute("name");
  if (name) attrs.name = name;
  if (el.id) attrs.id = el.id;
  const testId =
    el.getAttribute("data-testid") ??
    el.getAttribute("data-test-id") ??
    el.getAttribute("data-test") ??
    el.getAttribute("data-qa");
  if (testId) attrs.testId = testId;
  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel) attrs.ariaLabel = ariaLabel;
  const placeholder = el.getAttribute("placeholder");
  if (placeholder) attrs.placeholder = placeholder;
  return attrs;
}

/* ─── 6) serialising, scanning, status ─────────────────────────────────── */

/** Strip the live elements off — exactly what goes into the profile row. */
export function toCaptured(field: LiveField): CapturedField {
  const captured: CapturedField = {
    key: field.key,
    label: field.label,
    normalizedLabel: field.normalizedLabel,
    section: field.section,
    type: field.type,
    value: field.value,
    occurrence: field.occurrence,
  };
  if (Object.keys(field.attrs).length) captured.attrs = field.attrs;
  return captured;
}

/** The field-scan shape: everything plus whether it is currently empty. */
export function toScanned(field: LiveField): ScannedField {
  return {
    ...toCaptured(field),
    empty: field.empty,
    required: field.required,
    options: field.options,
  };
}

/**
 * The listing's category breadcrumb, for the profile record and the mismatch
 * warning. Breadcrumb container → a labelled Category field → the form heading.
 * Null when nothing trustworthy is on screen; a null never triggers a warning.
 *
 * The heading step is the one that needs care. On Meesho's own upload flow the
 * only h1 is "Add Single Catalog", and returning it meant the side panel showed
 * a page title where the seller's category should be, and profiles were saved
 * with `category_path: "Add Single Catalog"` — which then answered "is this
 * profile for this listing?" with a comparison of two page titles. A heading is
 * now accepted only when it actually looks like a category: either several
 * levels separated by › / >, or one short level that isn't flow wording.
 */
export function categoryPath(
  root: HTMLElement | null = formRoot(),
  /** Pass an already-discovered field list to avoid a second full scan. */
  fields?: LiveField[],
): string | null {
  for (const sel of CATEGORY_HINTS.containers) {
    const el = document.querySelector(sel);
    const text = textOf(el);
    if (text && text.length <= 160) {
      const parts = text
        .split(CATEGORY_HINTS.separator)
        .map((p) => tidy(p))
        .filter(Boolean);
      if (parts.length >= 2) return parts.join(" › ");
    }
  }

  if (root) {
    for (const field of fields ?? discoverFields(root)) {
      if (!CATEGORY_HINTS.labels.includes(field.normalizedLabel)) continue;
      const value = Array.isArray(field.value) ? field.value.join(", ") : String(field.value);
      const text = tidy(value);
      if (text) return text;
    }
  }

  // The FIRST heading only, as before — walking them all just finds the form's
  // own section headings, and "Product, Size and Inventory" is no more a
  // category than "Add Single Catalog" is.
  const heading = document.querySelector("h1,h2");
  return heading ? categoryFromHeading(heading, root) : null;
}

/**
 * A heading, if it reads like a category rather than like a page title.
 *
 * Several levels separated by › / > is a breadcrumb wherever it sits. A single
 * level has to earn it: not flow wording ("Add Single Catalog"), not long, and
 * not inside the form — a lone heading within the form root is one of its
 * section titles, which is a different kind of wrong answer with the same cost.
 */
function categoryFromHeading(heading: Element, root: HTMLElement | null): string | null {
  const text = tidy(heading.textContent);
  if (!text || text.length > 80) return null;

  const parts = text
    .split(CATEGORY_HINTS.separator)
    .map((p) => tidy(p))
    .filter(Boolean);
  if (parts.length >= 2) return parts.join(" › ");

  if (text.length > CATEGORY_HINTS.headingMaxLen) return null;
  if (CATEGORY_HINTS.headingNoise.test(text)) return null;
  if (root?.contains(heading)) return null;
  return text;
}

/**
 * The cheap answer the panel needs constantly: is a catalog form here, how many
 * fields does it have, how many are filled, and for which category?
 */
export function formStatus(): FormStatus {
  const root = formRoot();
  if (!root) {
    return {
      present: false,
      fieldCount: 0,
      filledCount: 0,
      categoryPath: null,
      url: location.href,
    };
  }
  const fields = discoverFields(root);
  return {
    present: fields.length >= MIN_FORM_CONTROLS,
    fieldCount: fields.length,
    filledCount: fields.filter((f) => !f.empty).length,
    categoryPath: categoryPath(root, fields),
    url: location.href,
  };
}
