import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  cashfreeConfig,
  getOrder,
  isPaid,
  verifyWebhookSignature,
} from "@/lib/cashfree";

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  POST /api/webhooks/cashfree — the only thing that turns money into credits
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  ── WHY ALMOST EVERYTHING HERE RETURNS 200 ────────────────────────────────
 *  Cashfree retries any non-2xx, with backoff, for hours. A 500 for a case that
 *  will never succeed — an order we have no row for, an event type we ignore —
 *  buys nothing and fills their queue with a message that can only fail again.
 *  So: 200 for "received and dealt with, including by deciding to do nothing",
 *  and a non-2xx ONLY for a failure that a retry could genuinely fix (the
 *  database was briefly unreachable).
 *
 *  The one exception is a bad signature, which gets 401. That is not a retryable
 *  condition — it is someone who should not be here.
 *
 *  ── THE FOUR THINGS BETWEEN A REQUEST AND A CREDIT ────────────────────────
 *    1. The signature verifies against the RAW body (see lib/cashfree.ts).
 *    2. The order id matches a `payments` row we wrote at checkout.
 *    3. Cashfree's own API, asked directly, says that order is PAID.
 *    4. `grant_credit_pack` has not already latched `granted_at`.
 *
 *  Step 3 looks redundant after step 1 and mostly is — but it is what makes a
 *  LEAKED WEBHOOK SECRET survivable. With the secret alone an attacker can forge
 *  a perfectly signed "this order was paid" for an order that was never paid;
 *  they cannot also make Cashfree's API agree. One extra HTTPS call is a cheap
 *  price for that, on a path whose entire job is handing out paid goods.
 *
 *  ── THE AMOUNT IS NEVER READ FROM THE WEBHOOK ─────────────────────────────
 *  Not from the body, not from the verified order. The credits come from the
 *  payment row, which was written from the pack catalogue at checkout. There is
 *  no code path on which a number arriving over the network becomes a credit
 *  balance.
 */

export const runtime = "nodejs";
// A webhook has no session and must never be served from a cache.
export const dynamic = "force-dynamic";

type WebhookBody = {
  type?: string;
  data?: {
    order?: { order_id?: string };
    payment?: { payment_status?: string; cf_payment_id?: number | string };
  };
};

export async function POST(request: Request) {
  const config = cashfreeConfig();
  if (!config) {
    // Nothing is configured, so nothing legitimate can be arriving. Say OK so
    // Cashfree stops, and do not hint at why.
    return NextResponse.json({ ok: true });
  }

  // RAW body first. Parsing and re-stringifying produces different bytes and
  // the signature would never match — see verifyWebhookSignature.
  const rawBody = await request.text();

  const valid = verifyWebhookSignature({
    secretKey: config.secretKey,
    timestamp: request.headers.get("x-webhook-timestamp"),
    rawBody,
    signature: request.headers.get("x-webhook-signature"),
  });

  if (!valid) {
    return NextResponse.json({ ok: false, error: "bad_signature" }, { status: 401 });
  }

  let body: WebhookBody;
  try {
    body = JSON.parse(rawBody) as WebhookBody;
  } catch {
    return NextResponse.json({ ok: true, ignored: "unparseable" });
  }

  const orderId = body.data?.order?.order_id;
  if (!orderId) {
    return NextResponse.json({ ok: true, ignored: "no_order_id" });
  }

  const db = createAdminClient();

  const { data: payment, error: lookupError } = await db
    .from("payments")
    .select("id, status, granted_at, user_id")
    .eq("provider", "cashfree")
    .eq("provider_ref", orderId)
    .maybeSingle();

  if (lookupError) {
    // A real transient failure: ask for the retry.
    return NextResponse.json({ ok: false, error: "db_unavailable" }, { status: 503 });
  }

  if (!payment) {
    // An order from another environment (sandbox webhook hitting production, or
    // the reverse) or one whose row never got written. Nothing to do, ever.
    return NextResponse.json({ ok: true, ignored: "unknown_order" });
  }

  if (payment.granted_at) {
    // Already settled. The common case for a retry, and not an error.
    return NextResponse.json({ ok: true, alreadyGranted: true });
  }

  // ── Ask Cashfree directly, rather than believing the message ─────────────
  let paid = false;
  try {
    const order = await getOrder(config, orderId);
    paid = isPaid(order.order_status);
  } catch {
    // We could not confirm. Do NOT grant on the webhook's say-so; ask for a
    // retry instead, and let the billing page's own polling cover the gap.
    return NextResponse.json({ ok: false, error: "verify_failed" }, { status: 503 });
  }

  const now = new Date().toISOString();

  if (!paid) {
    // A dropped or failed payment. Record it so support can see what happened,
    // but never mark a row failed once it has succeeded — Cashfree can deliver
    // a late FAILED for one attempt after a later attempt succeeded.
    if (payment.status === "pending") {
      await db
        .from("payments")
        .update({ status: "failed", updated_at: now })
        .eq("id", payment.id);
    }
    return NextResponse.json({ ok: true, paid: false });
  }

  const { error: markError } = await db
    .from("payments")
    .update({ status: "success", updated_at: now })
    .eq("id", payment.id);

  if (markError) {
    return NextResponse.json({ ok: false, error: "db_unavailable" }, { status: 503 });
  }

  // The grant itself is idempotent and latched on granted_at, so a retry that
  // races this one adds nothing.
  const { error: grantError } = await db.rpc("grant_credit_pack", {
    p_payment_id: payment.id,
  });

  if (grantError) {
    // The money is in and the row says success, but the credits are not out.
    // A retry is exactly what should happen, and the latch makes it safe.
    return NextResponse.json({ ok: false, error: "grant_failed" }, { status: 503 });
  }

  return NextResponse.json({ ok: true, paid: true, granted: true });
}
