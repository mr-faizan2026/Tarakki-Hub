import { useMemo, useState } from "react";
import type { CapturedField } from "@/lib/autofill-types";
import { valueToText } from "@/lib/autofill-overrides";
import { Icon } from "../../ui/Icon";

/**
 * Feature D, step 2 — show what was captured BEFORE it is saved.
 *
 * A seller is about to store the contents of their listing form in their account,
 * so they get to see the list and untick anything they would rather not keep. It
 * is also the first place a detection mistake becomes visible: a field labelled
 * "Select" or a value that reads like a placeholder is obvious here, and one
 * untick fixes it.
 */
export function CapturePreview({
  name,
  categoryPath,
  fields,
  saving,
  onCancel,
  onSave,
  showStorageNotice,
  includeEmpty = false,
}: {
  name: string;
  categoryPath: string | null;
  fields: CapturedField[];
  saving: boolean;
  onCancel: () => void;
  onSave: (fields: CapturedField[]) => void;
  /** First save ever: say plainly where these values go. */
  showStorageNotice: boolean;
  /** Whether blank controls were captured too, so the count reads truthfully. */
  includeEmpty?: boolean;
}) {
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const kept = useMemo(
    () => fields.filter((f) => !excluded.has(f.key)),
    [fields, excluded],
  );

  const bySection = useMemo(() => {
    const groups = new Map<string, CapturedField[]>();
    for (const field of fields) {
      const list = groups.get(field.section) ?? [];
      list.push(field);
      groups.set(field.section, list);
    }
    return Array.from(groups.entries());
  }, [fields]);

  function toggle(key: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="stack">
      <div className="row spread">
        <div>
          <div className="af-strong">
            Found {fields.length} {includeEmpty ? "fields" : "filled fields"}
          </div>
          <div className="hint">
            Saving as “{name}”
            {categoryPath ? ` · ${categoryPath}` : ""}
          </div>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn--sm"
          onClick={onCancel}
          aria-label="Cancel and go back"
          title="Cancel"
        >
          <Icon name="close" size={14} />
        </button>
      </div>

      {showStorageNotice ? (
        <p className="af-notice">
          Saved to your TarakkiHub account, to reuse on your next catalog.
        </p>
      ) : null}

      <div className="af-list">
        {bySection.map(([section, group]) => (
          <div key={section} className="af-list__group">
            <div className="af-list__section">{section}</div>
            {group.map((field) => {
              const on = !excluded.has(field.key);
              return (
                <label key={field.key} className="af-row">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(field.key)}
                    aria-label={`Include ${field.label}`}
                  />
                  <span className="af-row__body">
                    <span className="af-row__label">{field.label}</span>
                    <span className="af-row__value">{valueToText(field.value) || "—"}</span>
                  </span>
                  <span className="af-type">{field.type}</span>
                </label>
              );
            })}
          </div>
        ))}
      </div>

      <div className="row" style={{ gap: 7 }}>
        <button
          type="button"
          className="btn btn-primary"
          style={{ flex: 1 }}
          disabled={saving || kept.length === 0}
          onClick={() => onSave(kept)}
        >
          {saving ? (
            <>
              <Icon name="refresh" size={15} className="spin" /> Saving…
            </>
          ) : (
            <>
              <Icon name="check" size={15} /> Save {kept.length} fields
            </>
          )}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </div>
  );
}
