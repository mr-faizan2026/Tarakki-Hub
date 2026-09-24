import { MEESHO_MATCH } from "@/lib/config";
import {
  broadcast,
  sendToContent,
  type BgToContentRequest,
  type ContentToBg,
  type PanelToBgRequest,
  type ShippingReading,
  type TabState,
} from "@/lib/messages";

/**
 * Background service worker — the orchestration hub. It owns NO Supabase state
 * (the side panel does, see lib/supabase.ts); its jobs are:
 *   1. Open the side panel when the toolbar icon is clicked.
 *   2. Track whether the focused tab is the Meesho supplier panel, and whether
 *      its content script has handshaked — the "Session connected" inputs.
 *   3. Relay live shipping readings from the content script to the panel.
 *   4. Forward panel requests (re-read, apply image, live image quotes,
 *      category search) to the content script.
 *
 * MV3 service workers get evicted, so all state below is rebuildable from
 * chrome.tabs on demand; the in-memory maps are just a fast cache.
 */

const EMPTY_SHIPPING: ShippingReading = { value: null, raw: null };

/** Tabs whose content script has announced itself this worker lifetime. */
const readyTabs = new Set<number>();
/** Last shipping reading pushed per tab. */
const shippingByTab = new Map<number, ShippingReading>();

/* ─── side panel open-on-click ─────────────────────────────────────────── */

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {});
  void injectIntoOpenMeeshoTabs();
});

chrome.runtime.onStartup.addListener(() => {
  void chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {});
});

/**
 * The panel is deliberately enabled on every tab, not just Meesho. That's the
 * only way the "Open your Meesho supplier panel" empty state (which lives IN the
 * panel) can be shown when the user opens it elsewhere. The panel adapts its
 * content to the active tab instead of Chrome hiding it with no explanation.
 */

/* ─── active-tab tracking → TAB_STATE broadcasts ───────────────────────── */

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    return tab;
  } catch {
    return undefined;
  }
}

function isMeesho(url: string | undefined): boolean {
  return !!url && MEESHO_MATCH.test(url);
}

async function buildState(): Promise<TabState> {
  const tab = await getActiveTab();
  // `tab.url` is only populated for hosts we hold permission for (Meesho), so an
  // undefined url reliably means "not the supplier panel" here.
  if (tab?.id != null && isMeesho(tab.url)) {
    return {
      meeshoTabId: tab.id,
      contentReady: readyTabs.has(tab.id),
      shipping: shippingByTab.get(tab.id) ?? EMPTY_SHIPPING,
    };
  }
  return { meeshoTabId: null, contentReady: false, shipping: EMPTY_SHIPPING };
}

async function broadcastState(): Promise<void> {
  broadcast({ type: "TAB_STATE", state: await buildState() });
}

chrome.tabs.onActivated.addListener(() => void broadcastState());
chrome.windows.onFocusChanged.addListener(() => void broadcastState());
chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  // React to navigations and load completion; ignore noisy partial updates.
  if (changeInfo.url || changeInfo.status === "complete") {
    void broadcastState();
  }
});
chrome.tabs.onRemoved.addListener((tabId) => {
  readyTabs.delete(tabId);
  shippingByTab.delete(tabId);
  void broadcastState();
});

/* ─── message hub ──────────────────────────────────────────────────────── */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Messages carrying a sender.tab come from the content script; those without
  // come from the side panel (an extension page).
  if (sender.tab?.id != null) {
    handleContentMessage(message as ContentToBg, sender.tab.id);
    sendResponse({ ok: true });
    return; // synchronous ack
  }

  handlePanelMessage(message as PanelToBgRequest)
    .then(sendResponse)
    .catch((err) => sendResponse({ ok: false, error: String(err) }));
  return true; // async response
});

function handleContentMessage(message: ContentToBg, tabId: number): void {
  switch (message.type) {
    case "CONTENT_READY":
      readyTabs.add(tabId);
      void broadcastState();
      break;
    case "SHIPPING_UPDATE":
      shippingByTab.set(tabId, message.shipping);
      // Only surface a reading for the tab the user is actually looking at.
      void (async () => {
        const active = await getActiveTab();
        if (active?.id === tabId) {
          broadcast({ type: "SHIPPING_UPDATE", shipping: message.shipping });
          broadcast({ type: "TAB_STATE", state: await buildState() });
        }
      })();
      break;
  }
}

async function handlePanelMessage(
  message: PanelToBgRequest,
): Promise<unknown> {
  switch (message.type) {
    case "GET_STATE":
      return buildState();

    case "REREAD_SHIPPING": {
      const tab = await getActiveTab();
      if (tab?.id == null || !isMeesho(tab.url)) {
        return { shipping: EMPTY_SHIPPING };
      }
      return forwardToContent(tab.id, { type: "CONTENT_REREAD" });
    }

    case "APPLY_IMAGE": {
      const tab = await getActiveTab();
      if (tab?.id == null || !isMeesho(tab.url)) {
        return { ok: false, error: "Open your supplier panel first." };
      }
      return forwardToContent(tab.id, {
        type: "CONTENT_APPLY",
        dataUrl: message.dataUrl,
        fileName: message.fileName,
      });
    }

    case "QUOTE_IMAGE":
      return forwardToMeeshoTab(message.tabId, {
        type: "CONTENT_QUOTE",
        dataUrl: message.dataUrl,
        fileName: message.fileName,
        sscatId: message.sscatId,
      });

    case "SEARCH_CATEGORIES":
      return forwardToMeeshoTab(message.tabId, {
        type: "CONTENT_SEARCH_CATEGORIES",
        query: message.query,
      });
  }
}

/**
 * Forward to a specific tab the panel named — but only while it is still the
 * supplier panel (the user may have navigated it elsewhere mid-run).
 */
async function forwardToMeeshoTab<T extends BgToContentRequest>(
  tabId: number,
  req: T,
): Promise<unknown> {
  let url: string | undefined;
  try {
    url = (await chrome.tabs.get(tabId)).url;
  } catch {
    url = undefined; // tab closed
  }
  if (!isMeesho(url)) {
    return {
      ok: false,
      code: "unreachable",
      error: "Your supplier panel tab was closed or navigated away. Reopen it and try again.",
    };
  }
  return forwardToContent(tabId, req);
}

/** Send to the content script, translating a dead port into a friendly error. */
async function forwardToContent<T extends BgToContentRequest>(
  tabId: number,
  req: T,
): Promise<unknown> {
  try {
    return await sendToContent(tabId, req);
  } catch {
    return {
      ok: false,
      code: "unreachable",
      shipping: EMPTY_SHIPPING,
      error: "Couldn't reach your supplier panel. Try reloading that tab.",
    };
  }
}

/* ─── first-install convenience ────────────────────────────────────────── */

/**
 * Declarative content scripts only inject on navigation, so a Meesho tab that
 * was already open when the extension was installed has no content script until
 * a reload. Inject it now so the panel works immediately. Best-effort.
 */
async function injectIntoOpenMeeshoTabs(): Promise<void> {
  try {
    const files = chrome.runtime.getManifest().content_scripts?.[0]?.js;
    if (!files?.length) return;
    const tabs = await chrome.tabs.query({
      url: "https://supplier.meesho.com/*",
    });
    await Promise.all(
      tabs.map(async (tab) => {
        if (tab.id == null || readyTabs.has(tab.id)) return;
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files,
          });
        } catch {
          /* tab not injectable (e.g. mid-navigation) — declarative will catch it */
        }
      }),
    );
  } catch {
    /* scripting/query unavailable — ignore */
  }
}
