/**
 * Typed message protocol for panel ⇄ background ⇄ content script.
 *
 * Four hops:
 *   • content → background : lifecycle, live shipping, form status, fill progress
 *   • content ⇄ background : the one request the content script makes of the
 *                            background — a MAIN-world write (see fill/main-world.ts)
 *   • background → panel   : broadcasts (tab state, shipping, fill progress)
 *   • panel → background   : requests (get state, apply image, capture a form,
 *                            autofill, field scan) that the background fulfils,
 *                            usually by talking to the content script on the
 *                            Meesho tab.
 *
 * Every message carries a string `type`. Request/response pairs are modelled so
 * the send helpers below can return a correctly-typed response.
 *
 * ── NAMING RULE (do not break it) ──────────────────────────────────────────
 * A panel → background `chrome.runtime.sendMessage` is ALSO delivered to every
 * content script, and a content-script broadcast reaches the panel. So every
 * name in this file is unique across all four directions, and the receivers
 * additionally check `sender.tab` before trusting a broadcast. Reusing one name
 * in two directions is how a message meant for one tab gets answered by three.
 */

import type {
  CapturedField,
  FillProgress,
  FillResult,
  FormStatus,
  HighlightTone,
  ScannedField,
} from "./autofill-types";
import { EMPTY_FORM_STATUS } from "./autofill-types";

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

/**
 * How a quote's pricing request was built — the single most important thing to
 * know about a rupee figure, because it says whether the number answers the
 * seller's actual listing or a different one.
 *
 * There is no longer a "built from guesses" basis. Every quote is the panel's
 * OWN request body; without a capture there is no quote (see meesho-api.ts).
 * What differs is which question that body is asked:
 *
 *   "panel-mirror" — the panel's body posted back completely untouched. The
 *                    image plays no part, so this answers "does re-issuing the
 *                    panel's request reproduce the panel's figure?" and nothing
 *                    else. It is the calibration probe, never a ranked figure.
 *   "photo-match"  — the panel's body with exactly one field replaced: the
 *                    matched catalog product Meesho found for THIS image. That
 *                    is the question the seller is actually asking — "what does
 *                    Meesho charge if this picture is my front image?" — and it
 *                    is what the panel itself will send once the image is in
 *                    the listing.
 *   "manual"       — "photo-match" with the selling price the seller typed.
 */
export type QuoteBasis = "panel-mirror" | "photo-match" | "manual";

/**
 * Which of those two questions to ask. The distinction is the whole safety
 * design, so it is named in the protocol rather than inferred anywhere:
 *
 *   "mirror" — post the panel's body verbatim. No upload, no match call, no
 *              field touched. Used once per run to prove our request really
 *              does reproduce the panel's own displayed figure.
 *   "match"  — upload the image, ask Meesho which catalog product it matches,
 *              and price the panel's body against THAT product.
 *
 * Every ranked figure in a run — the seller's own photo included — is quoted
 * in "match" mode, so the comparison is like with like. Mixing the two is
 * precisely what once advertised a ₹149 image as "₹139 less" when it was ₹39
 * more: the variants were priced against a match and the baseline was not.
 */
export type QuoteMode = "mirror" | "match";

/**
 * Everything needed to explain — or disprove — one figure. Carried on every
 * quote so the side panel can check a quote against the panel's own number
 * before showing it, and so a seller can hand us one clipboard paste that says
 * exactly what was asked and what came back.
 */
export type QuoteDebug = {
  /** The pricing URL and body we posted (the panel's, with our one change). */
  url: string;
  body: Record<string, unknown>;
  /** The image-match URL and body we posted. */
  matchUrl: string;
  matchBody: Record<string, unknown>;
  /** True when the request came from a captured panel call rather than us. */
  mirrored: boolean;
  /** Which question this body was asked (see QuoteMode). */
  mode: QuoteMode;
  /** The matched product the panel's own captured request carried, if any —
   *  next to `mode`, this says exactly what we changed and what we didn't. */
  templateDuplicatePid: number | null;
  /** `shipping_charges` from the panel's OWN last response — ground truth. */
  panelShipping: number | null;
  /** The product the PANEL matched the seller's photo to. */
  panelDuplicatePid: number | null;
  /** How old the mirrored request was when we re-issued it. */
  panelRequestAgeMs: number;
};

/** The seller's own price and GST, when they typed them into our panel. */
export type ManualPricing = { price: number; gstPercent: number | null };


/** Meesho's live shipping quote for one exact image (see content/meesho-api.ts). */
export type LiveQuote = {
  /** The shipping charge Meesho quotes for this exact image (₹). */
  shipping: number;
  /** The catalog product Meesho matched the image to (null = no match). */
  duplicatePid: number | null;
  /** Where Meesho hosted the uploaded test image. Null in "mirror" mode, which
   *  uploads nothing at all — the panel's body doesn't reference an image. */
  imageUrl: string | null;
  /** "price" = the panel's own shipping line; "match" = the match step's
   *  `wu_shipping_charge`, a DIFFERENT field used only when the price step
   *  returned no shipping. The UI labels it — it is not the panel's line. */
  source: "price" | "match";
  /** How the pricing request was built. */
  basis: QuoteBasis;
  /** The selling price this figure is for, as the panel's own request had it. */
  price: number | null;
  /** The GST % used (null = the request carried a null GST). */
  gstPercent: number | null;
  /** The category this figure is for. */
  sscatId: number;
  /** What was asked and what the panel itself says — see QuoteDebug. */
  debug: QuoteDebug;
};

/**
 * What the panel's own pricing call told us — the basis for an exact mirror.
 * Captured passively by public/panel-probe.js; see content/panel-context.ts.
 */
export type PanelPricingContext = {
  /** True once the page-world probe has answered. False means the tab needs a
   *  reload before anything here can be trusted — nothing is mirrored yet. */
  probeInstalled: boolean;
  /** True once we've seen the panel price something itself. */
  captured: boolean;
  /** The capture is old enough that the seller has likely moved on. */
  stale: boolean;
  /** Age of the capture in ms (null when nothing is captured). */
  ageMs: number | null;
  /** The sub-sub-category the panel priced. */
  sscatId: number | null;
  /** The selling price the panel priced at. */
  price: number | null;
  /** The GST % the panel sent (null = the panel itself sent null). */
  gstPercent: number | null;
  /** The seller's GST registration type, as the panel sent it. */
  gstType: string | null;
  /** The shipping charge the panel itself displayed — the figure to reproduce. */
  shipping: number | null;
  /**
   * Whether the CAPTURED request carries a real `duplicate_pid` NUMBER.
   *
   * This is a fact about that one captured call, and it is reported as such —
   * it is NOT a verdict on whether the photo can move this listing's shipping.
   * Reading it as one is its own bug: the panel sends `duplicate_pid: null`
   * whenever it prices without re-matching (an edit, a price retype), and the
   * feature then told sellers "no image can change this figure" on listings
   * where a different front photo demonstrably changes it by tens of rupees.
   *
   * What it IS good for: when false, the panel's own displayed figure is a
   * pid-less one, so it is the right figure to calibrate a "mirror" quote
   * against and the wrong figure to rank "match" quotes against. The run
   * handles that by quoting the seller's own photo in match mode too.
   */
  pricesByMatch: boolean;
  /** The matched product the panel itself priced with (null = none). */
  panelDuplicatePid: number | null;
  /** Fingerprint of the captured request. A run pins itself to one, so images
   *  ranked against each other were all priced against the same listing. */
  signature: string | null;
};

export type MeeshoErrorCode =
  | "no_session"
  | "signed_out"
  | "http"
  | "bad_response"
  /** The panel hasn't priced this listing yet, so there is nothing to mirror.
   *  We quote nothing rather than quote a listing the seller isn't making. */
  | "no_panel_capture"
  /** The panel re-priced mid-run, so this quote would not be comparable with
   *  the ones already shown. The run stops rather than mix two rankings. */
  | "panel_changed"
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
  /** Whether a catalog form is on screen — pushed on SPA route changes too. */
  form: FormStatus;
};

export const EMPTY_TAB_STATE: TabState = {
  meeshoTabId: null,
  contentReady: false,
  shipping: { value: null, raw: null },
  form: EMPTY_FORM_STATUS,
};

/* ─── autofill request/response shapes ─────────────────────────────────── */

export type AutofillErrorCode =
  /** No catalog add/edit form on this screen. */
  | "no_form"
  /** A fill is already going on this tab. */
  | "busy"
  | "unreachable";

export type CaptureResponse =
  | { ok: true; fields: CapturedField[]; categoryPath: string | null }
  | { ok: false; error: string; code?: AutofillErrorCode };

export type ScanResponse =
  | { ok: true; fields: ScannedField[]; categoryPath: string | null; url: string }
  | { ok: false; error: string; code?: AutofillErrorCode };

export type FillResponse =
  | { ok: true; result: FillResult }
  | { ok: false; error: string; code?: AutofillErrorCode };

/* ─── content → background (fire-and-forget pushes) ────────────────────── */

export type ContentToBg =
  | { type: "CONTENT_READY" }
  | { type: "SHIPPING_UPDATE"; shipping: ShippingReading }
  /** The page-world probe never answered on this tab — ask for an injection.
   *  Without it nothing can be mirrored, and nothing may be quoted. */
  | { type: "CONTENT_PROBE_MISSING" }
  /** A catalog form appeared, changed size, or the SPA navigated away from one. */
  | { type: "FORM_STATUS_UPDATE"; status: FormStatus }
  /** Live "Filling 12 / 27" while a run is going. */
  | { type: "FILL_PROGRESS_UPDATE"; progress: FillProgress };

/* ─── content → background (request/response) ──────────────────────────────
 * The single case where the content script needs something back. Writing a value
 * from the PAGE's JavaScript world requires chrome.scripting, which only an
 * extension context may call — so the content script marks the element and asks
 * the background to do the injection (see content/meesho/fill/main-world.ts). */

export type ContentToBgRequest = {
  type: "BG_MAIN_WORLD_SET";
  /** The one-shot data-tk-fill value identifying the element. */
  marker: string;
  value: string;
};

export type ContentToBgResponse = {
  BG_MAIN_WORLD_SET: { ok: boolean };
};

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
  | {
      type: "CONTENT_QUOTE";
      /** Null in "mirror" mode — that question involves no image. */
      dataUrl: string | null;
      fileName: string;
      /** Which question to ask Meesho (see QuoteMode). */
      mode: QuoteMode;
      /** The category picked in our side panel — used ONLY when the panel's own
       *  captured request doesn't name one. The listing's own category wins. */
      sscatId: number;
      /** A price the seller typed, overriding the panel's inside the mirror. */
      manual: ManualPricing | null;
      /** The pricing capture this run pinned itself to; a different one now
       *  means the panel re-priced and this quote wouldn't be comparable. */
      expectSignature: string | null;
    }
  | { type: "CONTENT_SEARCH_CATEGORIES"; query: string }
  | { type: "CONTENT_PANEL_CONTEXT" }
  /* ─ Part 2: autofill ─ */
  | { type: "CONTENT_FORM_STATUS" }
  | {
      type: "CONTENT_CAPTURE_FORM";
      /** Also capture controls the seller left blank. Off by default. */
      includeEmpty: boolean;
    }
  | {
      type: "CONTENT_SCAN_FIELDS";
      /** When given, each scanned control reports how well it matches these. */
      profileFields: CapturedField[] | null;
    }
  | { type: "CONTENT_FILL"; fields: CapturedField[]; overwrite: boolean }
  | { type: "CONTENT_FILL_CANCEL" }
  | { type: "CONTENT_HIGHLIGHT"; key: string; tone: HighlightTone };

export type BgToContentResponse = {
  CONTENT_REREAD: { shipping: ShippingReading };
  CONTENT_APPLY: { ok: boolean; error?: string };
  CONTENT_QUOTE: QuoteResponse;
  CONTENT_SEARCH_CATEGORIES: CategorySearchResponse;
  CONTENT_PANEL_CONTEXT: { context: PanelPricingContext };
  CONTENT_FORM_STATUS: { status: FormStatus };
  CONTENT_CAPTURE_FORM: CaptureResponse;
  CONTENT_SCAN_FIELDS: ScanResponse;
  CONTENT_FILL: FillResponse;
  CONTENT_FILL_CANCEL: { ok: boolean };
  CONTENT_HIGHLIGHT: { ok: boolean };
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
      /** Null in "mirror" mode — that question involves no image. */
      dataUrl: string | null;
      fileName: string;
      /** Which question to ask Meesho (see QuoteMode). */
      mode: QuoteMode;
      /** See CONTENT_QUOTE — a fallback category, not necessarily the quoted one. */
      sscatId: number;
      /** A price the seller typed, overriding the panel's inside the mirror. */
      manual: ManualPricing | null;
      /** The pricing capture this run pinned itself to. */
      expectSignature: string | null;
    }
  | { type: "SEARCH_CATEGORIES"; tabId: number; query: string }
  | { type: "PANEL_CONTEXT"; tabId: number }
  /* ─ Part 2: autofill. Each names the tab it started on, so a long run keeps
   *   talking to that tab even if the seller's focus moves. ─ */
  | { type: "GET_FORM_STATUS"; tabId: number }
  | { type: "CAPTURE_FORM"; tabId: number; includeEmpty: boolean }
  | { type: "SCAN_FIELDS"; tabId: number; profileFields: CapturedField[] | null }
  | { type: "FILL_FORM"; tabId: number; fields: CapturedField[]; overwrite: boolean }
  | { type: "CANCEL_FILL"; tabId: number }
  | { type: "HIGHLIGHT_FIELD"; tabId: number; key: string; tone: HighlightTone }
  /* ─ Part 3: the control plane. The panel owns the Supabase session and does
   *   its own register/heartbeat/revoke calls directly. These two are asked of
   *   the background instead, for one reason each:
   *     SYNC_CONFIG  — validating the remote adapter config carries a zod schema,
   *                    which has no business in the panel's initial bundle.
   *     FLUSH_HEALTH — the background is the only context that should ever hold
   *                    an access token anywhere near telemetry. ─ */
  | { type: "SYNC_CONFIG"; version: number }
  | { type: "FLUSH_HEALTH" };

export type PanelToBgResponse = {
  GET_STATE: TabState;
  REREAD_SHIPPING: { shipping: ShippingReading };
  APPLY_IMAGE: { ok: boolean; error?: string };
  QUOTE_IMAGE: QuoteResponse;
  SEARCH_CATEGORIES: CategorySearchResponse;
  PANEL_CONTEXT: { context: PanelPricingContext };
  GET_FORM_STATUS: { status: FormStatus };
  CAPTURE_FORM: CaptureResponse;
  SCAN_FIELDS: ScanResponse;
  FILL_FORM: FillResponse;
  CANCEL_FILL: { ok: boolean };
  HIGHLIGHT_FIELD: { ok: boolean };
  SYNC_CONFIG: { ok: boolean; version: number };
  FLUSH_HEALTH: { sent: number };
};

/* ─── background → panel (broadcast, fire-and-forget) ──────────────────── */

export type BgToPanel =
  | { type: "TAB_STATE"; state: TabState }
  | { type: "SHIPPING_UPDATE"; shipping: ShippingReading }
  | { type: "FILL_PROGRESS"; progress: FillProgress };

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

/**
 * Content → background request; resolves with the typed response.
 * Used only for the MAIN-world write fallback, which needs chrome.scripting.
 */
export async function requestFromBackground<T extends ContentToBgRequest>(
  msg: T,
): Promise<ContentToBgResponse[T["type"]]> {
  return chrome.runtime.sendMessage(msg) as Promise<ContentToBgResponse[T["type"]]>;
}
