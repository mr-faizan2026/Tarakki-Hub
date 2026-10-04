/**
 * ════════════════════════════════════════════════════════════════════════════
 *  PANEL CONTEXT — what the supplier panel itself last asked Meesho to price,
 *  and what Meesho answered.
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  public/panel-probe.js taps the panel's own pricing calls from the page's JS
 *  world and posts them here. This module is the isolated-world receiver: it
 *  keeps the most recent call per endpoint and hands meesho-api.ts a REQUEST
 *  TEMPLATE to mirror — and, just as importantly, the panel's own ANSWER.
 *
 *  Two things come out of here, and the second is the one that was missing:
 *
 *    1. The request to mirror. Quoting an image means re-issuing the panel's own
 *       request with only the image changed, so the shipping we report is the
 *       shipping the panel reports, including every field we don't model.
 *
 *    2. The panel's own figure (`shipping_charges` from its response). That is
 *       ground truth. If our quote for the seller's OWN photo doesn't reproduce
 *       it, our request is answering a different question and every figure in
 *       the run is void — the side panel checks exactly this before showing
 *       anything. A seller was once shown ₹288 beside a panel reading ₹110; this
 *       field is what makes that impossible to repeat.
 *
 *  TRUST: the captured bodies come from the page, so they are DATA, never
 *  instructions. Only known-shaped, known-typed fields are read out of them,
 *  and a template is used solely as the body of the same endpoint it came from.
 */

import type { PanelPricingContext } from "@/lib/messages";

/** Must match CHANNEL / REPLAY / PING / PONG in public/panel-probe.js. */
const CHANNEL = "tarakkihub:panel-call";
const REPLAY = "tarakkihub:replay";
const PING = "tarakkihub:probe-ping";
const PONG = "tarakkihub:probe-pong";

/** A template older than this is reported as stale — the seller has likely
 *  moved on, and the UI offers a refresh rather than quietly using it. */
const STALE_AFTER_MS = 30 * 60 * 1000;

type Endpoint = "getTransferPrice" | "fetchDuplicatePid";

export type PanelCall = {
  endpoint: Endpoint;
  at: number;
  /** The path the panel posted to — mirrored, so a rename can't strand us. */
  url: string | null;
  method: string | null;
  /** The exact JSON body the panel sent. */
  request: Record<string, unknown> | null;
  /** The panel's own routing headers (client-type / identifier / supplier-id). */
  headers: Record<string, string>;
  /** The JSON Meesho answered with. */
  response: Record<string, unknown> | null;
};

const latest = new Map<Endpoint, PanelCall>();
let probeSeen = false;

/* ─── ingest ───────────────────────────────────────────────────────────── */

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asStringMap(value: unknown): Record<string, string> {
  const source = asRecord(value);
  const out: Record<string, string> = {};
  if (!source) return out;
  for (const [k, v] of Object.entries(source)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

/** Start listening. Safe to call once, at content-script boot. */
export function watchPanelCalls(): void {
  window.addEventListener("message", (event: MessageEvent) => {
    // Same page, same origin, our marker — anything else is not ours.
    if (event.source !== window || event.origin !== location.origin) return;
    const data = asRecord(event.data);
    if (!data) return;

    if (data.__tarakkihub === PONG) {
      probeSeen = true;
      return;
    }
    if (data.__tarakkihub !== CHANNEL) return;
    probeSeen = true;

    const call = asRecord(data.call);
    const endpoint = call?.endpoint;
    if (endpoint !== "getTransferPrice" && endpoint !== "fetchDuplicatePid") return;

    latest.set(endpoint, {
      endpoint,
      at: typeof call?.at === "number" ? call.at : Date.now(),
      url: typeof call?.url === "string" ? call.url : null,
      method: typeof call?.method === "string" ? call.method : null,
      request: asRecord(call?.request),
      headers: asStringMap(call?.headers),
      response: asRecord(call?.response),
    });
  });

  pingProbe();
}

/**
 * Ask the page-world probe for its buffer and for a sign of life.
 *
 * The probe runs at document_start and we attach at document_idle, so a panel
 * call in between would otherwise vanish. The ping also tells us whether a probe
 * exists AT ALL — and an unanswered ping is not a detail: with no probe there is
 * no mirror, and with no mirror we refuse to quote rather than guess. The
 * content script re-pings after asking the background to inject one.
 */
export function pingProbe(): void {
  window.postMessage({ __tarakkihub: REPLAY }, location.origin);
  window.postMessage({ __tarakkihub: PING }, location.origin);
}

/** True once the page-world probe has answered — the mirror is possible. */
export function probeInstalled(): boolean {
  return probeSeen;
}

/* ─── read ─────────────────────────────────────────────────────────────── */

export function lastCall(endpoint: Endpoint): PanelCall | null {
  return latest.get(endpoint) ?? null;
}

const numberOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

const stringOrNull = (v: unknown): string | null =>
  typeof v === "string" && v ? v : null;

/** Read a number out of a response, at the top level or under data/result. */
function fromResponse(
  response: Record<string, unknown> | null,
  field: string,
): number | null {
  if (!response) return null;
  const scopes = [response, asRecord(response.data), asRecord(response.result)];
  for (const scope of scopes) {
    if (scope && field in scope) {
      const value = numberOrNull(scope[field]);
      if (value != null) return value;
    }
  }
  return null;
}

export type PricingTemplate = {
  /** The path the panel posted to, mirrored verbatim. */
  url: string | null;
  body: Record<string, unknown>;
  at: number;
  /** The figure the panel itself displayed for this request. */
  shipping: number | null;
  /**
   * Whether the panel is pricing THIS listing against a matched product —
   * meaning its own request carries a real `duplicate_pid` NUMBER.
   *
   * The distinction matters more than it looks. The panel sends the field as
   * `duplicate_pid: null`, and an earlier version of this code read "the key is
   * present" as "the panel uses a match" and swapped in the pid our own match
   * step found. That is a ₹110 listing quoted at ₹288 — measured live: the
   * panel's exact body with `duplicate_pid: null` returns the seller's whole
   * breakdown (110 / 679.39 / 0.81 / 810), and the same body with a matched pid
   * returns 288.
   *
   * So: a number here means the panel prices by image match and the matched
   * product is ours to vary. Null or absent means the photo does not enter this
   * listing's price at all, and no image we generate can change it.
   */
  pricesByMatch: boolean;
  /** The matched product the panel itself priced with (null = none). */
  panelDuplicatePid: number | null;
};

/**
 * The panel's own pricing request, if we've seen one — the body every quote
 * mirrors. Returns null when the seller hasn't priced anything yet this visit.
 *
 * NOTE: this deliberately does NOT require any particular field to be present.
 * An earlier version dropped any capture without a numeric `sscat_id`, which
 * turned "Meesho renamed a field" into "silently quote a made-up listing".
 */
export function pricingTemplate(): PricingTemplate | null {
  const call = lastCall("getTransferPrice");
  if (!call?.request) return null;
  return {
    url: call.url,
    body: call.request,
    at: call.at,
    shipping: fromResponse(call.response, "shipping_charges"),
    pricesByMatch: numberOrNull(call.request.duplicate_pid) != null,
    panelDuplicatePid: numberOrNull(call.request.duplicate_pid),
  };
}

/**
 * A short fingerprint of the captured pricing request.
 *
 * A run quotes many images and ranks them against each other, which is only
 * meaningful if every quote asked the SAME question. The seller can retype
 * their price in the panel mid-run, which replaces the capture underneath us;
 * each quote carries the signature the run started with, and a changed one
 * aborts the run instead of silently mixing two rankings.
 *
 * FNV-1a over the body's JSON — key order is stable because the body comes
 * straight from JSON.parse of the panel's own request.
 */
export function pricingSignature(): string | null {
  const template = pricingTemplate();
  if (!template) return null;
  const json = JSON.stringify(template.body);
  let hash = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    hash ^= json.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16);
}

/** The panel's own duplicate-match request, mirrored the same way. */
export function matchTemplate(): { url: string | null; body: Record<string, unknown> } | null {
  const call = lastCall("fetchDuplicatePid");
  if (!call?.request) return null;
  return { url: call.url, body: call.request };
}

/**
 * The product the PANEL matched the seller's current photo to. Compared against
 * our own match for the same photo, this says precisely where a divergence is:
 * a different pid means our match step asked a different question; the same pid
 * with a different charge means the pricing body did.
 */
export function panelMatchedPid(): number | null {
  return fromResponse(lastCall("fetchDuplicatePid")?.response ?? null, "duplicate_pid");
}

/** A summary for the side panel: what we'd mirror, and how fresh it is. */
export function pricingContext(): PanelPricingContext {
  const template = pricingTemplate();
  if (!template) {
    return {
      probeInstalled: probeSeen,
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
  }
  const ageMs = Math.max(0, Date.now() - template.at);
  return {
    probeInstalled: probeSeen,
    captured: true,
    stale: ageMs > STALE_AFTER_MS,
    ageMs,
    sscatId: numberOrNull(template.body.sscat_id),
    price: numberOrNull(template.body.price),
    gstPercent: numberOrNull(template.body.gst_percentage),
    gstType: stringOrNull(template.body.gst_type),
    shipping: template.shipping,
    pricesByMatch: template.pricesByMatch,
    panelDuplicatePid: template.panelDuplicatePid,
    signature: pricingSignature(),
  };
}
