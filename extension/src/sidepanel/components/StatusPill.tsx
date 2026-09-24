import type { TabState } from "@/lib/messages";

/**
 * The connection status pill. "Session connected" requires: signed in AND the
 * active tab is the supplier panel AND the content script has handshaked.
 * Otherwise it says exactly what's missing.
 */
export function StatusPill({ tab }: { tab: TabState }) {
  const onMeesho = tab.meeshoTabId != null;

  let cls = "pill warn";
  let text = "Open your Meesho supplier panel";

  if (onMeesho && tab.contentReady) {
    cls = "pill connected";
    text = "Session connected";
  } else if (onMeesho && !tab.contentReady) {
    cls = "pill warn";
    text = "Connecting… reload your supplier panel if this persists";
  }

  return (
    <div className={cls} role="status">
      <span className="dot" />
      <span>{text}</span>
    </div>
  );
}
