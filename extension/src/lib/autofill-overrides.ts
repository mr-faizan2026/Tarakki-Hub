/**
 * Quick overrides — "change only what's different".
 *
 * The whole point of an autofill profile is that a seller's next listing is 90%
 * identical to the last one. What differs is a short, predictable list: the
 * product name, the price, the MRP, the size, the colour, the stock. So when a
 * profile is selected the panel puts exactly those fields in an editable strip at
 * the top, and everything else is filled silently from the profile.
 *
 * Which labels count lives in the adapter's config (OVERRIDE_LABEL_PATTERNS), with
 * every other Meesho label rule, so there is still only one file to edit when
 * their wording changes.
 *
 * Overrides apply to ONE fill by default. "Also save to profile" writes them back.
 */

import { OVERRIDE_LABEL_PATTERNS } from "@/content/meesho/config";
import type { CapturedField, FieldValue } from "./autofill-types";

/** True when this saved field is one a seller usually changes per listing. */
export function isOverrideField(field: CapturedField): boolean {
  return OVERRIDE_LABEL_PATTERNS.some((p) => p.re.test(field.normalizedLabel));
}

/**
 * The override strip, in the order defined by OVERRIDE_LABEL_PATTERNS (product
 * name first, then price, …) rather than the order they happen to sit on the form.
 */
export function overrideFields(fields: CapturedField[]): CapturedField[] {
  const rank = (field: CapturedField): number => {
    const index = OVERRIDE_LABEL_PATTERNS.findIndex((p) => p.re.test(field.normalizedLabel));
    return index < 0 ? OVERRIDE_LABEL_PATTERNS.length : index;
  };
  return fields.filter(isOverrideField).sort((a, b) => rank(a) - rank(b));
}

/**
 * Apply the seller's edits to a profile's field list, leaving everything else
 * untouched. An override whose key is not in the profile is ignored rather than
 * appended — the panel can only offer keys that came from the profile.
 */
export function applyOverrides(
  fields: CapturedField[],
  overrides: Record<string, FieldValue>,
): CapturedField[] {
  return fields.map((field) =>
    Object.prototype.hasOwnProperty.call(overrides, field.key)
      ? { ...field, value: overrides[field.key] }
      : field,
  );
}

/** Show a saved value in a single-line input. */
export function valueToText(value: FieldValue): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ");
  return value;
}

/** Read an edited input back into the shape the original value had. */
export function textToValue(text: string, original: FieldValue): FieldValue {
  if (typeof original === "boolean") return /^(yes|true|on|1)$/i.test(text.trim());
  if (Array.isArray(original)) {
    return text
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return text;
}
