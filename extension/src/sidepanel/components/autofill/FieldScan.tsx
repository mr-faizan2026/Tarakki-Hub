import { useCallback, useEffect, useState } from "react";
import type { CapturedField, MatchConfidence, ScannedField } from "@/lib/autofill-types";
import { valueToText } from "@/lib/autofill-overrides";
import { sendToBackground } from "@/lib/messages";
import { Icon } from "../../ui/Icon";

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  FIELD SCAN — the developer view, and the first thing to open when Meesho
 *  changes their UI.
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Hidden behind DEV_TOOLS (on in `npm run dev`; set VITE_DEV_TOOLS=true to keep
 *  it in a production build). It lists EVERY control the adapter detects on the
 *  current page with the label, section, type and value it resolved — and, when a
 *  profile is selected, how confidently each control matches it.
 *
 *  USE IT FIRST. Detection is the foundation: capture, matching and filling are
 *  all downstream of it, so tuning
 *  `content/meesho/config.ts` against this list is the fastest way to fix anything.
 *  The table at the top of that file maps each symptom to the exact constant.
 *
 *  Tapping a row rings that field on the Meesho page, so a wrong label can be
 *  traced to the actual box in one click.
 */
export function FieldScan({
  tabId,
  profileFields,
  onClose,
}: {
  tabId: number | null;
  profileFields: CapturedField[] | null;
  onClose: () => void;
}) {
  const [fields, setFields] = useState<ScannedField[]>([]);
  const [meta, setMeta] = useState<{ categoryPath: string | null; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const scan = useCallback(async () => {
    if (tabId == null) {
      setError("Open your supplier panel to scan.");
      return;
    }
    setLoading(true);
    setError(null);
    const res = await sendToBackground({
      type: "SCAN_FIELDS",
      tabId,
      profileFields,
    }).catch(() => null);
    setLoading(false);
    if (!res?.ok) {
      setFields([]);
      setError(res?.error ?? "Couldn't reach your supplier panel.");
      return;
    }
    setFields(res.fields);
    setMeta({ categoryPath: res.categoryPath, url: res.url });
  }, [tabId, profileFields]);

  useEffect(() => {
    void scan();
  }, [scan]);

  async function reveal(field: ScannedField) {
    if (tabId == null) return;
    await sendToBackground({ type: "HIGHLIGHT_FIELD", tabId, key: field.key, tone: "ok" }).catch(
      () => null,
    );
  }

  function copyAll() {
    const text = JSON.stringify({ meta, fields }, null, 2);
    void navigator.clipboard.writeText(text).catch(() => {});
  }

  return (
    <div className="stack af-scan">
      <div className="row spread">
        <span className="eyebrow">Field scan · dev</span>
        <div className="row" style={{ gap: 4 }}>
          <button type="button" className="btn btn-ghost btn--sm" onClick={copyAll} title="Copy as JSON">
            <Icon name="copy" size={13} />
          </button>
          <button
          type="button"
          className="btn btn-ghost btn--sm"
          onClick={() => void scan()}
          aria-label="Scan this page again"
          title="Scan again"
        >
            <Icon name="refresh" size={13} className={loading ? "spin" : undefined} />
          </button>
          <button
          type="button"
          className="btn btn-ghost btn--sm"
          onClick={onClose}
          aria-label="Close the field scan"
          title="Close"
        >
            <Icon name="close" size={13} />
          </button>
        </div>
      </div>

      {error ? <div className="alert">{error}</div> : null}

      {meta ? (
        <p className="hint" style={{ wordBreak: "break-all" }}>
          {fields.length} controls detected
          {meta.categoryPath ? ` · ${meta.categoryPath}` : ""}
          <br />
          {meta.url}
        </p>
      ) : null}

      <div className="af-list">
        {fields.map((field) => (
          <button
            key={field.key}
            type="button"
            className="af-item af-item--ok"
            onClick={() => void reveal(field)}
          >
            <span className="af-row__body">
              <span className="af-row__label">
                {field.label}
                {field.occurrence > 0 ? ` #${field.occurrence + 1}` : ""}
              </span>
              <span className="af-row__value">
                {field.section} · {field.type}
                {field.empty ? " · empty" : ` · ${valueToText(field.value)}`}
              </span>
              {field.options?.length ? (
                <span className="af-row__value">
                  {field.options.length} options: {field.options.slice(0, 4).join(", ")}
                  {field.options.length > 4 ? "…" : ""}
                </span>
              ) : null}
            </span>
            {field.confidence ? <Confidence value={field.confidence} /> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function Confidence({ value }: { value: MatchConfidence }) {
  return <span className={`af-conf af-conf--${value}`}>{value}</span>;
}
