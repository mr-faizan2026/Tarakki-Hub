import type { Metadata } from "next";
import { loadAccount, accessStatus } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader } from "@/components/dashboard/Card";
import { CreditMeter } from "@/components/dashboard/CreditMeter";
import { PackCard } from "@/components/billing/PackCard";
import { OrderResult } from "@/components/billing/OrderResult";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { formatDate } from "@/lib/format";
import { cashfreeConfig } from "@/lib/cashfree";
import type { CreditPack } from "@/lib/supabase/types";

export const metadata: Metadata = { title: "Billing & Credits" };

/**
 * /dashboard/billing — buy credits, and see what is left.
 *
 * ── TWO NUMBERS, AND THEY MEAN DIFFERENT THINGS ───────────────────────────
 * `credits_remaining` is what can still be spent. `period_end` is when it
 * lapses. Showing the balance without the date would be a quiet lie now that
 * 0005 makes expiry real — a seller with 300 credits that die on Friday needs to
 * know it is Friday.
 *
 * ── WHY THE PACK GRID IS NOT GATED ON THE GATEWAY BEING LIVE ──────────────
 * The packs render whether or not Cashfree credentials are configured, because
 * what is for sale is not a function of whether we can currently charge for it.
 * If the keys are missing the checkout route answers `not_configured`, and the
 * notice below says so plainly rather than the page pretending there is nothing
 * to buy.
 */
export default async function BillingPage({
  searchParams,
}: {
  // Cashfree returns the buyer to ?order_id=… — see the return_url built in
  // /api/checkout.
  searchParams: Promise<{ order_id?: string }>;
}) {
  const { profile, usage } = await loadAccount();
  const supabase = await createClient();

  const { data } = await supabase
    .from("credit_packs")
    .select("*")
    .eq("active", true)
    .order("sort_order", { ascending: true });

  const packs = (data ?? []) as CreditPack[];
  const { order_id: orderId } = await searchParams;
  const gatewayLive = cashfreeConfig() !== null;

  const access = accessStatus(profile, usage);
  const paidActive = access.paid;
  const expired =
    usage.credits_remaining > 0 &&
    usage.period_end != null &&
    new Date(usage.period_end).getTime() <= Date.now();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Billing & Credits"
        description="Buy a pack of credits. No subscription, no auto-debit."
      />

      {orderId ? <OrderResult orderId={orderId} /> : null}

      {/* ── What you have now ─────────────────────────────────────────────── */}
      <Card>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="label-mono text-ink-400">Your credits</span>
              {paidActive ? (
                <Badge tone="teal">Paid</Badge>
              ) : (
                <Badge tone="outline">Free</Badge>
              )}
            </div>
            <p className="mt-2 max-w-md text-small text-ink-500">
              {expired ? (
                <>
                  Your credits expired on{" "}
                  <strong className="text-ink-800">{formatDate(usage.period_end)}</strong>.
                  Buy a pack below to carry on.
                </>
              ) : usage.credits_remaining > 0 ? (
                <>
                  Valid until{" "}
                  <strong className="text-ink-800">{formatDate(usage.period_end)}</strong>.
                  One credit is spent only when you use an image that beats your own
                  photo&rsquo;s shipping.
                </>
              ) : (
                <>
                  You have no credits left. Buy a pack below — listing autofill stays
                  available while your pack is valid.
                </>
              )}
            </p>
            {access.until && (
              <p className="mt-1.5 text-micro text-ink-400">
                Autofill active until {formatDate(access.until)}
              </p>
            )}
          </div>

          <div className="w-full max-w-xs shrink-0">
            <div className="flex items-baseline justify-between">
              <span className="text-small text-ink-500">Remaining</span>
              <span className="font-display text-h4 font-semibold tabular-nums text-ink-900">
                {expired ? 0 : usage.credits_remaining}
              </span>
            </div>
            <CreditMeter
              remaining={expired ? 0 : usage.credits_remaining}
              total={Math.max(usage.credits_remaining + usage.images_used, 1)}
              className="mt-2.5"
            />
            <div className="mt-2.5 flex items-center justify-between text-micro text-ink-400">
              <span>{usage.images_used} used all-time</span>
              <span>{profile.full_name ? profile.full_name : "Your account"}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* ── What you can buy ──────────────────────────────────────────────── */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-h4 font-semibold text-ink-900">
            Credit packs
          </h2>
          <span className="text-micro text-ink-400">Prices include GST</span>
        </div>

        {packs.length === 0 ? (
          <Card>
            <p className="text-small text-ink-500">
              Packs haven&rsquo;t been set up yet. Run the{" "}
              <code>0005_billing.sql</code> migration to seed them.
            </p>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {packs.map((pack) => (
              <PackCard key={pack.id} pack={pack} signedIn ctaLabel="Buy now" />
            ))}
          </div>
        )}
      </div>

      {/* ── Who takes the money ───────────────────────────────────────────── */}
      <Card>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-canvas-sunk text-ink-500">
            <Icon name="shield" size={18} />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-display text-h4 font-semibold text-ink-900">
                Secure checkout
              </h3>
              {gatewayLive ? (
                <Badge tone="teal">Cashfree</Badge>
              ) : (
                <Badge tone="outline">Cashfree · not connected</Badge>
              )}
            </div>
            <p className="mt-1 max-w-lg text-small text-ink-500">
              {gatewayLive ? (
                <>
                  Payments are processed by Cashfree. We never see or store your card,
                  UPI or bank details. Credits are added automatically the moment the
                  payment is confirmed.
                </>
              ) : (
                <>
                  Checkout isn&rsquo;t connected yet, so buying is switched off. Add the
                  Cashfree credentials to enable it — nothing else needs to change.
                </>
              )}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
