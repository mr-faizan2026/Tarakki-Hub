import { useCallback, useEffect, useRef, useState } from "react";
import { sendToBackground, type PanelPricingContext } from "@/lib/messages";

/**
 * Tracks what the supplier panel is currently pricing — the selling price, GST %
 * and category from the panel's OWN last pricing request (captured passively;
 * see content/panel-context.ts).
 *
 * This is what makes a quote possible at all: with it we re-ask Meesho the
 * panel's exact question with only the image changed, so our figure is the
 * panel's figure. Without it there is no quote — guessing the rest of the
 * listing produces a real Meesho number for a listing the seller isn't making,
 * which is how a ₹288 quote once appeared beside a panel reading ₹110.
 *
 * It also carries the panel's OWN answer (`shipping`), which every run is
 * checked against before a single price is shown.
 *
 * Polled while the panel is open so that the moment the seller types a price in
 * Meesho, our side panel picks it up.
 */

const EMPTY: PanelPricingContext = {
  probeInstalled: false,
  captured: false,
  stale: false,
  ageMs: null,
  sscatId: null,
  price: null,
  gstPercent: null,
  gstType: null,
  shipping: null,
  pricesByMatch: false,
  panelDuplicatePid: null,
  signature: null,
};

/** Gentle — this is a message to a content script on the seller's own tab. */
const POLL_MS = 5000;

export type PanelContextApi = {
  context: PanelPricingContext;
  refreshing: boolean;
  refresh: () => Promise<PanelPricingContext>;
};

export function usePanelContext(
  tabId: number | null,
  ready: boolean,
  /** Pause polling during a run — quoting already keeps the tab busy. */
  paused = false,
): PanelContextApi {
  const [context, setContext] = useState<PanelPricingContext>(EMPTY);
  const [refreshing, setRefreshing] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refresh = useCallback(async (): Promise<PanelPricingContext> => {
    if (tabId == null || !ready) {
      if (alive.current) setContext(EMPTY);
      return EMPTY;
    }
    setRefreshing(true);
    try {
      const res = await sendToBackground({ type: "PANEL_CONTEXT", tabId });
      // An unreachable tab answers with an error shape, not a context.
      const next = res?.context ?? EMPTY;
      if (alive.current) setContext(next);
      return next;
    } catch {
      if (alive.current) setContext(EMPTY);
      return EMPTY;
    } finally {
      if (alive.current) setRefreshing(false);
    }
  }, [tabId, ready]);

  useEffect(() => {
    void refresh();
    if (paused || tabId == null || !ready) return;
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [refresh, paused, tabId, ready]);

  return { context, refreshing, refresh };
}

/** "just now" / "4 min ago" — how fresh a captured pricing request is. */
export function describeAge(ageMs: number | null): string {
  if (ageMs == null) return "";
  const mins = Math.floor(ageMs / 60000);
  if (mins < 1) return "just now";
  if (mins === 1) return "1 min ago";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
}
