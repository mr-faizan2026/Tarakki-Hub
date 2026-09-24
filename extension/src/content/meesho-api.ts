/**
 * ════════════════════════════════════════════════════════════════════════════
 *  MEESHO API — the single place that knows Meesho's internal supplier-panel
 *  endpoints. (meesho-adapter.ts is the single place that knows its DOM.)
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Runs in the content script on supplier.meesho.com, so every request is a
 *  same-origin call carrying the seller's own logged-in session cookies — the
 *  exact calls the panel makes itself when a seller adds a catalog image.
 *
 *  How Meesho prices an image (verified live on the Add Single Catalog flow):
 *    1. UPLOAD   the image                    → a hosted image URL
 *    2. MATCH    the URL against its catalog  → a "duplicate pid" (the existing
 *                                               product Meesho thinks it looks
 *                                               like). THIS is why the image
 *                                               changes the shipping charge.
 *    3. PRICE    category + duplicate pid     → `shipping_charges`, the exact
 *                                               "Shipping (added separately)"
 *                                               figure the panel shows.
 *
 *  Nothing here is estimated or hardcoded: every ₹ comes back from Meesho for
 *  that exact image. If a step fails we report the failure — never a guess.
 *
 *  ── WHERE TO UPDATE IF MEESHO CHANGES ──────────────────────────────────────
 *    • ENDPOINTS                 — the paths below.
 *    • CLIENT_TYPE / session()   — the headers the panel's own client sends.
 *    • the response field names read in quoteImage().
 */

import type { LiveQuote, MeeshoCategory, MeeshoErrorCode } from "@/lib/messages";

/* ─── tunables ─────────────────────────────────────────────────────────── */

const ENDPOINTS = {
  upload: "/api/cataloging/singleCatalogUpload/uploadSingleCatalogImages",
  match: "/api/cataloging/priceRecommendation/fetchDuplicatePid",
  price: "/api/cataloging/singleCatalogUpload/getTransferPrice",
  searchCategories: "/api/cataloging/catalog-upload/search-catalog",
  supplier: "/api/container/supplier/prefetch-supply-data",
} as const;

/** The desktop panel identifies itself with this; Meesho rejects calls without it. */
const CLIENT_TYPE = "d-web";

/** Cookie holding the logged-in supplier's numeric id. */
const SUPPLIER_ID_COOKIE = "s_id";

/** The supplier handle is a path segment: /panel/v3/new/<module>/<identifier>/… */
const IDENTIFIER_RE = /^\/panel\/v3\/new\/[^/]+\/([^/]+)\//;

/**
 * getTransferPrice requires a selling price, but its `shipping_charges` does not
 * depend on it (checked at ₹150 / ₹300 / ₹800 → identical shipping). This is a
 * request parameter for the tax breakdown, NOT a shipping price.
 */
const QUOTE_SELLING_PRICE = 300;

/**
 * Some GST registrations return an empty breakdown unless a GST rate is sent.
 * The rate changes tax lines, not shipping, so any valid slab works for the retry.
 */
const RETRY_GST_PERCENT = 5;

/* ─── types ────────────────────────────────────────────────────────────── */

export type MeeshoSession = { identifier: string; supplierId: string };

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

/* ─── supplier (GST registration) ──────────────────────────────────────── */

let gstTypeCache: { supplierId: string; gstType: string | null } | null = null;

/**
 * The seller's GST registration type (e.g. "ENROLMENT", "GSTIN"). Meesho's
 * shipping line differs by registration, so we price with the seller's own.
 */
async function sellerGstType(session: MeeshoSession): Promise<string | null> {
  if (gstTypeCache?.supplierId === session.supplierId) return gstTypeCache.gstType;
  const res = await post<{ supplier?: { gst_type?: string } }>(session, ENDPOINTS.supplier, {
    supplier_id: Number(session.supplierId),
    identifier: session.identifier,
  });
  const gstType = res.supplier?.gst_type ?? null;
  gstTypeCache = { supplierId: session.supplierId, gstType };
  return gstType;
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

type TransferPrice = { shipping_charges?: number };

/**
 * Ask Meesho what it would charge to ship a product listed with `image` as its
 * front photo in category `sscatId`. Uploads the image to the seller's panel
 * storage (as the panel does on every image pick) but never creates, saves or
 * submits a catalog.
 */
export async function quoteImage(
  image: Blob,
  fileName: string,
  sscatId: number,
): Promise<LiveQuote> {
  const session = requireSession();

  // 1) Upload.
  const form = new FormData();
  form.append("file", new File([image], fileName, { type: image.type || "image/jpeg" }));
  form.append("data", "undefined"); // the panel's client sends this literal too
  const uploaded = await post<{ image?: string }>(session, ENDPOINTS.upload, form);
  const imageUrl = uploaded.image;
  if (!imageUrl) throw new MeeshoApiError("bad_response", "Meesho didn't accept the image.");

  // 2) Match — which existing product does Meesho think this looks like?
  const matched = await post<{
    data?: { duplicate_pid?: number; wu_shipping_charge?: number } | null;
  }>(session, ENDPOINTS.match, {
    is_old_image_match_enabled: true,
    sscat_id: sscatId,
    image_url: imageUrl,
  });
  const duplicatePid = matched.data?.duplicate_pid ?? null;
  const matchShipping = matched.data?.wu_shipping_charge;

  // 3) Price — the panel's own "Shipping (added separately)" line.
  const gstType = await sellerGstType(session).catch(() => null);
  const priceBody = (gstPercent: number | null) => ({
    sscat_id: sscatId,
    gst_percentage: gstPercent,
    price: QUOTE_SELLING_PRICE,
    supplier_id: Number(session.supplierId),
    ...(duplicatePid != null ? { duplicate_pid: duplicatePid } : {}),
    gst_type: gstType,
  });
  let priced = await post<TransferPrice>(session, ENDPOINTS.price, priceBody(null));
  if (typeof priced.shipping_charges !== "number") {
    priced = await post<TransferPrice>(session, ENDPOINTS.price, priceBody(RETRY_GST_PERCENT));
  }

  if (typeof priced.shipping_charges === "number") {
    return { shipping: priced.shipping_charges, duplicatePid, imageUrl, source: "price" };
  }
  if (typeof matchShipping === "number") {
    return { shipping: matchShipping, duplicatePid, imageUrl, source: "match" };
  }
  throw new MeeshoApiError("bad_response", "Meesho didn't return a shipping charge.");
}
