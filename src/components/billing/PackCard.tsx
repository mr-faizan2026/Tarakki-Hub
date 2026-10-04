import type { CreditPack } from "@/lib/supabase/types";
import { Icon } from "@/components/ui/Icon";
import { BuyPackButton } from "@/components/billing/BuyPackButton";
import { cn } from "@/lib/cn";

/**
 * One credit pack, on the marketing page and on the billing page alike.
 *
 * ── EVERYTHING COMES FROM THE ROW ─────────────────────────────────────────
 * Price, credits, validity and the feature list are read from `credit_packs`,
 * the same table /api/checkout charges from. That is why the page and the
 * charge cannot disagree: there is no second copy of the price to drift. Change
 * a price in the database and both move together.
 *
 * ── THE PER-CREDIT LINE ───────────────────────────────────────────────────
 * Worked out here rather than stored, because a stored one is a stored chance to
 * be wrong. It is what makes the bigger packs legible as value instead of just
 * as a bigger number.
 */
export function PackCard({
  pack,
  signedIn,
  ctaLabel,
}: {
  pack: CreditPack;
  signedIn: boolean;
  ctaLabel?: string;
}) {
  const price = Number(pack.price_inr);
  const perCredit = price / pack.credits;
  const features = Array.isArray(pack.features) ? (pack.features as string[]) : [];

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-lg p-6",
        pack.featured
          ? "border-2 border-teal-500 bg-surface shadow-[0_2px_4px_rgba(14,33,49,0.04),0_28px_60px_-34px_rgba(15,156,136,0.45)]"
          : "border border-hairline bg-surface",
      )}
    >
      {pack.featured && (
        <span className="absolute -top-3 left-6 inline-flex items-center rounded-full bg-teal-500 px-3 py-1 text-micro font-semibold uppercase tracking-[0.08em] text-white">
          Most popular
        </span>
      )}

      <h3 className="font-display text-h4 font-semibold text-ink-900">{pack.name}</h3>
      {pack.tagline && <p className="mt-1.5 text-small text-ink-500">{pack.tagline}</p>}

      <div className="mt-6 flex items-end gap-1.5">
        <span className="font-display text-display font-semibold leading-none text-ink-900">
          ₹{price.toLocaleString("en-IN")}
        </span>
        <span className="mb-1 text-small text-ink-400">one-time</span>
      </div>
      <p className="mt-1.5 text-micro text-ink-400">
        ₹{perCredit.toFixed(2)} per credit · GST included
      </p>

      <ul className="mt-6 flex flex-col gap-2.5">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-small text-ink-600">
            <span className="mt-0.5 shrink-0 text-teal-600">
              <Icon name="check" size={16} />
            </span>
            {feature}
          </li>
        ))}
      </ul>

      <div className="mt-7">
        <BuyPackButton
          slug={pack.slug}
          signedIn={signedIn}
          variant={pack.featured ? "primary" : "secondary"}
          label={ctaLabel ?? `Get ${pack.credits} credits`}
        />
      </div>
    </div>
  );
}
