/**
 * A real <select>.
 *
 * Matched by OPTION TEXT, never by the option's `value` attribute: the value is
 * Meesho's internal id and changes without notice, while the text is what the
 * seller chose and what we stored.
 */

import { currentValue } from "../discovery";
import { fireInputChange, tidy } from "../dom";
import { asText, bestOption, fail, ok, valuesEqual, type FillHandler } from "./shared";

export const fillNativeSelect: FillHandler = async (field, value) => {
  const el = field.el;
  if (!(el instanceof HTMLSelectElement)) {
    return fail("This dropdown changed type — fill it by hand.");
  }

  const wanted = asText(value);
  const options = Array.from(el.options);
  const option = bestOption(options, (o) => tidy(o.text), wanted);
  if (!option) {
    return fail(`"${wanted}" is not offered on this form.`);
  }

  el.value = option.value;
  option.selected = true;
  fireInputChange(el);

  return valuesEqual(currentValue(field), tidy(option.text))
    ? ok("Selected")
    : fail("Selected the option but the form did not keep it.");
};
