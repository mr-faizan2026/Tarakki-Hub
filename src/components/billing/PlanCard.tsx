import { Icon } from "@/components/ui/Icon";
import { Badge } from "@/components/ui/Badge";
import type { Plan } from "@/lib/supabase/types";
import { cn } from "@/lib/cn";

function featureList(features: Plan["features"]): string[] {
  return Array.isArray(features) ? (features as string[]) : [];
}

export function PlanCard({
  plan,
  current,
  featured,
}: {
  plan: Plan;
  current: boolean;
  featured?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col rounded-2xl border bg-surface p-6",
        featured ? "border-teal-300 shadow-panel" : "border-hairline",
      )}
    >
      <div className="flex items-center justify-between">
        <h3 className="font-display text-h4 font-semibold text-ink-900">
          {plan.name}
        </h3>
        {current ? (
          <Badge tone="teal">Current plan</Badge>
        ) : featured ? (
          <Badge tone="amber">Popular</Badge>
        ) : null}
      </div>

      <p className="mt-3 font-display text-h3 font-semibold text-ink-900">
        {plan.price_placeholder ?? "—"}
      </p>
      <p className="text-small text-ink-400">Pricing launching soon</p>

      <ul className="mt-5 flex flex-1 flex-col gap-2.5">
        {featureList(plan.features).map((feature) => (
          <li key={feature} className="flex items-start gap-2.5 text-small text-ink-700">
            <Icon
              name="check"
              size={16}
              className="mt-0.5 shrink-0 text-teal-600"
            />
            {feature}
          </li>
        ))}
      </ul>

      {/* ── Payment integration point ───────────────────────────────────────
          When billing goes live, wire the Cashfree checkout (see PAYMENTS in
          src/lib/config.ts) to this button for non-current plans. Kept
          intentionally inert for now. */}
      <button
        type="button"
        disabled
        className={cn(
          "mt-6 h-11 w-full cursor-not-allowed rounded-md text-small font-medium",
          current
            ? "bg-canvas-sunk text-ink-400"
            : "border border-hairline-strong bg-surface text-ink-400",
        )}
      >
        {current ? "Your current plan" : "Pricing launching soon"}
      </button>
    </div>
  );
}
