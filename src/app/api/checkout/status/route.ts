import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cashfreeConfig, getOrder, isPaid } from "@/lib/cashfree";

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  GET /api/checkout/status?order_id=th_… — did my payment land?
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  ── WHY THIS EXISTS WHEN THERE IS ALREADY A WEBHOOK ───────────────────────
 *  Because the buyer is standing there watching. The webhook is the system of
 *  record, but it is server-to-server and can be seconds late, can be retried
 *  after a failure, and — on `next dev` — never arrives at all, because
 *  Cashfree cannot reach localhost. Without this, local testing of the whole
 *  flow would be impossible and a slow webhook would show a paying customer an
 *  unchanged balance.
 *
 *  So this is the same settlement, triggered by the returning buyer instead of
 *  by Cashfree. Both funnel into `grant_credit_pack`, whose `granted_at` latch
 *  means whichever arrives second does nothing.
 *
 *  ── IT IS NOT A WEAKER DOOR THAN THE WEBHOOK ──────────────────────────────
 *  It never trusts its caller for anything but an order id, and that id is
 *  matched against `user_id` as well, so one signed-in seller cannot poll — or
 *  settle — another's order. Whether the money arrived is decided the same way
 *  the webhook decides it: by asking Cashfree's API.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "not_authenticated" },
      { status: 401 },
    );
  }

  const orderId = new URL(request.url).searchParams.get("order_id")?.trim();
  if (!orderId) {
    return NextResponse.json({ ok: false, error: "order_id_required" }, { status: 400 });
  }

  const db = createAdminClient();

  // Scoped to this user: an order id is guessable enough that it must not be a
  // bearer token for someone else's payment.
  const { data: payment } = await db
    .from("payments")
    .select("id, status, granted_at, credits_granted, pack_slug")
    .eq("provider", "cashfree")
    .eq("provider_ref", orderId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!payment) {
    return NextResponse.json({ ok: false, error: "order_not_found" }, { status: 404 });
  }

  if (payment.granted_at) {
    return NextResponse.json({
      ok: true,
      status: "paid",
      granted: true,
      credits: payment.credits_granted,
      pack: payment.pack_slug,
    });
  }

  const config = cashfreeConfig();
  if (!config) {
    return NextResponse.json({ ok: true, status: payment.status, granted: false });
  }

  let paid = false;
  try {
    const order = await getOrder(config, orderId);
    paid = isPaid(order.order_status);
  } catch {
    // Couldn't reach Cashfree. Report what we know rather than guessing; the
    // caller polls again, and the webhook is still coming.
    return NextResponse.json({ ok: true, status: payment.status, granted: false });
  }

  if (!paid) {
    return NextResponse.json({ ok: true, status: "pending", granted: false });
  }

  const now = new Date().toISOString();
  await db
    .from("payments")
    .update({ status: "success", updated_at: now })
    .eq("id", payment.id);

  const { error: grantError } = await db.rpc("grant_credit_pack", {
    p_payment_id: payment.id,
  });

  if (grantError) {
    return NextResponse.json({ ok: true, status: "paid", granted: false });
  }

  return NextResponse.json({
    ok: true,
    status: "paid",
    granted: true,
    credits: payment.credits_granted,
    pack: payment.pack_slug,
  });
}
