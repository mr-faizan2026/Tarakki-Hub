import type { Metadata } from "next";
import { requireAdminData, getStarterCredits } from "@/lib/admin";
import { Card, PageHeader } from "@/components/dashboard/Card";
import { PlansManager } from "@/components/admin/PlansManager";
import { StarterCreditsForm } from "@/components/admin/StarterCreditsForm";
import { Icon } from "@/components/ui/Icon";
import type { Plan } from "@/lib/supabase/types";

export const metadata: Metadata = { title: "Plans" };

export default async function AdminPlansPage() {
  const { db } = await requireAdminData();

  const [{ data: planRows }, starterCredits] = await Promise.all([
    db.from("plans").select("*").order("sort_order", { ascending: true }),
    getStarterCredits(db),
  ]);

  const plans = (planRows ?? []) as Plan[];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Plans"
        description="Manage the subscription tiers users can choose from. Prices are placeholders until Cashfree billing is connected."
      />

      {/* Global starter-credit setting */}
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-600 ring-1 ring-inset ring-teal-100">
              <Icon name="spark" size={18} />
            </span>
            <div>
              <h2 className="font-display text-h4 font-semibold text-ink-900">
                Starter credits
              </h2>
              <p className="mt-1 max-w-md text-small text-ink-500">
                Free credits every new account receives on signup. Applies to
                accounts created after you change it.
              </p>
            </div>
          </div>
          <StarterCreditsForm current={starterCredits} />
        </div>
      </Card>

      <PlansManager plans={plans} />

      {/* Cashfree integration point */}
      <Card>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-canvas-sunk text-ink-500">
            <Icon name="creditCard" size={18} />
          </span>
          <div>
            <h3 className="font-display text-h4 font-semibold text-ink-900">
              Pricing &amp; checkout
            </h3>
            <p className="mt-1 max-w-2xl text-small text-ink-500">
              The <span className="font-medium text-ink-700">Price amount</span>{" "}
              field is where each plan&apos;s real price will live once Cashfree
              is connected. Today it&apos;s a placeholder — nothing is charged and
              no checkout runs. When billing goes live, these amounts feed the
              Cashfree order/session flow.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
