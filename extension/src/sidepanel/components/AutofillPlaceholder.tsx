import { Icon } from "../ui/Icon";

/**
 * Locked placeholder for the upcoming Listing Autofill feature. Non-functional
 * by design — it just signals what's coming next so the panel's scope is clear.
 */
export function AutofillPlaceholder() {
  return (
    <section className="section locked" aria-disabled="true">
      <div className="locked__head">
        <div className="section__title" style={{ color: "var(--ink-500)" }}>
          <Icon name="sliders" size={18} />
          Listing autofill
        </div>
        <span className="badge-soon">Coming in the next update</span>
      </div>
      <p className="hint" style={{ marginTop: 8 }}>
        Save a listing template once and autofill any catalog in one click —
        product name, HSN, GST, description and more. Landing in a later update.
      </p>
      <button type="button" className="btn btn-secondary btn--block" disabled style={{ marginTop: 12 }}>
        <Icon name="lock" size={15} />
        Locked
      </button>
    </section>
  );
}
