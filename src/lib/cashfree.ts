import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  CASHFREE PAYMENT GATEWAY — the whole server-side surface
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  `server-only`: the secret key must never be bundled into a client component.
 *  That import turns a mistaken `import` from the browser into a build error
 *  rather than a leaked key.
 *
 *  ── WHY THE PLAIN REST API AND NOT THE SDK ────────────────────────────────
 *  Three calls are needed — create an order, read an order, check a signature —
 *  and all three are a `fetch` away. The SDK would add a dependency, its own
 *  release cadence and a layer between us and the documented wire format, for
 *  no behaviour we want. The API version is pinned below so Cashfree shipping a
 *  new default cannot change what we send.
 *
 *  ── SUBSCRIPTIONS ARE DELIBERATELY ABSENT ─────────────────────────────────
 *  The product sells one-time credit packs. That is the Orders API. Cashfree's
 *  Subscriptions API (UPI AutoPay / e-mandate) is a different product with its
 *  own onboarding, and nothing here should grow toward it by accident.
 */

/** Pinned. Cashfree changes response shapes between versions. */
const API_VERSION = "2026-01-01";

const ENDPOINTS = {
  sandbox: "https://sandbox.cashfree.com/pg",
  production: "https://api.cashfree.com/pg",
} as const;

export type CashfreeMode = keyof typeof ENDPOINTS;

export type CashfreeConfig = {
  appId: string;
  secretKey: string;
  mode: CashfreeMode;
};

/**
 * Reads the credentials, or returns null when they are not set.
 *
 * Null rather than a throw, because "not configured yet" is a normal state for
 * this repo right now — the merchant account is still in onboarding. Every
 * caller turns that into a clean "payments aren't switched on" message instead
 * of a 500, and the pricing page keeps rendering.
 *
 * `CASHFREE_MODE` must be set to "production" explicitly. Defaulting to sandbox
 * means a forgotten variable results in test payments that obviously do not
 * settle, rather than live ones that quietly do.
 */
export function cashfreeConfig(): CashfreeConfig | null {
  const appId = process.env.CASHFREE_APP_ID?.trim();
  const secretKey = process.env.CASHFREE_SECRET_KEY?.trim();
  if (!appId || !secretKey) return null;

  const mode: CashfreeMode =
    process.env.CASHFREE_MODE?.trim() === "production" ? "production" : "sandbox";

  return { appId, secretKey, mode };
}

/**
 * Fields are declared and assigned explicitly rather than with TypeScript's
 * constructor parameter-property shorthand. That shorthand emits code, so a
 * file using it cannot be run by Node's type-stripping — and scripts/
 * test-cashfree.mjs imports this module directly to test the signature check
 * against real crypto. Being runnable without a build step is worth more here
 * than three saved lines.
 */
export class CashfreeError extends Error {
  readonly status?: number;
  readonly code?: string;

  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = "CashfreeError";
    this.status = status;
    this.code = code;
  }
}

async function call<T>(
  config: CashfreeConfig,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${ENDPOINTS[config.mode]}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        "x-client-id": config.appId,
        "x-client-secret": config.secretKey,
        "x-api-version": API_VERSION,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      // Never cached: an order's status is the whole point of reading it.
      cache: "no-store",
    });
  } catch {
    throw new CashfreeError("Couldn't reach Cashfree. Check your connection.");
  }

  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // fall through — handled below
  }

  if (!res.ok) {
    const body = parsed as { message?: string; code?: string } | null;
    throw new CashfreeError(
      body?.message ?? `Cashfree returned ${res.status}.`,
      res.status,
      body?.code,
    );
  }

  if (parsed === null) {
    throw new CashfreeError("Cashfree sent an unreadable response.", res.status);
  }

  return parsed as T;
}

export type CashfreeOrder = {
  cf_order_id?: string | number;
  order_id: string;
  /** ACTIVE | PAID | EXPIRED | TERMINATED */
  order_status: string;
  order_amount?: number;
  order_currency?: string;
  payment_session_id?: string;
};

/**
 * Cashfree requires `customer_id` to be 3–50 ALPHANUMERIC characters. A Postgres
 * uuid has hyphens, so sending it raw is rejected — and the error ("invalid
 * customer_id") does not obviously point at punctuation. Stripping them is
 * lossless and reversible enough for support: the hex is still the user's id.
 */
export function customerIdFor(userId: string): string {
  const flat = userId.replace(/[^a-zA-Z0-9]/g, "");
  return flat.length >= 3 ? flat.slice(0, 50) : `u${flat}`.padEnd(3, "0");
}

/** Exactly the 10 digits Cashfree wants, or null if we don't have them. */
export function normalisePhone(input: string | null | undefined): string | null {
  const digits = (input ?? "").replace(/\D/g, "");
  // Tolerate a leading country code or a 0 trunk prefix — sellers type both.
  const last10 = digits.length > 10 ? digits.slice(-10) : digits;
  return /^[6-9]\d{9}$/.test(last10) ? last10 : null;
}

export async function createOrder(
  config: CashfreeConfig,
  params: {
    orderId: string;
    amount: number;
    customerId: string;
    customerPhone: string;
    customerName?: string | null;
    customerEmail?: string | null;
    returnUrl: string;
    notifyUrl: string;
    note?: string;
  },
): Promise<CashfreeOrder> {
  return call<CashfreeOrder>(config, "/orders", {
    method: "POST",
    body: {
      order_id: params.orderId,
      // Two decimals, always. Cashfree rejects more, and floating-point noise
      // from a numeric column is a real way to produce three.
      order_amount: Number(params.amount.toFixed(2)),
      order_currency: "INR",
      customer_details: {
        customer_id: params.customerId,
        customer_phone: params.customerPhone,
        ...(params.customerName ? { customer_name: params.customerName } : {}),
        ...(params.customerEmail ? { customer_email: params.customerEmail } : {}),
      },
      order_meta: {
        return_url: params.returnUrl,
        notify_url: params.notifyUrl,
      },
      ...(params.note ? { order_note: params.note } : {}),
    },
  });
}

export async function getOrder(
  config: CashfreeConfig,
  orderId: string,
): Promise<CashfreeOrder> {
  return call<CashfreeOrder>(config, `/orders/${encodeURIComponent(orderId)}`);
}

/**
 * ── WEBHOOK SIGNATURE ─────────────────────────────────────────────────────
 *
 *   signedPayload    = x-webhook-timestamp + RAW body
 *   expectedSignature = base64( HMAC-SHA256( signedPayload, secretKey ) )
 *
 * Two things are easy to get wrong here, and both are silent:
 *
 *   1. It must be the RAW body. `await req.json()` then `JSON.stringify()` is a
 *      different byte string — key order, spacing, unicode escapes — and the
 *      signature will never match. The route reads `await req.text()` and parses
 *      only after this returns true.
 *   2. The comparison must be timing-safe. A plain `===` leaks, byte by byte,
 *      how much of a guessed signature was right, which is enough to forge one
 *      given enough attempts. A forged webhook here mints free credits.
 */
export function verifyWebhookSignature(params: {
  secretKey: string;
  timestamp: string | null;
  rawBody: string;
  signature: string | null;
}): boolean {
  const { secretKey, timestamp, rawBody, signature } = params;
  if (!timestamp || !signature) return false;

  const expected = createHmac("sha256", secretKey)
    .update(timestamp + rawBody)
    .digest("base64");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  // timingSafeEqual throws on a length mismatch, which would itself be a leak
  // if it escaped as a different error; compare lengths first and return the
  // same false either way.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Cashfree's own order-status vocabulary, narrowed to what we act on. */
export function isPaid(orderStatus: string | undefined): boolean {
  return (orderStatus ?? "").toUpperCase() === "PAID";
}
