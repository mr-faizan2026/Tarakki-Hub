/**
 * ════════════════════════════════════════════════════════════════════════════
 *  MEESHO API — the single place that knows Meesho's internal supplier-panel
 *  endpoints. (The meesho/ folder beside this one is the only code that knows
 *  Meesho's DOM; its config.ts holds every selector.)
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Runs in the content script on supplier.meesho.com, so every request is a
 *  same-origin call carrying the seller's own logged-in session cookies — the
 *  exact calls the panel makes itself when a seller adds a catalog image.
 *
 *  How Meesho prices an image:
 *    1. UPLOAD   the image                    → a hosted image URL
 *    2. MATCH    the URL against its catalog  → a "duplicate pid" (the existing
 *                                               product Meesho thinks it looks
 *                                               like)
 *    3. PRICE    the listing                  → `shipping_charges`, the exact
 *                                               "Shipping (added separately)"
 *                                               figure the panel shows.
 *
 *  ── THE RULE THIS FILE EXISTS TO ENFORCE ───────────────────────────────────
 *  WE MIRROR. We do not model. The body we post is always the panel's OWN
 *  captured body, to its own URL, with its own fields. What varies is the ONE
 *  field the image legitimately controls, and whether we touch it at all:
 *
 *    mode "mirror" — the panel's body, posted back completely untouched. No
 *                    upload, no match call. This answers one question only:
 *                    does our request reproduce the figure the panel is
 *                    displaying? If it doesn't, we are talking to Meesho about
 *                    a different listing and the whole run is void.
 *    mode "match"  — the panel's body with `duplicate_pid` set to the catalog
 *                    product Meesho matched THIS image to. Nothing else moves.
 *
 *  This is not caution for its own sake. An earlier version of this file
 *  modelled Meesho's pricing from measurements ("the charge follows duplicate_pid
 *  and gst_type, price is irrelevant") and filled the gaps with constants: a
 *  ₹300 price, 5% GST, and `is_old_image_match_enabled: true` in the match step.
 *  Every one of those is a question the seller never asked. The result was a
 *  real Meesho response to a fabricated listing: ₹288 shown in our side panel
 *  while the seller's own panel, on the same photo, displayed ₹110 — and
 *  "savings" of ₹149 that were in fact ₹39 WORSE than doing nothing.
 *
 *  Note what was actually wrong there, because the first fix over-corrected.
 *  It was NOT that `duplicate_pid` changes the charge — it does, and that is
 *  the entire mechanism this feature sells: Meesho inherits the matched
 *  product's shipping, so a different front photo really does get a different
 *  charge. The bug was (a) an invented match flag that widened matching until
 *  every photo matched something heavy, and (b) comparing pid-priced variants
 *  against a pid-less baseline — two different questions, subtracted.
 *
 *  The over-correction was to refuse to set `duplicate_pid` unless the panel's
 *  own captured body already carried one. The panel sends `duplicate_pid: null`
 *  whenever it re-prices without re-matching, which is most of the time, so the
 *  feature spent its life telling sellers "no image can change this figure" on
 *  listings where competing tools were demonstrably moving it by ₹10–₹20. A
 *  refusal that is wrong is still wrong.
 *
 *  So the guarantee is now the one that actually holds: no filler price, no
 *  filler GST, no invented match flags, and EVERY ranked figure in a run —
 *  the seller's own photo included — priced the same way, in "match" mode, so
 *  a difference between two of them is a difference Meesho made. With no
 *  captured panel request there is still no quote at all (`no_panel_capture`).
 *  Whatever we cannot mirror, we do not answer.
 *
 *  Every quote also carries `debug`: the mode, the body we sent and the panel's
 *  own figure, so the side panel can refuse to display anything from a run
 *  whose mirror quote failed to reproduce the panel's (calibration gate).
 *
 *  ── WHERE TO UPDATE IF MEESHO CHANGES ──────────────────────────────────────
 *    • ENDPOINTS                 — only the upload path is ours to know; the
 *                                  match and pricing URLs come from the panel.
 *    • CLIENT_TYPE / session()   — the headers the panel's own client sends.
 *    • the response field names read in quoteImage().
 *  Request BODIES are mirrored, so new Meesho fields need no change here.
 */

import type { LiveQuote, MeeshoCategory, MeeshoErrorCode, QuoteMode } from "@/lib/messages";
import {
  matchTemplate,
  panelMatchedPid,
  pricingSignature,
  pricingTemplate,
  probeInstalled,
} from "./panel-context";

/* ─── tunables ─────────────────────────────────────────────────────────── */

/**
 * Fallback paths. The match and pricing URLs are normally taken from the panel's
 * own captured call; these are only used when the capture recorded no URL.
 */
const ENDPOINTS = {
  upload: "/api/cataloging/singleCatalogUpload/uploadSingleCatalogImages",
  match: "/api/cataloging/priceRecommendation/fetchDuplicatePid",
  price: "/api/cataloging/singleCatalogUpload/getTransferPrice",
  searchCategories: "/api/cataloging/catalog-upload/search-catalog",
} as const;

/** The desktop panel identifies itself with this; Meesho rejects calls without it. */
const CLIENT_TYPE = "d-web";

/** Cookie holding the logged-in supplier's numeric id. */
const SUPPLIER_ID_COOKIE = "s_id";

/** The supplier handle is a path segment: /panel/v3/new/<module>/<identifier>/… */
const IDENTIFIER_RE = /^\/panel\/v3\/new\/[^/]+\/([^/]+)\//;

/* ─── types ────────────────────────────────────────────────────────────── */

export type MeeshoSession = { identifier: string; supplierId: string };

/** The seller's own price, when they typed it into our panel. */
export type ManualPricing = { price: number; gstPercent: number | null };

export class MeeshoApiError extends Error {
  code: MeeshoErrorCode;
  constructor(code: MeeshoErrorCode, message: string) {
    super(message);
    this.name = "MeeshoApiError";
    this.code = code;
  }
}

/* ─── session + transport ──────────────────────────────────────────────── */

function readCookie(name: string): string | null {
  for (const part of document.cookie.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

/** The logged-in supplier on this tab, or null when the page isn't the panel. */
export function readSession(): MeeshoSession | null {
  const identifier = location.pathname.match(IDENTIFIER_RE)?.[1];
  const supplierId = readCookie(SUPPLIER_ID_COOKIE);
  if (!identifier || !supplierId) return null;
  return { identifier, supplierId };
}

function requireSession(): MeeshoSession {
  const session = readSession();
  if (!session) {
    throw new MeeshoApiError(
      "no_session",
      "Open your Meesho supplier panel (logged in) in this tab.",
    );
  }
  return session;
}

async function post<T>(
  session: MeeshoSession,
  path: string,
  body: FormData | Record<string, unknown>,
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
    "client-type": CLIENT_TYPE,
    identifier: session.identifier,
    "supplier-id": session.supplierId,
  };
  let payload: BodyInit;
  if (body instanceof FormData) {
    payload = body; // the browser sets the multipart boundary
  } else {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const res = await fetch(new URL(path, location.origin), {
    method: "POST",
    headers,
    body: payload,
    credentials: "include",
  });
  if (res.status === 401 || res.status === 403) {
    throw new MeeshoApiError("signed_out", "Your Meesho session expired — log in again.");
  }
  if (!res.ok) {
    throw new MeeshoApiError("http", `Meesho returned ${res.status}.`);
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw new MeeshoApiError("bad_response", "Meesho sent an unreadable response.");
  }
}

/* ─── category search ──────────────────────────────────────────────────── */

/** Meesho's own category search (the one behind "Add Single Catalog"). */
export async function searchCategories(query: string): Promise<MeeshoCategory[]> {
  const session = requireSession();
  const res = await post<{
    results?: { id: number; name: string; chain?: string[]; category?: string }[];
  }>(session, ENDPOINTS.searchCategories, {
    query,
    offset: 0,
    size: 25,
    supplier_id: Number(session.supplierId),
    bulk_upload_enabled: false,
    supplier_enabled: true,
    identifier: session.identifier,
  });
  return (res.results ?? [])
    .filter((r) => r.category === "sub-sub-category" && typeof r.id === "number")
    .map((r) => ({ id: r.id, name: r.name, chain: r.chain ?? [] }));
}

/* ─── the live quote: upload → match → price ───────────────────────────── */

const numberOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

type TransferPrice = { shipping_charges?: number };

/**
 * The panel's captured pricing request, or a refusal. There is no third option:
 * quoting without one means quoting a listing the seller isn't making.
 */
function requireTemplate() {
  const template = pricingTemplate();
  if (template) return template;
  throw new MeeshoApiError(
    "no_panel_capture",
    probeInstalled()
      ? "Your supplier panel hasn't priced this listing yet. Enter your selling price in the panel so its price breakdown appears, then try again."
      : "Reload your supplier panel tab so TarakkiHub can read its own pricing — we only ever show the figure your panel shows.",
  );
}

/**
 * Ask Meesho what it would charge to ship the seller's listing with `image` as
 * its front photo. Uploads the image to the seller's panel storage (as the panel
 * does on every image pick) but never creates, saves or submits a catalog.
 *
 * `fallbackSscatId` is the category picked in our side panel. It is used ONLY
 * when the panel's own captured request doesn't name one — the listing's real
 * category always wins over anything picked here.
 *
 * `expectSignature` pins the whole run to one captured request. The seller can
 * retype their price in the panel while we're quoting, which replaces the
 * capture underneath us; mixing figures from before and after would produce a
 * ranking of images that were never compared on equal terms.
 *
 * `mode` picks the question (see QuoteMode). "mirror" ignores `image` entirely
 * and may be passed null for it: that quote exists to reproduce the panel's own
 * figure, and an upload would only add traffic to the seller's account without
 * changing a single field of the body.
 */
export async function quoteImage(
  image: Blob | null,
  fileName: string,
  fallbackSscatId: number,
  manual: ManualPricing | null,
  expectSignature: string | null = null,
  mode: QuoteMode = "match",
): Promise<LiveQuote> {
  const session = requireSession();
  const template = requireTemplate();
  if (expectSignature != null && pricingSignature() !== expectSignature) {
    throw new MeeshoApiError(
      "panel_changed",
      "Your supplier panel re-priced this listing while we were checking. Press Generate again so every image is compared against the same listing.",
    );
  }
  const match = matchTemplate();

  // The listing's own category, straight from the panel. Falling back to the
  // picker is a last resort, and the quote says which was used.
  const sscatId =
    numberOrNull(template.body.sscat_id) ??
    (match ? numberOrNull(match.body.sscat_id) : null) ??
    fallbackSscatId;

  let imageUrl: string | null = null;
  let duplicatePid: number | null = null;
  let matchBody: Record<string, unknown> | null = null;

  if (mode === "match") {
    if (!image) {
      throw new MeeshoApiError("bad_response", "No image to price.");
    }

    // 1) Upload.
    const form = new FormData();
    form.append("file", new File([image], fileName, { type: image.type || "image/jpeg" }));
    form.append("data", "undefined"); // the panel's client sends this literal too
    const uploaded = await post<{ image?: string }>(session, ENDPOINTS.upload, form);
    imageUrl = uploaded.image ?? null;
    if (!imageUrl) throw new MeeshoApiError("bad_response", "Meesho didn't accept the image.");

    // 2) Match — which existing product does Meesho think this looks like?
    //    The panel's own match request, with only the image swapped. No flags of
    //    our own: `is_old_image_match_enabled: true` was once invented here, and
    //    it widened matching until every photo matched something heavy.
    matchBody = { ...(match?.body ?? {}), sscat_id: sscatId, image_url: imageUrl };
    const matched = await post<{
      data?: { duplicate_pid?: number; wu_shipping_charge?: number } | null;
    }>(session, match?.url ?? ENDPOINTS.match, matchBody);
    duplicatePid = matched.data?.duplicate_pid ?? null;
  }

  // 3) Price — the panel's own request, with at most one field changed.
  const body: Record<string, unknown> = { ...template.body };
  if (mode === "match") {
    // The matched product is the one thing an image legitimately controls, and
    // it is the one thing we touch. `duplicate_pid` is set for every image in
    // the run, the seller's own photo included, so two figures differ only
    // where Meesho made them differ.
    //
    // Deleting the key when nothing matched is deliberate and is NOT the same
    // as sending null: it leaves the body exactly as a panel that never matched
    // would have sent it, rather than asserting "matched: nothing".
    if (duplicatePid != null) body.duplicate_pid = duplicatePid;
    else delete body.duplicate_pid;
  }
  // In "mirror" mode the panel's own `duplicate_pid` — number, null or absent —
  // rides along untouched, because that mode's entire job is to reproduce the
  // panel's figure. A mirror quote that sets this field proves nothing.

  // The seller's typed price is honoured, and NOT in mirror mode. The panel
  // priced at the panel's price, so a mirror quote at a different price gets a
  // different figure and calibration reads it as a mismatch — which would stop
  // every run by a seller sanity-checking a price they haven't typed into
  // Meesho yet, for a disagreement we manufactured ourselves.
  if (manual && mode === "match") {
    body.price = manual.price;
    if (manual.gstPercent != null) body.gst_percentage = manual.gstPercent;
  }

  const priced = await post<TransferPrice>(session, template.url ?? ENDPOINTS.price, body);
  if (typeof priced.shipping_charges !== "number") {
    // NOT a place for a fallback. The match step's `wu_shipping_charge` is
    // consistently ₹10 above `shipping_charges` — it is the GSTIN figure, while
    // the panel's "Shipping (added separately)" line renders shipping_charges.
    // Showing it would overstate every image, so we report the failure instead.
    throw new MeeshoApiError(
      "bad_response",
      "Meesho didn't return a shipping charge for this image. Try again in a moment.",
    );
  }

  return {
    shipping: priced.shipping_charges,
    duplicatePid,
    imageUrl,
    source: "price",
    // The mode outranks "the seller typed a price": it is what says whether
    // this figure is a ranked answer at all or just the calibration probe.
    basis: mode === "mirror" ? "panel-mirror" : manual ? "manual" : "photo-match",
    price: numberOrNull(body.price),
    gstPercent: numberOrNull(body.gst_percentage),
    sscatId,
    debug: {
      url: template.url ?? ENDPOINTS.price,
      body,
      mode,
      templateDuplicatePid: template.panelDuplicatePid,
      matchUrl: match?.url ?? ENDPOINTS.match,
      matchBody: matchBody ?? {},
      mirrored: true,
      /** What the panel itself last displayed — the figure we must reproduce. */
      panelShipping: template.shipping,
      /** What the PANEL matched the seller's photo to, for comparison. */
      panelDuplicatePid: panelMatchedPid(),
      panelRequestAgeMs: Math.max(0, Date.now() - template.at),
    },
  };
}
