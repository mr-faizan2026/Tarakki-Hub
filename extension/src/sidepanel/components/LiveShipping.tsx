import { useState } from "react";
import type { PanelPricingContext, TabState } from "@/lib/messages";
import { describeAge } from "../hooks/usePanelContext";
import { Icon } from "../ui/Icon";
import { Explain } from "../ui/Explain";

/**
 * Feature A — the live shipping charge, read from the supplier panel. Shows the
 * real number Meesho currently displays, or a plain "—". Never fabricates a
 * value.
 *
 * ── WHY THIS CARD TAKES THE PANEL CONTEXT TOO ──────────────────────────────
 * There are two ways to learn what Meesho is charging this listing, and this
 * card used to know only one of them:
 *
 *   • the DOM read (`tab.shipping`) — the figure printed on the screen in front
 *     of the seller, which exists only while a price breakdown is on screen;
 *   • the panel's own last pricing CALL (`panel.shipping`, captured by
 *     public/panel-probe.js) — the same number, straight from the response
 *     Meesho sent, which survives navigating away from the breakdown.
 *
 * Reading only the first made this card contradict the one below it: it said
 * "Shipping not detected" while the low-shipping card underneath was happily
 * mirroring a perfectly good captured figure. Both cards now answer from both
 * readings.
 *
 * ── THIS CARD NO LONGER GIVES INSTRUCTIONS ─────────────────────────────────
 * It used to end each empty state with a paragraph telling the seller to reload
 * the tab or type a price, and to mention that the card below was waiting on
 * the same thing. The status pill above says that now, once. A card whose job
 * is to show one number should be readable in one glance, and three lines of
 * grey text under a big "—" is not that.
 */
export function LiveShipping({
  tab,
  panel,
  onReread,
}: {
  tab: TabState;
  panel: PanelPricingContext;
  onReread: () => Promise<void>;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const onMeesho = tab.meeshoTabId != null;
  /** What the page is showing right now. */
  const onScreen = tab.shipping.value;
  /** What Meesho last answered the panel, whether or not it is still on screen. */
  const captured = panel.captured ? panel.shipping : null;

  async function reread() {
    setRefreshing(true);
    try {
      await onReread();
    } finally {
      setRefreshing(false);
    }
  }

  const amount = onScreen ?? captured;

  return (
    <section className="section shipping">
      <div className="row spread">
        <span className="eyebrow">Live shipping</span>
        {onMeesho ? (
          <button
            type="button"
            className="btn btn-ghost btn--sm"
            onClick={reread}
            disabled={refreshing}
            title="Re-read from the page"
            style={{ padding: "0 8px" }}
          >
            <Icon name="refresh" size={15} className={refreshing ? "spin" : undefined} />
          </button>
        ) : null}
      </div>

      <div className="shipping__value">
        <span className={amount == null ? "shipping__amount is-empty" : "shipping__amount"}>
          {amount != null ? `₹${amount.toLocaleString("en-IN")}` : "—"}
        </span>
      </div>

      {onScreen != null ? (
        <p className="shipping__sub">
          <span className="live-dot" />
          Live from your panel
        </p>
      ) : captured != null ? (
        <p className="shipping__sub">
          Your panel&apos;s last price check · {describeAge(panel.ageMs)}
        </p>
      ) : (
        <p className="shipping__sub">
          {!onMeesho ? "Waiting for your supplier panel" : "Not on this screen yet"}
        </p>
      )}

      <Explain label="Where from?">
        This is read live from your own supplier panel — either the figure printed on
        screen, or Meesho&apos;s answer to your panel&apos;s last price check. TarakkiHub
        never estimates shipping.
      </Explain>
    </section>
  );
}
