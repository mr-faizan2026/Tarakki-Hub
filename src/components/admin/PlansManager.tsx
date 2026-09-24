"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { Badge } from "@/components/ui/Badge";
import { PlanEditor } from "@/components/admin/PlanEditor";
import { setPlanActive } from "@/app/admin/plans/actions";
import { formatMoney, formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { Plan } from "@/lib/supabase/types";

function PlanRow({ plan }: { plan: Plan }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function toggleActive() {
    startTransition(async () => {
      await setPlanActive(plan.id, !plan.is_active);
      router.refresh();
    });
  }

  return (
    <div
      className={cn(
        "rounded-xl border bg-surface transition-colors",
        plan.is_active ? "border-hairline" : "border-hairline bg-canvas-sunk/40",
      )}
    >
      <div className="flex flex-wrap items-center gap-3 p-4 sm:p-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-600 ring-1 ring-inset ring-teal-100">
          <Icon name="layers" size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-h4 font-semibold text-ink-900">
              {plan.name}
            </h3>
            {plan.is_active ? (
              <Badge tone="teal">Active</Badge>
            ) : (
              <Badge tone="neutral">Disabled</Badge>
            )}
          </div>
          <p className="mt-0.5 text-small text-ink-500">
            {formatNumber(plan.monthly_credits)} credits / mo ·{" "}
            {plan.price_amount != null
              ? formatMoney(plan.price_amount)
              : plan.price_placeholder || "No price set"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleActive}
            disabled={pending}
            className="inline-flex h-9 items-center rounded-md border border-hairline-strong bg-surface px-3 text-small font-medium text-ink-700 transition-colors hover:border-ink-300 disabled:opacity-50"
          >
            {plan.is_active ? "Disable" : "Enable"}
          </button>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-hairline-strong bg-surface px-3 text-small font-medium text-ink-800 transition-colors hover:border-teal-300"
          >
            <Icon name="edit" size={15} />
            Edit
            <Icon
              name="chevronDown"
              size={14}
              className={cn("transition-transform", open && "rotate-180")}
            />
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-hairline p-4 sm:p-5">
          <PlanEditor plan={plan} onDone={() => setOpen(false)} />
        </div>
      ) : null}
    </div>
  );
}

export function PlansManager({ plans }: { plans: Plan[] }) {
  const [adding, setAdding] = useState(false);
  const nextSortOrder =
    plans.reduce((max, p) => Math.max(max, p.sort_order), -1) + 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-h4 font-semibold text-ink-900">
          Plans ({plans.length})
        </h2>
        {!adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-teal-500 px-4 text-small font-medium text-white transition-colors hover:bg-teal-600"
          >
            <Icon name="plus" size={16} />
            New plan
          </button>
        ) : null}
      </div>

      {adding ? (
        <div className="rounded-xl border border-teal-200 bg-surface p-4 shadow-panel sm:p-5">
          <h3 className="mb-4 font-display text-h4 font-semibold text-ink-900">
            New plan
          </h3>
          <PlanEditor
            onDone={() => setAdding(false)}
            nextSortOrder={nextSortOrder}
          />
        </div>
      ) : null}

      {plans.length === 0 && !adding ? (
        <div className="rounded-xl border border-dashed border-hairline-strong px-6 py-12 text-center">
          <p className="text-small text-ink-500">
            No plans yet. Create one, or run the database migration to seed the
            Free, Pro and Business tiers.
          </p>
        </div>
      ) : (
        plans.map((plan) => <PlanRow key={plan.id} plan={plan} />)
      )}
    </div>
  );
}
