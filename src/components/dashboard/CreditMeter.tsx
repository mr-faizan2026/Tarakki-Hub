import { cn } from "@/lib/cn";

/** A slim credits bar. `total` is a soft reference for the fill, not a cap. */
export function CreditMeter({
  remaining,
  total,
  className,
}: {
  remaining: number;
  total: number;
  className?: string;
}) {
  const pct = total > 0 ? Math.max(0, Math.min(100, (remaining / total) * 100)) : 0;
  const low = remaining <= 1;

  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-hairline-strong", className)}>
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-500",
          low ? "bg-amber-500" : "bg-teal-500",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
