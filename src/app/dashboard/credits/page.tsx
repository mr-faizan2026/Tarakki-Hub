import type { Metadata } from "next";
import { loadAccount, creditsTotal } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader } from "@/components/dashboard/Card";
import { CreditMeter } from "@/components/dashboard/CreditMeter";
import { CreditLog } from "@/components/credits/CreditLog";
import { Icon } from "@/components/ui/Icon";
import { formatDate } from "@/lib/format";
import type { CreditEvent } from "@/lib/supabase/types";

export const metadata: Metadata = { title: "Credits" };

export default async function CreditsPage() {
  const { user, usage } = await loadAccount();
  const supabase = await createClient();

  const { data } = await supabase
    .from("credit_events")
    .select("id, user_id, action, credits, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const events = (data ?? []) as CreditEvent[];
  const total = creditsTotal(usage);
  const low = usage.credits_remaining <= 1;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Credits"
        description="Your credit balance and a history of what you've spent. Credits are used inside the Chrome extension and read here in real time."
      />

      {/* Balance */}
      <Card>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="label-mono text-ink-400">Credits remaining</span>
            <div className="mt-1 flex items-end gap-2">
              <span
                className={
                  "font-display text-display font-semibold tabular-nums leading-none " +
                  (low ? "text-amber-600" : "text-ink-900")
                }
              >
                {usage.credits_remaining}
              </span>
              <span className="pb-1 text-small text-ink-400">
                / {total} this period
              </span>
            </div>
            <p className="mt-3 max-w-md text-small text-ink-500">
              {usage.credits_remaining === 0
                ? "You're out of credits. Top up from Billing & Plan once paid plans launch."
                : "Spend credits in the extension — each spend is logged below."}
            </p>
          </div>

          <div className="w-full max-w-xs shrink-0">
            <CreditMeter
              remaining={usage.credits_remaining}
              total={total}
              className="mb-3"
            />
            <div className="flex items-center justify-between text-small text-ink-400">
              <span className="inline-flex items-center gap-1.5">
                <Icon name="sliders" size={15} />
                {usage.images_used} used
              </span>
              <span>Resets {formatDate(usage.period_end)}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Usage history */}
      <Card>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-h4 font-semibold text-ink-900">
            Usage history
          </h2>
          {events.length > 0 ? (
            <span className="text-small text-ink-400">
              {events.length} {events.length === 1 ? "entry" : "entries"}
            </span>
          ) : null}
        </div>
        <div className="mt-4">
          <CreditLog events={events} />
        </div>
      </Card>
    </div>
  );
}
