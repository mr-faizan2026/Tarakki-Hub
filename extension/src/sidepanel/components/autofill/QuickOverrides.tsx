import { useMemo } from "react";
import type { CapturedField, FieldValue } from "@/lib/autofill-types";
import { overrideFields, textToValue, valueToText } from "@/lib/autofill-overrides";
import { Icon } from "../../ui/Icon";

/**
 * "Change only what's different."
 *
 * A compact strip of just the fields that vary per listing — product name, price,
 * MRP, return price, size, colour, inventory. Everything else in the profile is
 * filled without being shown, which is the entire time saving.
 *
 * Edits here apply to THIS fill only. "Also save to profile" writes them back, for
 * the case where the change is permanent (a new MRP, a renamed style).
 */
export function QuickOverrides({
  fields,
  overrides,
  onChange,
  alsoSave,
  onAlsoSaveChange,
  disabled,
}: {
  fields: CapturedField[];
  overrides: Record<string, FieldValue>;
  onChange: (key: string, value: FieldValue) => void;
  alsoSave: boolean;
  onAlsoSaveChange: (value: boolean) => void;
  disabled: boolean;
}) {
  const strip = useMemo(() => overrideFields(fields), [fields]);
  if (!strip.length) return null;

  const edited = strip.some(
    (f) =>
      Object.prototype.hasOwnProperty.call(overrides, f.key) &&
      valueToText(overrides[f.key]) !== valueToText(f.value),
  );

  return (
    <div className="af-overrides">
      <div className="row spread">
        <span className="opt-label">Change for this listing</span>
        {edited ? <span className="af-edited">Edited</span> : null}
      </div>

      <div className="af-overrides__grid">
        {strip.map((field) => {
          const current = Object.prototype.hasOwnProperty.call(overrides, field.key)
            ? overrides[field.key]
            : field.value;
          return (
            <label key={field.key} className="af-override">
              <span className="af-override__label">{field.label}</span>
              <input
                className="input af-override__input"
                value={valueToText(current)}
                inputMode={field.type === "number" ? "decimal" : undefined}
                disabled={disabled}
                onChange={(e) => onChange(field.key, textToValue(e.target.value, field.value))}
              />
            </label>
          );
        })}
      </div>

      <label className="switch-row" style={{ marginTop: 8 }}>
        <span className="hint">
          <Icon name="check" size={13} style={{ verticalAlign: "-2px" }} /> Save to profile
        </span>
        <input
          type="checkbox"
          className="switch"
          checked={alsoSave}
          disabled={disabled || !edited}
          onChange={(e) => onAlsoSaveChange(e.target.checked)}
        />
      </label>
    </div>
  );
}
