import type { PanelPricingContext } from "@/lib/messages";
import { describeAge } from "../hooks/usePanelContext";
import { Icon } from "../ui/Icon";

/**
 * Where a quote's rupee figure comes from.
 *
 * This IS a gate. Every quote is a re-issue of the supplier panel's own pricing
 * request with one field changed, so without a captured request there is no
 * quote at all. An earlier version treated the capture as a nicety and filled
 * the gaps with constants — a ₹300 price, 5% GST, invented match flags — and
 * produced ₹288 for a photo the seller's panel was pricing at ₹110.
 *
 *   "panel"  — mirror the panel's own last pricing request verbatim. The
 *              default, and the only basis that can be checked against the
 *              panel's own displayed figure.
 *   "manual" — same mirror, with the selling price overridden. For a seller
 *              sanity-checking a price they haven't typed into Meesho yet.
 *
 * ── WHY THERE IS NO EXPLANATORY COPY LEFT IN HERE ──────────────────────────
 * All of it was saying one of two things that are now said once, elsewhere:
 * the "do this first" lines are the status pill's and the generator's single
 * blocker, and the "every quote re-asks Meesho your panel's own question" line
 * is folded into the generator's own Explain. What survives is what the seller
 * cannot work out for themselves: the exact price, GST and shipping we would be
 * mirroring, and how old that reading is. That pill is data, so it stays.
 */

export type PricingMode = "panel" | "manual";

/** Meesho's GST slabs, as the panel's own selector offers them. */
export const GST_OPTIONS = [0, 3, 5, 12, 18] as const;

export function PricingBasis({
  context,
  refreshing,
  onRefresh,
  mode,
  onMode,
  price,
  onPrice,
  gst,
  onGst,
  disabled,
}: {
  context: PanelPricingContext;
  refreshing: boolean;
  onRefresh: () => void;
  mode: PricingMode;
  onMode: (mode: PricingMode) => void;
  /** Kept as strings so the field can be empty while being typed. */
  price: string;
  onPrice: (value: string) => void;
  gst: string;
  onGst: (value: string) => void;
  disabled: boolean;
}) {
  const canMirror = context.captured;
  const mirroring = mode === "panel" && canMirror;

  return (
    <div className="opt-group">
      <span className="opt-label row spread">
        <span>Price against</span>
        <button
          type="button"
          className="btn btn-ghost btn--sm"
          style={{ padding: "0 6px", height: 20 }}
          onClick={onRefresh}
          disabled={refreshing || disabled}
          title="Re-read what your supplier panel is pricing"
        >
          <Icon name="refresh" size={13} className={refreshing ? "spin" : undefined} />
        </button>
      </span>

      <div className="chips">
        <button
          type="button"
          className={mirroring ? "chip active" : "chip"}
          onClick={() => onMode("panel")}
          disabled={disabled || !canMirror}
          title={
            canMirror
              ? "Use the exact price and GST your supplier panel is using"
              : "Type a price in your supplier panel first"
          }
        >
          My panel&apos;s listing
        </button>
        <button
          type="button"
          className={mode === "manual" ? "chip active" : "chip"}
          onClick={() => onMode("manual")}
          disabled={disabled}
        >
          A price I type
        </button>
      </div>

      {/* The one thing here the seller can't see anywhere else: exactly what we
          would mirror, and how stale it is. */}
      {canMirror ? (
        <div className={context.stale ? "pill warn" : "pill connected"}>
          <span className="dot" />
          <span style={{ flex: 1, minWidth: 0 }}>
            ₹{context.price?.toLocaleString("en-IN")}
            {context.gstPercent != null ? ` · ${context.gstPercent}% GST` : " · no GST"}
            {context.shipping != null
              ? ` · ₹${context.shipping.toLocaleString("en-IN")} ship`
              : ""}
            {" · "}
            {describeAge(context.ageMs)}
          </span>
        </div>
      ) : null}

      {context.stale && canMirror ? (
        <span className="hint">Older reading — re-price in your panel.</span>
      ) : null}

      {mode === "manual" ? (
        <div className="row" style={{ gap: 8, marginTop: 2 }}>
          <label className="field" style={{ flex: 1, minWidth: 0 }}>
            <span className="opt-label">Selling price (₹)</span>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              min={1}
              placeholder="e.g. 499"
              value={price}
              onChange={(e) => onPrice(e.target.value)}
              disabled={disabled}
            />
          </label>
          <label className="field" style={{ width: 104, flex: "none" }}>
            <span className="opt-label">GST %</span>
            <select
              className="select"
              value={gst}
              onChange={(e) => onGst(e.target.value)}
              disabled={disabled}
              style={{ height: 38 }}
            >
              <option value="">Not set</option>
              {GST_OPTIONS.map((g) => (
                <option key={g} value={String(g)}>
                  {g}%
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
    </div>
  );
}
