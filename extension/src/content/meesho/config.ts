/**
 * ════════════════════════════════════════════════════════════════════════════
 *  MEESHO ADAPTER CONFIG — the ONE file to edit when Meesho changes its UI.
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Everything Meesho-specific lives here as data: label words, section names,
 *  the widget hints that identify a custom dropdown, the containers to stay out
 *  of, and the timings. The rest of this folder is generic DOM walking that
 *  should not need touching.
 *
 *  ── RULES THIS FILE OBEYS ─────────────────────────────────────────────────
 *  • NO generated class names (`.css-1a2b3c`), NO absolute XPaths. Both change
 *    on every Meesho deploy. We anchor on what the seller sees (labels, section
 *    headings) and on ARIA roles, which are stable because they are semantic.
 *  • Every list is "hints", not "requirements": the code scores candidates and
 *    falls back to structure, so a renamed heading degrades one field rather
 *    than breaking the feature.
 *
 *  ── WHEN SOMETHING BREAKS, START HERE ─────────────────────────────────────
 *  Open the side panel's **Field scan** view (dev builds only — see
 *  DEV_TOOLS in lib/config.ts) on the real Meesho form. It lists every control
 *  the adapter sees with its label, section, type and current value. Then:
 *
 *    the form is not detected at all      → FORM_ANCHOR_TEXT, EXCLUDE_SELECTORS,
 *                                           MIN_FORM_CONTROLS
 *    only PART of the form is scanned     → FORM_COVERAGE
 *    a control is missing from the scan   → CONTROL_SELECTOR, SKIP_INPUT_TYPES
 *    a label reads wrong / is empty       → LABEL_HINTS, PLACEHOLDER_NOISE
 *    a section says "Listing details"     → SECTION_HEADING_SELECTOR, SECTION_MAX_LEN
 *    a dropdown is typed "text"           → DROPDOWN_HINTS
 *    a dropdown opens but nothing is picked → OPTION_SELECTOR, LISTBOX_SELECTOR,
 *                                           OPTION_FALLBACK_MAX_LEN
 *    a list is ticked but never applied   → LIST_CONFIRM_LABELS
 *    the category warning never fires     → CATEGORY_HINTS
 *    cascading fields arrive too late     → TIMING.settleQuietMs / maxPasses
 */

/* ─── A) The live shipping read (Part 1, unchanged) ─────────────────────── */

/** Text that labels the shipping figure. Lower-cased substring match. */
export let SHIPPING_LABELS: string[] = [
  "shipping (added separately)",
  "shipping charge",
  "shipping charges",
  "shipping fee",
  "shipping",
];

/** Labels that mean "NOT the shipping charge" — reject anchors that are these. */
export let SHIPPING_NEGATIVE: string[] = [
  "free shipping",
  "shipping address",
  "shipping to",
];

/** A rupee amount: ₹ then digits with optional thousands separators/decimals. */
export const CURRENCY_RE = /₹\s*([0-9][0-9,]*(?:\.[0-9]+)?)/;

/** How many ancestor levels to climb from a label when hunting for the value. */
export let MAX_CLIMB = 4;

/* ─── B) The front-image input (Part 1, unchanged) ──────────────────────── */

/**
 * The Add Single Catalog screen's own inputs, most specific first:
 *   changeFrontImage — "CHANGE" under the current product's Front Image;
 *   getFile          — the first-image picker that starts a new catalog.
 * (Its "addMoreImagesInput" adds side/back shots — never the front image.)
 */
export const FRONT_IMAGE_INPUT_IDS = ["changeFrontImage", "getFile", "addImages"];
export const NOT_FRONT_IMAGE_IDS = ["addMoreImagesInput"];

/** Fallback hints that an <input type="file"> is the primary product-image input. */
export const IMAGE_INPUT_HINTS = {
  accept: /image|png|jpe?g|webp/i,
  nearbyText: /image|photo|upload|catalog|product/i,
};

/* ─── C) Catalog-form discovery ─────────────────────────────────────────── */

/**
 * NOTE: there is deliberately no URL allow-list here. Meesho renames its routes
 * and sellers reach the catalog form from several places, so detection is purely
 * DOM-based (see discovery.ts). A URL rule would be one more thing to maintain
 * that can only ever make detection worse.
 */

/**
 * Words that appear as headings or labels on a real catalog form and essentially
 * nowhere else in the supplier panel. At least one must be present, which is
 * what stops us capturing the login screen, the orders table or a search box.
 */
export let FORM_ANCHOR_TEXT: string[] = [
  "product name",
  "product details",
  "product description",
  "catalog",
  "hsn",
  "gst",
  "mrp",
  "size",
  "fabric",
  "manufacturer",
  "packer",
  "importer",
  "country of origin",
  "net quantity",
  "sku",
  "inventory",
];

/**
 * Regions the autofill must never read or write: page chrome, account menus,
 * search, and anything modal that is not the form itself.
 *
 * PRIVACY: this is the mechanism behind "we only read the catalog form". Add to
 * it rather than relying on the form root being tight.
 */
export let EXCLUDE_SELECTORS: string[] = [
  "header",
  "nav",
  "footer",
  "aside",
  '[role="banner"]',
  '[role="navigation"]',
  '[role="search"]',
  '[role="menu"]',
  '[role="menubar"]',
  '[role="alert"]',
  '[role="tablist"]',
  "[data-tk-ignore]",
];

/** Attribute/label text that marks a control as page chrome, not a form field. */
export const EXCLUDE_FIELD_HINTS =
  /\b(search|filter|sort|login|log in|sign in|otp|password|bank|account number|ifsc|upi|pan\b|aadhaar|coupon)\b/i;

/** Minimum controls a container must hold before we call it a catalog form. */
export let MIN_FORM_CONTROLS = 3;

/**
 * How many DISTINCT words from FORM_ANCHOR_TEXT a container must mention before
 * it counts as a catalog form.
 *
 * Two, because one is not evidence: the orders list has a "SKU" column header and
 * a column of row checkboxes, which under a one-word rule is a catalog form — and
 * the panel then offers to autofill a seller's order filters. See hasFormAnchor in
 * discovery.ts and the negative fixture test/fixtures/orders-list.html.
 *
 * Raise it if some other list starts being mistaken for a form; lower it to 1 only
 * if a genuinely minimal Meesho form appears that mentions a single one of these
 * words, and prefer adding the missing words to FORM_ANCHOR_TEXT instead.
 */
export let FORM_MIN_ANCHORS = 2;

/**
 * What share of the page's listing controls the form root must hold.
 *
 * Two passes, and the order is the whole point. Meesho splits its catalog form
 * into "Product, Size and Inventory" and "Product Details", and the second half
 * alone held 22 of 31 controls on a live Kurtis form — over any simple majority.
 * A 60% rule therefore picked that half and called it the form, and Product Name
 * and Size were never captured at all.
 *
 * PREFERRED is high enough that no single section can satisfy it, so the root
 * has to be the container holding essentially everything. FALLBACK is the old
 * behaviour, kept for the case where a genuine stray control on the page would
 * otherwise push the root up to <body> and lose the form entirely.
 */
export let FORM_COVERAGE = { preferred: 0.9, fallback: 0.6 };

/** Every control kind we consider. File/hidden/password are dropped later. */
export let CONTROL_SELECTOR: string = [
  "input",
  "textarea",
  "select",
  '[contenteditable="true"]',
  '[role="combobox"]',
  '[role="listbox"]',
  '[role="radiogroup"]',
  '[role="radio"]',
  '[role="checkbox"]',
  '[role="switch"]',
  '[role="spinbutton"]',
  '[role="textbox"]',
].join(",");

/**
 * Input types we never capture or write.
 *   file    — images are Part 1's job ("Apply to listing")
 *   hidden  — not the seller's data
 *   password — never, anywhere
 */
export const SKIP_INPUT_TYPES = [
  "file",
  "hidden",
  "password",
  "submit",
  "button",
  "reset",
  "image",
];

/* ─── D) Labels and sections ────────────────────────────────────────────── */

/** Elements that can carry a field's label when ARIA does not. */
export const LABEL_HINTS = ["label", "legend", '[class*="label" i]'];

/** Longest text we will accept as a label (anything longer is a paragraph). */
export let LABEL_MAX_LEN = 90;

/** Elements that can be a section heading. Semantic only — no class names. */
export const SECTION_HEADING_SELECTOR = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  '[role="heading"]',
  "legend",
].join(",");

/** Longest text we will accept as a section heading. */
export let SECTION_MAX_LEN = 60;

/** Used when no heading can be found above a field. */
export let DEFAULT_SECTION = "Listing details";

/**
 * Text that is a placeholder pretending to be a value. A custom dropdown with
 * nothing chosen shows one of these; reading it as the selected option is how a
 * profile ends up full of the word "Select".
 */
export let PLACEHOLDER_NOISE: RegExp =
  /^(\s*|-+|—+|select|select\.\.\.|select one|select an option|choose|choose\.\.\.|please select|none|n\/?a|--\s*select\s*--)\s*$/i;

/**
 * The mark Meesho puts on a label the catalog cannot be submitted without.
 *
 * It renders a red asterisk inside the label text ("Net Weight *", "Inventory*",
 * "Chest Size* (INCH)") and supplies `required` / `aria-required` only
 * sometimes, so the asterisk is the reliable signal. `normalizeLabel` strips it,
 * which is why this is tested against the RAW label.
 *
 * What it buys: a run can tell the seller which boxes Meesho still needs, rather
 * than reporting "Filled 21 · Skipped 0" over a form that cannot be submitted.
 */
export const REQUIRED_MARK = /[*﹡＊✱]/;

/* ─── E) Custom dropdowns / comboboxes ──────────────────────────────────── */

/**
 * How we recognise Meesho's React dropdowns without touching a class name.
 * A control matching ANY of these is treated as a dropdown/combobox rather than
 * a plain text box, which is the difference between "typed 'Cotton' into a
 * search field and moved on" and "actually selected Cotton".
 */
export let DROPDOWN_HINTS: { selectors: string[]; searchable: string[] } = {
  /**
   * Roles/attributes that mean "this opens a list".
   *
   * The last entry is the one that matters on today's Meesho. Its dropdowns
   * carry NO aria at all — not on the input, not on any of its wrappers: they
   * are `<input readonly placeholder="Select">` inside plain divs. Verified on
   * a live Kurtis form, where colour, fabric, neck, size, brand and nine others
   * all had role/aria-expanded/aria-haspopup/aria-controls null. Without this
   * rule they are typed as "text", and the text handler's write is rejected by
   * React on arrival — a form full of honest failures instead of a filled one.
   * Readonly + a "Select…" prompt is the only signal Meesho gives us.
   */
  selectors: [
    '[role="combobox"]',
    '[aria-haspopup="listbox"]',
    '[aria-haspopup="menu"]',
    "[aria-expanded]",
    "[aria-controls][aria-autocomplete]",
    'input[readonly][placeholder^="select" i]',
  ],
  /** An input with one of these is a filterable combobox, not a text field. */
  searchable: ["[aria-autocomplete]", '[role="searchbox"]'],
};

/** The popup list, once open. Tried in order. */
export let LISTBOX_SELECTOR: string = [
  '[role="listbox"]',
  '[role="menu"]',
  "ul[aria-labelledby]",
  "[data-tk-listbox]",
].join(",");

/** One option inside that list. */
export let OPTION_SELECTOR: string = [
  '[role="option"]',
  '[role="menuitem"]',
  '[role="menuitemradio"]',
  "li",
].join(",");

/**
 * Longest text an unmarked row may carry and still be read as an option.
 *
 * Meesho's Size list is a `<ul role="menu">` whose rows are bare
 * `<div><svg/><p>M</p></div>` — no role, no <li>, no checkbox input — so
 * OPTION_SELECTOR above matches NOTHING inside it and the size was never
 * chosen on any run. When the strict selector comes back empty we fall back to
 * the innermost elements that carry short text (see optionsIn), and this is the
 * cap that keeps a paragraph of help text from being offered as an option.
 */
export let OPTION_FALLBACK_MAX_LEN = 60;

/**
 * Buttons that COMMIT a list instead of choosing from it.
 *
 * Meesho's Size list only applies what you ticked when "Apply" is pressed, and
 * it does not close on its own — one left open sat over the Neck field for half
 * a run. Matched on the whole normalised label, inside the open list only.
 *
 * NEVER add "save", "submit", "next" or "publish". The seller submits their own
 * catalog; a confirm button here must only ever close a popup.
 */
export let LIST_CONFIRM_LABELS: string[] = ["apply", "done", "ok", "confirm"];

/** The text box inside a combobox that filters the options. */
export const DROPDOWN_SEARCH_SELECTOR = [
  'input[type="text"]',
  'input[type="search"]',
  'input[role="combobox"]',
  "input[aria-autocomplete]",
].join(",");

/** Chips a multiselect shows for its chosen values. */
export const CHIP_SELECTOR = [
  '[role="option"][aria-selected="true"]',
  "[data-tk-chip]",
  '[class*="chip" i]',
  '[class*="tag" i]',
].join(",");

/* ─── F) The category breadcrumb ────────────────────────────────────────── */

/**
 * How we read which category the listing is for, so a profile saved on Kurtis
 * can warn when it is used on Tshirts. Breadcrumbs first, then a labelled
 * "Category" field, then the form's own heading.
 */
export const CATEGORY_HINTS = {
  containers: [
    '[aria-label*="breadcrumb" i]',
    'nav[class*="breadcrumb" i]',
    '[class*="breadcrumb" i]',
    "[data-tk-breadcrumb]",
  ],
  /** Labels whose field value is the category. */
  labels: ["category", "sub category", "sub-category", "product category"],
  /** Separators Meesho uses between breadcrumb levels. */
  separator: /\s*(?:›|>|\/|»|→)\s*/,
  /**
   * Page titles that are NOT categories.
   *
   * The last-resort source for the breadcrumb is the form's own heading, and on
   * Meesho's own upload flow that heading is "Add Single Catalog". It was being
   * reported to the seller as their listing's category, and — worse — saved into
   * a profile's `category_path`, where it silently answered the "is this profile
   * for this listing?" question with a page title. A heading that matches this
   * is no category, and no category is better than a wrong one.
   */
  headingNoise:
    /\b(add|edit|create|update|upload|new|single|bulk|draft|catalog|catalogue|product details|listing|step|dashboard)\b/i,
  /** Longest single-level heading we will accept as a category name. */
  headingMaxLen: 40,
};

/* ─── G) Fields that change on every listing ────────────────────────────── */

/**
 * The "quick overrides" strip: the handful of fields a seller edits per listing
 * while everything else stays the same. Matched against normalizedLabel.
 *
 * Order matters — it is the order they appear in the panel.
 */
export const OVERRIDE_LABEL_PATTERNS: { id: string; re: RegExp }[] = [
  // Deliberately NOT a bare /^name$/: the manufacturer, packer and importer
  // blocks each have a "Name", and those are the fields a seller never changes.
  // Putting them in the per-listing strip is worse than leaving one out.
  { id: "product-name", re: /^(product name|style name|title)$/ },
  { id: "price", re: /(meesho price|selling price|^price$|price per|supplier price)/ },
  { id: "mrp", re: /\bmrp\b/ },
  { id: "return-price", re: /return price/ },
  { id: "size", re: /^(size|sizes|size name)$/ },
  { id: "colour", re: /^(colour|color|shade)$/ },
  { id: "inventory", re: /(inventory|stock|quantity available|qty)/ },
];

/* ─── H) Pacing ─────────────────────────────────────────────────────────── */

/**
 * Timings the fill engine runs on. Meesho's form validates and re-renders as it
 * is typed into, so these are deliberately unhurried — a fill that is two
 * seconds slower and correct beats a fast one that leaves half the fields
 * looking written but unregistered by React.
 */
export const TIMING: {
  retries: number;
  retryBackoffMs: number[];
  perFieldTimeoutMs: number;
  betweenFieldsMs: number;
  settleQuietMs: number;
  settleMaxMs: number;
  optionWaitMs: number;
  scrollSettleMs: number;
  maxPasses: number;
  keyboardSteps: number;
} = {
  /** Attempts per field before it is reported as needing attention. */
  retries: 3,
  /** Backoff between attempts (ms), indexed by attempt number. */
  retryBackoffMs: [120, 320, 640],
  /** Hard ceiling for one field, so a stuck widget can never hang a run. */
  perFieldTimeoutMs: 6000,
  /** Breather between fields so React keeps up. */
  betweenFieldsMs: 90,
  /** A DOM "quiet window" this long means the page has settled. */
  settleQuietMs: 350,
  /** Stop waiting for quiet after this, settled or not. */
  settleMaxMs: 2500,
  /** How long to wait for a dropdown's options to render. */
  optionWaitMs: 1800,
  /** Let layout land after scrolling a field into view, before opening it. */
  scrollSettleMs: 120,
  /** Discovery passes, for fields Meesho reveals only after other choices. */
  maxPasses: 4,
  /** ArrowDown presses before giving up on the keyboard fallback. */
  keyboardSteps: 40,
};

/** How long a highlighted field keeps its outline. */
export const HIGHLIGHT_MS = 2600;

/** Similarity a fuzzy label match must reach (0–1) before it is accepted. */
export let FUZZY_THRESHOLD = 0.82;


/* ════════════════════════════════════════════════════════════════════════════
 *  PART 3 — THE REMOTE HALF
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Everything above is the BUNDLED DEFAULT: what ships in the zip, what runs on
 *  a fresh install, and what the extension falls back to whenever the remote
 *  config is absent, unreachable or invalid. There is no state in which the
 *  adapter has no configuration.
 *
 *  `applyAdapterConfig` overlays an admin-edited config on top. That is how a
 *  Meesho UI change gets fixed in /admin in ten minutes instead of waiting out a
 *  Web Store review.
 *
 *  ── WHY THE BINDINGS ARE `let` ────────────────────────────────────────────
 *  ES modules have live bindings: every module that does
 *  `import { SHIPPING_LABELS } from "./config"` reads the CURRENT value at the
 *  moment it uses it. So one assignment here reaches every consumer, with no
 *  plumbing, no provider and no "did you remember to pass the config down".
 *  Each one is `let` for exactly that reason — a `const` would be inlined by the
 *  bundler and could never change.
 *
 *  ── WHAT THIS FUNCTION IS NOT ALLOWED TO DO ───────────────────────────────
 *  Evaluate anything. The values it assigns are strings handed to
 *  querySelectorAll, words compared against page text, and numbers used as
 *  thresholds. The one exception is `placeholderNoise`, which is compiled with
 *  `new RegExp(source, "i")` — wrapped, so a bad pattern keeps the bundled one.
 *  The payload is validated against a schema before it ever reaches here
 *  (lib/remote-config.ts); this function assumes valid input and still refuses
 *  anything empty, because "the admin cleared every selector" must not be
 *  obeyable.
 */

import type { AdapterConfigPayload } from "@/lib/backend-types";

/** The bundled values, captured before any overlay. `reset()` restores these. */
const BUNDLED = {
  SHIPPING_LABELS: [...SHIPPING_LABELS],
  SHIPPING_NEGATIVE: [...SHIPPING_NEGATIVE],
  MAX_CLIMB,
  FORM_ANCHOR_TEXT: [...FORM_ANCHOR_TEXT],
  EXCLUDE_SELECTORS: [...EXCLUDE_SELECTORS],
  MIN_FORM_CONTROLS,
  FORM_MIN_ANCHORS,
  FORM_COVERAGE: { ...FORM_COVERAGE },
  LABEL_MAX_LEN,
  SECTION_MAX_LEN,
  DEFAULT_SECTION,
  PLACEHOLDER_NOISE,
  DROPDOWN_SELECTORS: [...DROPDOWN_HINTS.selectors],
  LISTBOX_SELECTOR,
  OPTION_SELECTOR,
  OPTION_FALLBACK_MAX_LEN,
  LIST_CONFIRM_LABELS: [...LIST_CONFIRM_LABELS],
  TIMING: { ...TIMING },
  FUZZY_THRESHOLD,
} as const;

/** Which config version is in force. 0 = the bundled defaults, nothing else. */
let activeConfigVersion = 0;

export function adapterConfigVersion(): number {
  return activeConfigVersion;
}

/** Non-empty list of non-blank strings, or undefined. Guards every list below. */
function list(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const clean = value.filter((v): v is string => typeof v === "string" && !!v.trim());
  return clean.length ? clean : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Overlay a validated remote config. Call with `null` to return to the bundled
 * defaults (which is what happens when the admin clears the config entirely).
 *
 * Idempotent: always starts from BUNDLED, so applying config A then config B
 * leaves exactly B's overrides in force rather than A's leftovers.
 */
export function applyAdapterConfig(
  payload: AdapterConfigPayload | null,
  version = 0,
): void {
  /* Reset first. Without this, a key REMOVED from the config in /admin would
   * keep its old override until the browser restarted — the admin would see
   * their deletion do nothing, which is the worst kind of config bug. */
  SHIPPING_LABELS = [...BUNDLED.SHIPPING_LABELS];
  SHIPPING_NEGATIVE = [...BUNDLED.SHIPPING_NEGATIVE];
  MAX_CLIMB = BUNDLED.MAX_CLIMB;
  FORM_ANCHOR_TEXT = [...BUNDLED.FORM_ANCHOR_TEXT];
  EXCLUDE_SELECTORS = [...BUNDLED.EXCLUDE_SELECTORS];
  MIN_FORM_CONTROLS = BUNDLED.MIN_FORM_CONTROLS;
  FORM_MIN_ANCHORS = BUNDLED.FORM_MIN_ANCHORS;
  FORM_COVERAGE = { ...BUNDLED.FORM_COVERAGE };
  LABEL_MAX_LEN = BUNDLED.LABEL_MAX_LEN;
  SECTION_MAX_LEN = BUNDLED.SECTION_MAX_LEN;
  DEFAULT_SECTION = BUNDLED.DEFAULT_SECTION;
  PLACEHOLDER_NOISE = BUNDLED.PLACEHOLDER_NOISE;
  DROPDOWN_HINTS = {
    ...DROPDOWN_HINTS,
    selectors: [...BUNDLED.DROPDOWN_SELECTORS],
  };
  LISTBOX_SELECTOR = BUNDLED.LISTBOX_SELECTOR;
  OPTION_SELECTOR = BUNDLED.OPTION_SELECTOR;
  OPTION_FALLBACK_MAX_LEN = BUNDLED.OPTION_FALLBACK_MAX_LEN;
  LIST_CONFIRM_LABELS = [...BUNDLED.LIST_CONFIRM_LABELS];
  Object.assign(TIMING, BUNDLED.TIMING);
  FUZZY_THRESHOLD = BUNDLED.FUZZY_THRESHOLD;
  activeConfigVersion = 0;

  if (!payload) return;

  /* A) the live shipping read */
  SHIPPING_LABELS = list(payload.shipping?.labels) ?? SHIPPING_LABELS;
  // Negatives may legitimately be emptied — an admin removing "free shipping"
  // from the reject list is a meaningful change, not an accident. So this one
  // accepts an empty array, unlike every list above it.
  if (Array.isArray(payload.shipping?.negative)) {
    SHIPPING_NEGATIVE = payload.shipping.negative.filter(
      (v): v is string => typeof v === "string",
    );
  }
  MAX_CLIMB = num(payload.shipping?.maxClimb) ?? MAX_CLIMB;

  /* B) catalog-form discovery */
  FORM_ANCHOR_TEXT = list(payload.form?.anchorText) ?? FORM_ANCHOR_TEXT;
  EXCLUDE_SELECTORS = list(payload.form?.excludeSelectors) ?? EXCLUDE_SELECTORS;
  MIN_FORM_CONTROLS = num(payload.form?.minControls) ?? MIN_FORM_CONTROLS;
  FORM_MIN_ANCHORS = num(payload.form?.minAnchors) ?? FORM_MIN_ANCHORS;
  FORM_COVERAGE = {
    preferred: num(payload.form?.coverage?.preferred) ?? FORM_COVERAGE.preferred,
    fallback: num(payload.form?.coverage?.fallback) ?? FORM_COVERAGE.fallback,
  };

  /* C) labels and sections */
  LABEL_MAX_LEN = num(payload.labels?.maxLen) ?? LABEL_MAX_LEN;
  SECTION_MAX_LEN = num(payload.labels?.sectionMaxLen) ?? SECTION_MAX_LEN;
  if (payload.labels?.defaultSection?.trim()) {
    DEFAULT_SECTION = payload.labels.defaultSection.trim();
  }
  if (payload.labels?.placeholderNoise) {
    try {
      PLACEHOLDER_NOISE = new RegExp(payload.labels.placeholderNoise, "i");
    } catch {
      // Validated upstream, so this should be unreachable — but a thrown RegExp
      // inside discovery would take the whole adapter down, and the bundled
      // pattern is a perfectly good answer.
      PLACEHOLDER_NOISE = BUNDLED.PLACEHOLDER_NOISE;
    }
  }

  /* D) custom dropdowns */
  const selectors = list(payload.dropdown?.selectors);
  if (selectors) DROPDOWN_HINTS = { ...DROPDOWN_HINTS, selectors };
  const listbox = list(payload.dropdown?.listbox);
  if (listbox) LISTBOX_SELECTOR = listbox.join(",");
  const option = list(payload.dropdown?.option);
  if (option) OPTION_SELECTOR = option.join(",");
  LIST_CONFIRM_LABELS = list(payload.dropdown?.confirmLabels) ?? LIST_CONFIRM_LABELS;
  OPTION_FALLBACK_MAX_LEN =
    num(payload.dropdown?.optionFallbackMaxLen) ?? OPTION_FALLBACK_MAX_LEN;

  /* E) pacing. retryBackoffMs and the two keyboard tunables stay bundled —
   *     they are engine mechanics, not Meesho's UI, so there is nothing an
   *     admin could learn from a live form that would justify changing them. */
  for (const key of [
    "retries",
    "perFieldTimeoutMs",
    "betweenFieldsMs",
    "settleQuietMs",
    "settleMaxMs",
    "optionWaitMs",
    "maxPasses",
  ] as const) {
    const value = num(payload.timing?.[key]);
    if (value !== undefined) TIMING[key] = value;
  }

  FUZZY_THRESHOLD = num(payload.fuzzyThreshold) ?? FUZZY_THRESHOLD;

  activeConfigVersion = version;
}
