import { useCallback, useEffect, useState } from "react";
import {
  sendToBackground,
  type BgToPanel,
  type ShippingReading,
  type TabState,
} from "@/lib/messages";

const INITIAL: TabState = {
  meeshoTabId: null,
  contentReady: false,
  shipping: { value: null, raw: null },
};

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
        .then((s) => active && setState(s))
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
