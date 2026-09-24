/**
 * Typed message protocol for panel ⇄ background ⇄ content script.
 *
 * Three hops, three directions:
 *   • content → background : lifecycle + live shipping pushes
 *   • background → panel   : broadcasts (tab state, shipping)
 *   • panel → background   : requests (get state, apply image, re-read) that the
 *                            background fulfils, often by talking to the content
 *                            script on the active Meesho tab.
 *
 * Every message carries a string `type`. Request/response pairs are modelled so
 * the send helpers below can return a correctly-typed response.
 */

export type ShippingReading = {
  /** Rupee amount, e.g. 61. Null when nothing trustworthy was found. */
  value: number | null;
  /** The exact text matched on the page, for display/debugging, e.g. "₹61". */
  raw: string | null;
  /** Where on the page it was read from — helps diagnose adapter drift. */
  source?: string;
};

/** A Meesho leaf category ("sub-sub-category"), as its own search returns it. */
export type MeeshoCategory = { id: number; name: string; chain: string[] };

/** Meesho's live shipping quote for one exact image (see content/meesho-api.ts). */
export type LiveQuote = {
  /** The shipping charge Meesho quotes for this exact image (₹). */
  shipping: number;
  /** The catalog product Meesho matched the image to (null = no match). */
  duplicatePid: number | null;
  /** Where Meesho hosted the uploaded test image. */
  imageUrl: string;
  /** "price" = the panel's own shipping line; "match" = the match step's figure,
   *  used only when the price step returned no shipping for this seller. */
  source: "price" | "match";
};

export type MeeshoErrorCode =
  | "no_session"
  | "signed_out"
  | "http"
  | "bad_response"
  | "unreachable";

export type QuoteResponse =
  | { ok: true; quote: LiveQuote }
  | { ok: false; error: string; code?: MeeshoErrorCode };

export type CategorySearchResponse =
  | { ok: true; categories: MeeshoCategory[] }
  | { ok: false; error: string; code?: MeeshoErrorCode };

export type TabState = {
  /** tabId of the focused Meesho supplier tab, or null when none is focused. */
  meeshoTabId: number | null;
  /** True once the content script on that tab has handshaked. */
  contentReady: boolean;
  /** Latest live shipping reading pushed from the content script. */
  shipping: ShippingReading;
};

/* ─── content → background ─────────────────────────────────────────────── */

export type ContentToBg =
  | { type: "CONTENT_READY" }
  | { type: "SHIPPING_UPDATE"; shipping: ShippingReading };

/* ─── background → content (request/response) ──────────────────────────────
 * These use a distinct CONTENT_* namespace on purpose. A panel → background
 * chrome.runtime.sendMessage is ALSO delivered to every content script, so if
 * the panel and the background used the same type names, each Meesho tab's
 * content script would handle (and respond to) a message meant for one tab.
 * background → content goes via chrome.tabs.sendMessage to ONE tab only, and
 * these names never collide with the panel → background names below. */

export type BgToContentRequest =
  | { type: "CONTENT_REREAD" }
  | { type: "CONTENT_APPLY"; dataUrl: string; fileName: string }
  | { type: "CONTENT_QUOTE"; dataUrl: string; fileName: string; sscatId: number }
  | { type: "CONTENT_SEARCH_CATEGORIES"; query: string };

export type BgToContentResponse = {
  CONTENT_REREAD: { shipping: ShippingReading };
  CONTENT_APPLY: { ok: boolean; error?: string };
  CONTENT_QUOTE: QuoteResponse;
  CONTENT_SEARCH_CATEGORIES: CategorySearchResponse;
};

/* ─── panel → background (request/response) ────────────────────────────── */

/* QUOTE_IMAGE / SEARCH_CATEGORIES carry the Meesho tabId the panel started on,
 * so a long quoting run keeps talking to that tab even if focus moves. */
export type PanelToBgRequest =
  | { type: "GET_STATE" }
  | { type: "REREAD_SHIPPING" }
  | { type: "APPLY_IMAGE"; dataUrl: string; fileName: string }
  | {
      type: "QUOTE_IMAGE";
      tabId: number;
      dataUrl: string;
      fileName: string;
      sscatId: number;
    }
  | { type: "SEARCH_CATEGORIES"; tabId: number; query: string };

export type PanelToBgResponse = {
  GET_STATE: TabState;
  REREAD_SHIPPING: { shipping: ShippingReading };
  APPLY_IMAGE: { ok: boolean; error?: string };
  QUOTE_IMAGE: QuoteResponse;
  SEARCH_CATEGORIES: CategorySearchResponse;
};

/* ─── background → panel (broadcast, fire-and-forget) ──────────────────── */

export type BgToPanel =
  | { type: "TAB_STATE"; state: TabState }
  | { type: "SHIPPING_UPDATE"; shipping: ShippingReading };

/* ─── send helpers ─────────────────────────────────────────────────────── */

/** Panel → background request; resolves with the typed response. */
export async function sendToBackground<T extends PanelToBgRequest>(
  msg: T,
): Promise<PanelToBgResponse[T["type"]]> {
  return chrome.runtime.sendMessage(msg) as Promise<
    PanelToBgResponse[T["type"]]
  >;
}

/** Background → content request on a specific tab; resolves with the response. */
export async function sendToContent<T extends BgToContentRequest>(
  tabId: number,
  msg: T,
): Promise<BgToContentResponse[T["type"]]> {
  return chrome.tabs.sendMessage(tabId, msg) as Promise<
    BgToContentResponse[T["type"]]
  >;
}

/** Content/background → broadcast to any listening panel (best-effort). */
export function broadcast(msg: BgToPanel): void {
  // No receiver (panel closed) rejects the promise — swallow it.
  chrome.runtime.sendMessage(msg).catch(() => {});
}

/** Content → background push (best-effort). */
export function pushToBackground(msg: ContentToBg): void {
  chrome.runtime.sendMessage(msg).catch(() => {});
}
