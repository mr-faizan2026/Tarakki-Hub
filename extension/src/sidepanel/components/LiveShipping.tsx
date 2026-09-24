import { useState } from "react";
import type { TabState } from "@/lib/messages";
import { Icon } from "../ui/Icon";

/**
 * Feature A — the live shipping charge read from the supplier panel. Shows the
 * real number Meesho currently displays, or a graceful "not detected" state.
 * Never fabricates a value.
 */
export function LiveShipping({
  tab,
  onReread,
}: {
  tab: TabState;
  onReread: () => Promise<void>;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const onMeesho = tab.meeshoTabId != null;
  const value = tab.shipping.value;

  async function reread() {
    setRefreshing(true);
    try {
      await onReread();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <section className="section shipping">
      <div className="row spread">
        <span className="eyebrow">Live shipping charge</span>
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

      {!onMeesho ? (
        <p className="shipping__none">
          Open your supplier panel and a product to read its live shipping.
        </p>
      ) : value != null ? (
        <>
          <div className="shipping__value">
            <span className="shipping__amount">₹{value.toLocaleString("en-IN")}</span>
          </div>
          <p className="shipping__sub">
            <span className="live-dot" />
            Live from your supplier panel — the exact charge Meesho shows now.
          </p>
        </>
      ) : (
        <>
          <p className="shipping__none">Shipping not detected on this screen.</p>
          <p className="shipping__sub">
            Open a product with a price breakdown, then re-read.
          </p>
        </>
      )}
    </section>
  );
}
