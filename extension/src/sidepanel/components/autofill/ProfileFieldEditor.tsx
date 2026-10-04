import { useMemo, useState } from "react";
import type { CapturedField } from "@/lib/autofill-types";
import { textToValue, valueToText } from "@/lib/autofill-overrides";
import type { AutofillProfile } from "@/lib/autofill-store";
import { Icon } from "../../ui/Icon";

/**
 * Edit one saved profile's fields: change a value, or drop a field entirely.
 *
 * There is deliberately no reordering. The order comes from the page — that is how
 * `occurrence` stays meaningful for repeated blocks (manufacturer / packer /
 * importer all carry a "Name"), and shuffling it would break matching for no gain.
 *
 * Nothing is written until Save, so a seller can back out of an edit.
 */
export function ProfileFieldEditor({
  profile,
  saving,
  onBack,
  onSave,
}: {
  profile: AutofillProfile;
  saving: boolean;
  onBack: () => void;
  onSave: (fields: CapturedField[]) => void;
}) {
  const [fields, setFields] = useState<CapturedField[]>(profile.fields);

  const bySection = useMemo(() => {
    const groups = new Map<string, CapturedField[]>();
    for (const field of fields) {
      const list = groups.get(field.section) ?? [];
      list.push(field);
      groups.set(field.section, list);
    }
    return Array.from(groups.entries());
  }, [fields]);

  const dirty =
    fields.length !== profile.fields.length ||
    fields.some((field, i) => {
      const original = profile.fields[i];
      return (
        !original ||
        original.key !== field.key ||
        valueToText(original.value) !== valueToText(field.value)
      );
    });

  function setValue(key: string, text: string) {
    setFields((prev) =>
      prev.map((field) =>
        field.key === key ? { ...field, value: textToValue(text, field.value) } : field,
      ),
    );
  }

  function removeField(key: string) {
    setFields((prev) => prev.filter((field) => field.key !== key));
  }

  return (
    <div className="stack">
      <div className="row spread">
        <button type="button" className="btn btn-ghost btn--sm" onClick={onBack}>
          <Icon name="arrowRight" size={14} style={{ transform: "rotate(180deg)" }} />
          Back
        </button>
        <span className="hint">
          {fields.length} field{fields.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="af-strong">{profile.name}</div>

      <div className="af-list">
        {bySection.map(([section, group]) => (
          <div key={section} className="af-list__group">
            <div className="af-list__section">{section}</div>
            {group.map((field) => (
              <div key={field.key} className="af-edit">
                <div className="row spread">
                  <span className="af-override__label">{field.label}</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn--sm"
                    onClick={() => removeField(field.key)}
                    title={`Remove ${field.label} from this profile`}
                  >
                    <Icon name="trash" size={13} />
                  </button>
                </div>
                <input
                  className="input"
                  value={valueToText(field.value)}
                  onChange={(e) => setValue(field.key, e.target.value)}
                />
                <span className="af-type">{field.type}</span>
              </div>
            ))}
          </div>
        ))}
        {fields.length === 0 ? (
          <p className="hint">
            Every field is removed. Saving now leaves an empty profile — capture the
            form again instead.
          </p>
        ) : null}
      </div>

      <button
        type="button"
        className="btn btn-primary btn--block"
        disabled={saving || !dirty}
        onClick={() => onSave(fields)}
      >
        {saving ? (
          <>
            <Icon name="refresh" size={15} className="spin" /> Saving…
          </>
        ) : (
          <>
            <Icon name="check" size={15} /> Save changes
          </>
        )}
      </button>
    </div>
  );
}
