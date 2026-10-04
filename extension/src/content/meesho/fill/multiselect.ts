/**
 * multiselect · chips — several values in one control.
 *
 * Two shapes on Meesho's form: a native `<select multiple>` (rare), and a chips
 * widget built on a combobox (sizes, occasions, patterns). The chips case reuses
 * the dropdown strategy chain once per value, which is what makes it survive
 * virtualised lists.
 *
 * Values the form does not offer are SKIPPED, not forced: a saved "3XL" on a
 * listing whose category stops at XL simply is not available, and the run says so
 * rather than leaving the widget in a half-typed state.
 */

import { currentValue } from "../discovery";
import { fireInputChange, normalizeLabel, tidy } from "../dom";
import { selectFromDropdown } from "./dropdown";
import { asList, fail, ok, type FillHandler } from "./shared";

export const fillMultiselect: FillHandler = async (field, value, ctx) => {
  const wanted = asList(value);
  if (!wanted.length) return fail("Nothing saved for this field.");

  /* ── a real <select multiple> ── */
  if (field.el instanceof HTMLSelectElement) {
    const select = field.el;
    const options = Array.from(select.options);
    let picked = 0;
    const missing: string[] = [];

    for (const want of wanted) {
      const option = options.find((o) => normalizeLabel(tidy(o.text)) === normalizeLabel(want));
      if (!option) {
        missing.push(want);
        continue;
      }
      option.selected = true;
      picked += 1;
    }
    fireInputChange(select);

    if (!picked) return fail("None of those values are offered here.");
    return ok(
      missing.length
        ? `Selected ${picked} · not offered: ${missing.join(", ")}`
        : `Selected ${picked}`,
    );
  }

  /* ── a chips widget ── */
  const have = () => asList(currentValue(field)).map(normalizeLabel);
  const missing: string[] = [];
  let added = 0;

  for (const want of wanted) {
    if (ctx.cancelled()) break;
    if (have().includes(normalizeLabel(want))) continue;

    const result = await selectFromDropdown(field, want, ctx, () =>
      have().includes(normalizeLabel(want)),
    );
    if (result.ok) added += 1;
    else missing.push(want);
  }

  if (ctx.cancelled() && !added) return fail("Cancelled");
  const present = have();
  const confirmed = wanted.filter((w) => present.includes(normalizeLabel(w)));
  if (!confirmed.length) return fail("Could not add any of those values.");

  return ok(
    missing.length
      ? `Added ${confirmed.length} · not offered: ${missing.join(", ")}`
      : `Added ${confirmed.length}`,
  );
};
