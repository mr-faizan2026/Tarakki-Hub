/**
 * Autofill — the shared vocabulary.
 *
 * These types are the contract between three places that must agree exactly:
 *   • the content script that reads and writes the Meesho form
 *     (content/meesho/…),
 *   • the side panel that shows and edits profiles (sidepanel/components/autofill),
 *   • the `fields` jsonb column in public.autofill_profiles.
 *
 * Nothing here imports anything, on purpose: the content script must be able to
 * use it without pulling in Supabase or React.
 *
 * ── WHY A FIELD IS IDENTIFIED THE WAY IT IS ────────────────────────────────
 * Meesho's catalog form is a React SPA. Its class names are generated and its
 * DOM order shifts between deploys, so an absolute XPath or a `.css-1x2y3z`
 * selector is worthless the week after it is written. What DOES survive is what
 * the seller sees: the section heading, the field's visible label, and — for
 * repeated blocks like manufacturer / packer / importer — which occurrence of
 * that label it is. That triple is the identity we store and match on. Element
 * attributes (name/id/data-*) are kept as SECONDARY hints only, because Meesho
 * supplies them inconsistently.
 */

/**
 * The control kinds the adapter understands.
 *
 *   text       — single-line input (text/tel/email/url, and anything untyped)
 *   textarea   — multi-line input or a contenteditable box
 *   number     — numeric input (type=number, or text with a numeric inputmode)
 *   select     — a real <select>
 *   dropdown   — a custom React dropdown: a trigger showing the selected text,
 *                an options list that appears on click. No text entry.
 *   combobox   — a custom dropdown you can type into to filter
 *   radio      — one choice out of a group (stored as the chosen option's text)
 *   checkbox   — a single on/off box (stored as a boolean)
 *   multiselect — several values at once: <select multiple>, a multi-selectable
 *                listbox, or a chips widget
 */
export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "select"
  | "dropdown"
  | "combobox"
  | "radio"
  | "checkbox"
  | "multiselect";

/**
 * What a field holds. Dropdowns store the visible OPTION TEXT, never an internal
 * id — ids are Meesho's private business and change; the text is what the seller
 * picked and what we can find again on the page.
 */
export type FieldValue = string | string[] | boolean;

/** Secondary, best-effort match hints. Present only when Meesho supplies them. */
export type FieldAttrs = {
  name?: string;
  id?: string;
  /** Any data-testid / data-test / data-qa style hook, whichever exists. */
  testId?: string;
  ariaLabel?: string;
  placeholder?: string;
};

/** One captured field — exactly what a row of `autofill_profiles.fields` holds. */
export type CapturedField = {
  /** `section|normalizedLabel|occurrence`. Stable across deploys; used by the
   *  panel to address a field (exclude it, edit it, scroll to it). */
  key: string;
  /** The label as the seller sees it on the form. */
  label: string;
  /** label lower-cased, asterisks/punctuation stripped, whitespace collapsed. */
  normalizedLabel: string;
  /** Nearest section heading, e.g. "Product Details". Disambiguates duplicate
   *  labels (a "Name" under Manufacturer vs one under Packer). */
  section: string;
  type: FieldType;
  value: FieldValue;
  /** Index among fields sharing the same section + normalizedLabel, from 0. */
  occurrence: number;
  attrs?: FieldAttrs;
};

/** How confidently a live control was matched to a saved field. */
export type MatchConfidence = "exact" | "label" | "attrs" | "fuzzy" | "none";

/**
 * A control as the adapter currently sees it on the page. Used by the capture
 * preview and by the developer field-scan view.
 */
export type ScannedField = CapturedField & {
  /** True when the seller has left this control blank. */
  empty: boolean;
  /** Meesho marks this field as one the catalog can't be submitted without. */
  required: boolean;
  /** Visible option texts, for the types that have options. */
  options?: string[];
  /** Only set by the field-scan view, when a profile is selected to compare. */
  confidence?: MatchConfidence;
};

/** Is a catalog form on screen right now, and what is it? */
export type FormStatus = {
  /** True when a Meesho catalog add/edit form was found on this page. */
  present: boolean;
  /** Controls the adapter can see inside it. */
  fieldCount: number;
  /** How many of those the seller has already filled. */
  filledCount: number;
  /** The category breadcrumb the form shows, e.g. "Women Western › Kurtis". */
  categoryPath: string | null;
  /** The page URL the status was computed for (SPA routes change without a load). */
  url: string;
};

export const EMPTY_FORM_STATUS: FormStatus = {
  present: false,
  fieldCount: 0,
  filledCount: 0,
  categoryPath: null,
  url: "",
};

/** What happened to one field in a fill run. */
export type FillOutcome =
  /** Written and read back successfully. */
  | "filled"
  /** Deliberately not written — see `reason`. */
  | "skipped"
  /** Tried and could not verify — the seller must finish it by hand. */
  | "failed";

export type FillItem = {
  key: string;
  label: string;
  section: string;
  outcome: FillOutcome;
  /** Plain-English why, shown in the result list. */
  reason: string;
  /** How the live control was found (absent for skipped-because-missing). */
  confidence?: MatchConfidence;
};

/** A control Meesho marks required that is STILL empty when a run ends. */
export type UnfilledRequired = {
  key: string;
  label: string;
  section: string;
  /** True when the profile carried no value for it at all — the usual cause. */
  outsideProfile: boolean;
};

export type FillResult = {
  items: FillItem[];
  filled: number;
  skipped: number;
  failed: number;
  /** True when the seller pressed Cancel; the fields already written stay. */
  cancelled: boolean;
  /** How many discovery passes ran (cascading fields need more than one). */
  passes: number;
  /**
   * Required boxes the form still has empty, read back off the page after the
   * run — NOT derived from the profile.
   *
   * A profile only ever covers the fields it was captured with, so a run that
   * fills every one of them can still leave Inventory, price and MRP blank and
   * report "Filled 21 · Skipped 0" in green over a catalog Meesho will refuse.
   * The run's own field list cannot show that; only the form can.
   */
  stillRequired: UnfilledRequired[];
};

/** Live progress, pushed from the content script while a run is going. */
export type FillProgress = {
  running: boolean;
  done: number;
  total: number;
  /** The label currently being written, for "Filling Fabric…". */
  label: string;
  pass: number;
};

/** The request that starts a run. */
export type FillRequest = {
  /** The fields to write, already narrowed by the seller (overrides applied). */
  fields: CapturedField[];
  /** false (default) = fill only empty controls. */
  overwrite: boolean;
};

/** Which outline to draw when the seller taps a result row. */
export type HighlightTone = "ok" | "problem";
