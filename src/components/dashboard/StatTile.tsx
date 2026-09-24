import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

export function StatTile({
  icon,
  label,
  value,
  sub,
  tone = "ink",
}: {
  icon: IconName;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "ink" | "teal" | "amber";
}) {
  const iconTone = {
    ink: "bg-canvas-sunk text-ink-500",
    teal: "bg-teal-50 text-teal-600 ring-1 ring-inset ring-teal-100",
    amber: "bg-amber-500/12 text-amber-600 ring-1 ring-inset ring-amber-500/20",
  }[tone];

  return (
    <div className="rounded-xl border border-hairline bg-surface p-5 shadow-[0_1px_0_0_rgba(14,33,49,0.03)]">
      <div className="flex items-center justify-between">
        <span className="text-small font-medium text-ink-500">{label}</span>
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", iconTone)}>
          <Icon name={icon} size={17} />
        </span>
      </div>
      <div className="mt-3 font-display text-h2 font-semibold tabular-nums leading-none text-ink-900">
        {value}
      </div>
      {sub ? <div className="mt-2 text-small text-ink-500">{sub}</div> : null}
    </div>
  );
}
