import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/config";
import {
  cashfreeConfig,
  createOrder,
  customerIdFor,
  normalisePhone,
  CashfreeError,
} from "@/lib/cashfree";

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  POST /api/checkout — start paying for a credit pack
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Request:  { pack: "growth", phone?: "9876543210" }
 *  Response: { orderId, paymentSessionId, mode }
 *
 *  ── THE ONE RULE THIS ROUTE EXISTS TO ENFORCE ─────────────────────────────
 *  THE CLIENT NEVER SENDS AN AMOUNT. It names a pack; the price, the credit
 *  count and the validity are read here from `credit_packs`. A tampered request
 *  can pick a different pack — which is just... buying a different pack — and
 *  can do nothing else. If this route ever accepts a number from the body, the
 *  whole billing system is worthless.
 *
 *  ── THE PAYMENT ROW IS WRITTEN BEFORE CASHFREE IS CALLED ──────────────────
 *  Deliberately in that order. If we called Cashfree first and then lost the
 *  response — a timeout, a cold start killed mid-flight — there would be a live
 *  order out in the world that this database has never heard of, and the webhook
 *  for it would arrive referencing nothing. Writing first means the worst case
 *  is a `pending` row for an order the buyer abandoned, which is harmless and
 *  visible in /admin → Payments.
 *
 *  ── WHY THE SERVICE ROLE WRITES THE ROW ───────────────────────────────────
 *  `payments` has an owner-read policy and NO insert policy, on purpose: a user
 *  must not be able to write their own payment records. The identity still comes
 *  from the cookie-bound client above — the service role is used only after
 *  `getUser()` has established who is asking.
 */

export const runtime = "nodejs";

type Body = { pack?: unknown; phone?: unknown };

function bad(error: string, code: string, status = 400) {
  return NextResponse.json({ ok: false, error, code }, { status });
}

/**
 * Cashfree wants an order id of 3–45 characters. Ours is a prefix plus 16 hex
 * characters of randomness — not the payment row's uuid, because that is a
 * database key and this value is shown to the buyer, logged by Cashfree and
 * pasted into support chats.
 */
function newOrderId(): string {
  return `th_${randomBytes(8).toString("hex")}`;
}

export async function POST(request: Request) {
  const config = cashfreeConfig();
  if (!config) {
    return bad(
      "Payments aren't switched on yet. Please try again shortly.",
      "not_configured",
      503,
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return bad("Please sign in to buy credits.", "not_authenticated", 401);

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return bad("Malformed request.", "bad_request");
  }

  const slug = typeof body.pack === "string" ? body.pack.trim() : "";
  if (!slug) return bad("Pick a credit pack first.", "pack_required");

  const db = createAdminClient();

  // ── Who is buying ────────────────────────────────────────────────────────
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, phone, status")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.status === "blocked") {
    return bad("This account is blocked.", "account_blocked", 403);
  }

  // Cashfree requires a 10-digit phone on every order. Prefer one just typed,
  // fall back to the stored one, and persist a new one so a repeat purchase
  // doesn't ask again.
  const typedPhone = typeof body.phone === "string" ? normalisePhone(body.phone) : null;
  const phone = typedPhone ?? normalisePhone(profile?.phone);
  if (!phone) {
    return bad(
      "Enter a 10-digit mobile number to continue.",
      "phone_required",
      422,
    );
  }
  if (typedPhone && typedPhone !== profile?.phone) {
    await db.from("profiles").update({ phone: typedPhone }).eq("id", user.id);
  }

  // ── What is being bought — read here, never from the request ─────────────
  const { data: pack } = await db
    .from("credit_packs")
    .select("*")
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();

  if (!pack) return bad("That pack isn't available.", "pack_not_found", 404);

  // ── Record the intent, then ask Cashfree for a session ───────────────────
  const orderId = newOrderId();
  const amount = Number(pack.price_inr);

  const { data: payment, error: insertError } = await db
    .from("payments")
    .insert({
      user_id: user.id,
      amount,
      currency: "INR",
      status: "pending",
      provider: "cashfree",
      provider_ref: orderId,
      pack_slug: pack.slug,
      credits_granted: pack.credits,
      validity_days: pack.validity_days,
    })
    .select("id")
    .single();

  if (insertError || !payment) {
    return bad("Couldn't start the payment. Please try again.", "db_error", 500);
  }

  const base = siteUrl();

  try {
    const order = await createOrder(config, {
      orderId,
      amount,
      customerId: customerIdFor(user.id),
      customerPhone: phone,
      customerName: profile?.full_name ?? null,
      customerEmail: user.email ?? null,
      // Cashfree substitutes {order_id} itself, so the buyer lands back on a
      // page that knows which order to look up even if the webhook is slow.
      returnUrl: `${base}/dashboard/billing?order_id={order_id}`,
      notifyUrl: `${base}/api/webhooks/cashfree`,
      note: `${pack.name} — ${pack.credits} credits`,
    });

    if (!order.payment_session_id) {
      throw new CashfreeError("Cashfree didn't return a payment session.");
    }

    return NextResponse.json({
      ok: true,
      orderId,
      paymentSessionId: order.payment_session_id,
      mode: config.mode,
    });
  } catch (err) {
    // The order never got off the ground, so the pending row is dead weight.
    // Mark it failed rather than deleting it: a row that explains why a seller
    // saw an error is worth keeping when they message support about it.
    await db
      .from("payments")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", payment.id);

    const message =
      err instanceof CashfreeError
        ? err.message
        : "Couldn't start the payment. Please try again.";
    return bad(message, "gateway_error", 502);
  }
}
