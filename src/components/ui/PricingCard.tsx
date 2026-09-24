import type { PricingTier } from "@/content/pricing";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

export function PricingCard({
  tier,
  billing,
}: {
  tier: PricingTier;
  billing: "monthly" | "yearly";
}) {
  const featured = tier.featured;
  const price = tier.price[billing];

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-lg p-6 sm:p-7",
        featured
          ? "border-2 border-teal-500 bg-surface shadow-[0_2px_4px_rgba(14,33,49,0.04),0_28px_60px_-34px_rgba(15,156,136,0.45)]"
          : "border border-hairline bg-surface",
      )}
    >
      {featured && (
        <span className="absolute -top-3 left-6 inline-flex items-center rounded-full bg-teal-500 px-3 py-1 text-micro font-semibold uppercase tracking-[0.08em] text-white">
          Most popular
        </span>
      )}

      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-h4 font-semibold text-ink-900">
          {tier.name}
        </h3>
      </div>
      <p className="mt-1.5 text-small text-ink-500">{tier.tagline}</p>

      <div className="mt-6 flex items-end gap-1.5">
        <span className="font-display text-display font-semibold leading-none text-ink-900">
          {price}
        </span>
        {price !== "—" && tier.id !== "free" && (
          <span className="mb-1 text-small text-ink-400">
            /{billing === "monthly" ? "mo" : "mo, billed yearly"}
          </span>
        )}
      </div>
      <p className="mt-2 text-micro font-medium uppercase tracking-[0.08em] text-teal-700">
        {tier.priceNote}
      </p>

      <Button
        href="/signup"
        variant={featured ? "primary" : "secondary"}
        block
        className="mt-6"
      >
        {tier.cta}
      </Button>

      <ul className="mt-7 space-y-3 border-t border-hairline pt-6">
        {tier.features.map((f) => (
          <li key={f} className="flex gap-2.5 text-small text-ink-700">
            <Icon
              name="check"
              size={16}
              strokeWidth={2.2}
              className="mt-0.5 shrink-0 text-teal-600"
            />
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
