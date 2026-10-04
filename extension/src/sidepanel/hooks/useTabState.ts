import { useCallback, useEffect, useState } from "react";
import {
  EMPTY_TAB_STATE,
  sendToBackground,
  type BgToPanel,
  type ShippingReading,
  type TabState,
} from "@/lib/messages";

const INITIAL: TabState = EMPTY_TAB_STATE;

export type TabApi = {
  state: TabState;
  /** Ask the content script to re-read shipping now. */
  rereadShipping: () => Promise<void>;
  /** Send a generated image to the listing's file input (user-initiated). */
  applyImage: (
    dataUrl: string,
    fileName: string,
  ) => Promise<{ ok: boolean; error?: string }>;
};

/**
 * Subscribes to tab/shipping state broadcast by the background worker: whether
 * the focused tab is the Meesho supplier panel, whether the content script has
 * handshaked, and the latest live shipping reading.
 */
export function useTabState(): TabApi {
  const [state, setState] = useState<TabState>(INITIAL);

  useEffect(() => {
    let active = true;

    const refresh = () => {
      sendToBackground({ type: "GET_STATE" })
        .then(async (s) => {
          if (!active) return;
          setState(s);
          // The background caches form status from content-script pushes, and an
          // MV3 worker that was evicted comes back with an empty cache. A form
          // that is already on screen sends no new push until it mutates, so ask
          // the tab directly rather than showing "no form" over a filled one.
          if (s.meeshoTabId == null || !s.contentReady || s.form.url) return;
          const res = await sendToBackground({
            type: "GET_FORM_STATUS",
            tabId: s.meeshoTabId,
          }).catch(() => null);
          if (active && res?.status) {
            setState((prev) => ({ ...prev, form: res.status }));
          }
        })
        .catch(() => {});
    };

    const onMessage = (msg: BgToPanel, sender: chrome.runtime.MessageSender) => {
      // Only trust broadcasts from the background (no sender.tab). Content
      // scripts also broadcast on runtime.sendMessage and would otherwise leak
      // shipping from an UNFOCUSED Meesho tab into the panel; the background has
      // already filtered to the focused tab.
      if (sender.tab) return;
      if (msg.type === "TAB_STATE") {
        setState(msg.state);
      } else if (msg.type === "SHIPPING_UPDATE") {
        setState((prev) => ({ ...prev, shipping: msg.shipping }));
      }
    };

    chrome.runtime.onMessage.addListener(onMessage);
    refresh();
    // The panel can outlive tab focus changes; re-sync when it regains focus.
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      active = false;
      chrome.runtime.onMessage.removeListener(onMessage);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const rereadShipping = useCallback(async () => {
    const res = await sendToBackground({ type: "REREAD_SHIPPING" });
    const shipping = (res as { shipping?: ShippingReading })?.shipping;
    if (shipping) setState((prev) => ({ ...prev, shipping }));
  }, []);

  const applyImage = useCallback(
    async (dataUrl: string, fileName: string) => {
      return sendToBackground({ type: "APPLY_IMAGE", dataUrl, fileName });
    },
    [],
  );

  return { state, rereadShipping, applyImage };
}
