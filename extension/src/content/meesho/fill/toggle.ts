/**
 * radio · checkbox — clicked, never assigned.
 *
 * Setting `input.checked = true` updates the box and tells React nothing, and on
 * a radio group it can leave two options looking selected. A real click is both
 * more honest and more reliable, so these handlers click — and only when the
 * current state actually differs, so a box the seller already ticked is never
 * toggled off.
 */

import { currentValue } from "../discovery";
import { realClick, textOf, tidy, waitForSettle } from "../dom";
import {
  asText,
  bestOption,
  fail,
  ok,
  valuesEqual,
  type FillHandler,
} from "./shared";

export const fillCheckbox: FillHandler = async (field, value) => {
  const wanted =
    typeof value === "boolean" ? value : /^(yes|true|on|1|checked)$/i.test(asText(value));
  const current = currentValue(field) === true;
  if (current === wanted) return ok(wanted ? "Already ticked" : "Already unticked");

  realClick(field.el);
  await waitForSettle(field.wrapper);

  return currentValue(field) === wanted
    ? ok(wanted ? "Ticked" : "Unticked")
    : fail("The tick did not register — set it by hand.");
};

export const fillRadio: FillHandler = async (field, value) => {
  const wanted = tidy(asText(value));
  if (!wanted) return fail("Nothing saved for this field.");
  if (valuesEqual(currentValue(field), wanted)) return ok("Already chosen");

  const members = field.members.length ? field.members : [field.el];
  const target = bestOption(members, (m) => optionText(m), wanted);
  if (!target) return fail(`"${wanted}" is not one of the choices here.`);

  realClick(target);
  await waitForSettle(field.wrapper);

  return valuesEqual(currentValue(field), wanted)
    ? ok("Chosen")
    : fail("Clicked the choice but the form did not keep it.");
};

/** The label beside one radio, which is what we matched the saved value against. */
function optionText(el: HTMLElement): string {
  const aria = tidy(el.getAttribute("aria-label"));
  if (aria) return aria;
  const label = el.closest("label");
  if (label) return textOf(label);
  if (el.id) {
    const forLabel = (el.getRootNode() as ParentNode).querySelector(`label[for="${el.id}"]`);
    if (forLabel) return textOf(forLabel);
  }
  return textOf(el.parentElement) || (el instanceof HTMLInputElement ? tidy(el.value) : "");
}
