"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { savePlan } from "@/app/admin/plans/actions";
import type { Plan } from "@/lib/supabase/types";

const inputBase =
  "h-10 w-full rounded-md border border-hairline-strong bg-surface px-3 text-small text-ink-900 placeholder:text-ink-400 transition-[border-color,box-shadow] focus:border-teal-400 focus:shadow-[0_0_0_3px_var(--color-teal-100)] focus:outline-none";
const labelBase = "text-small font-medium text-ink-800";

function featuresToText(features: Plan["features"] | undefined): string {
  return Array.isArray(features) ? (features as string[]).join("\n") : "";
}

export function PlanEditor({
  plan,
  onDone,
  nextSortOrder = 0,
}: {
  plan?: Plan;
  onDone?: () => void;
  nextSortOrder?: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isNew = !plan;

  const [name, setName] = useState(plan?.name ?? "");
  const [pricePlaceholder, setPricePlaceholder] = useState(
    plan?.price_placeholder ?? "",
  );
  const [priceAmount, setPriceAmount] = useState(
    plan?.price_amount != null ? String(plan.price_amount) : "",
  );
  const [monthlyCredits, setMonthlyCredits] = useState(
    String(plan?.monthly_credits ?? 0),
  );
  const [features, setFeatures] = useState(featuresToText(plan?.features));
  const [isActive, setIsActive] = useState(plan?.is_active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function submit() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await savePlan({
        id: plan?.id,
        name,
        price_placeholder: pricePlaceholder,
        price_amount: priceAmount,
        monthly_credits: monthlyCredits,
        features: features.split("\n"),
        is_active: isActive,
        sort_order: plan?.sort_order ?? nextSortOrder,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved(true);
      router.refresh();
      onDone?.();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className={labelBase}>Plan name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Pro"
            className={inputBase}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelBase}>Monthly credits</span>
          <input
            type="number"
            inputMode="numeric"
            value={monthlyCredits}
            onChange={(e) => setMonthlyCredits(e.target.value)}
            placeholder="200"
            className={inputBase}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelBase}>Price label</span>
          <input
            value={pricePlaceholder}
            onChange={(e) => setPricePlaceholder(e.target.value)}
            placeholder="Pricing launching soon"
            className={inputBase}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelBase}>
            Price amount{" "}
            <span className="font-normal text-ink-400">₹ · Cashfree (later)</span>
          </span>
          <input
            type="number"
            inputMode="decimal"
            value={priceAmount}
            onChange={(e) => setPriceAmount(e.target.value)}
            placeholder="Leave blank until pricing is set"
            className={inputBase}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className={labelBase}>
          Features{" "}
          <span className="font-normal text-ink-400">one per line</span>
        </span>
        <textarea
          value={features}
          onChange={(e) => setFeatures(e.target.value)}
          rows={4}
          placeholder={"200 credits / month\nBatch processing\nPriority support"}
          className={cn(inputBase, "h-auto resize-y py-2.5 leading-relaxed")}
        />
      </label>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          role="switch"
          aria-checked={isActive}
          onClick={() => setIsActive((v) => !v)}
          className="inline-flex items-center gap-2.5"
        >
          <span
            className={cn(
              "relative h-6 w-10 rounded-full transition-colors",
              isActive ? "bg-teal-500" : "bg-hairline-strong",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
                isActive ? "translate-x-[1.125rem]" : "translate-x-0.5",
              )}
            />
          </span>
          <span className="text-small font-medium text-ink-700">
            {isActive ? "Active — shown to users" : "Disabled — hidden"}
          </span>
        </button>

        <div className="flex items-center gap-2">
          {isNew && onDone ? (
            <button
              type="button"
              onClick={onDone}
              className="inline-flex h-10 items-center rounded-md border border-hairline-strong bg-surface px-4 text-small font-medium text-ink-700 transition-colors hover:border-ink-300"
            >
              Cancel
            </button>
          ) : null}
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-teal-500 px-4 text-small font-medium text-white transition-colors hover:bg-teal-600 disabled:pointer-events-none disabled:opacity-50"
          >
            {pending ? "Saving…" : isNew ? "Create plan" : "Save changes"}
          </button>
        </div>
      </div>

      {error ? (
        <p className="flex items-center gap-1.5 text-small text-danger-600">
          <Icon name="ban" size={14} />
          {error}
        </p>
      ) : saved && !isNew ? (
        <p className="flex items-center gap-1.5 text-small text-teal-700">
          <Icon name="check" size={14} />
          Saved.
        </p>
      ) : null}
    </div>
  );
}
