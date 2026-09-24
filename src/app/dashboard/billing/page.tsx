import type { Metadata } from "next";
import { loadAccount, creditsTotal } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader } from "@/components/dashboard/Card";
import { CreditMeter } from "@/components/dashboard/CreditMeter";
import { PlanCard } from "@/components/billing/PlanCard";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { formatDate, titleCase } from "@/lib/format";
import type { Plan } from "@/lib/supabase/types";

export const metadata: Metadata = { title: "Billing & Plan" };

export default async function BillingPage() {
  const { profile, usage } = await loadAccount();
  const supabase = await createClient();
  const { data } = await supabase
    .from("plans")
    .select("*")
    .order("sort_order", { ascending: true });

  const plans = (data ?? []) as Plan[];
  const total = creditsTotal(usage);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Billing & Plan"
        description="Manage your plan and keep an eye on your credits. Paid plans are on the way."
      />

      {/* Current plan summary */}
      <Card>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="label-mono text-ink-400">Current plan</span>
              <Badge tone="teal">{titleCase(profile.plan)}</Badge>
            </div>
            <p className="mt-2 max-w-md text-small text-ink-500">
              You&apos;re on the {titleCase(profile.plan)} plan. Renewal and
              billing details will appear here once paid plans launch.
            </p>
          </div>
          <div className="w-full max-w-xs shrink-0">
            <div className="flex items-baseline justify-between">
              <span className="text-small text-ink-500">Credits</span>
              <span className="font-display text-h4 font-semibold tabular-nums text-ink-900">
                {usage.credits_remaining}
              </span>
            </div>
            <CreditMeter
              remaining={usage.credits_remaining}
              total={total}
              className="mt-2.5"
            />
            <div className="mt-2.5 flex items-center justify-between text-small text-ink-400">
              <span>{usage.images_used} used</span>
              <span>Resets {formatDate(usage.period_end)}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Plan scaffold */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-h4 font-semibold text-ink-900">Plans</h2>
          <Badge tone="outline">Pricing launching soon</Badge>
        </div>
        {plans.length === 0 ? (
          <Card>
            <p className="text-small text-ink-500">
              Plans haven&apos;t been set up yet. Run the database migration to
              seed the Free, Pro and Business tiers.
            </p>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                current={plan.name.toLowerCase() === profile.plan.toLowerCase()}
                featured={plan.name.toLowerCase() === "pro"}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Cashfree integration point ──────────────────────────────────────
          Billing will run through Cashfree (see PAYMENTS in src/lib/config.ts).
          Checkout is intentionally not wired yet: when it goes live, kick off
          the Cashfree order/session here and route each PlanCard's upgrade
          button into it. Nothing is charged today. */}
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-canvas-sunk text-ink-500">
              <Icon name="shield" size={18} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display text-h4 font-semibold text-ink-900">
                  Secure checkout
                </h3>
                <Badge tone="outline">Cashfree · Coming soon</Badge>
              </div>
              <p className="mt-1 max-w-md text-small text-ink-500">
                Payments will be processed securely by Cashfree. No payment
                method is required today and nothing is charged automatically —
                you&apos;ll be able to upgrade from here when checkout launches.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled
            className="h-11 shrink-0 cursor-not-allowed rounded-md border border-hairline-strong bg-surface px-5 text-small font-medium text-ink-400"
          >
            Checkout launching soon
          </button>
        </div>
      </Card>
    </div>
  );
}
