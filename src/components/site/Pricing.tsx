"use client";

import { useState } from "react";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { PricingCard } from "@/components/ui/PricingCard";
import { Reveal } from "@/components/motion/Reveal";
import { pricingTiers } from "@/content/pricing";
import { cn } from "@/lib/cn";

/** Flip to true, fill prices in content/pricing.ts, and wire the CTAs to go live. */
const PRICING_LIVE = false;

type Billing = "monthly" | "yearly";

export function Pricing() {
  const [billing, setBilling] = useState<Billing>("monthly");

  return (
    <Section id="pricing" tone="canvas" spacing="lg">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <Reveal className="flex justify-center">
            <Eyebrow>Pricing</Eyebrow>
          </Reveal>
          <Reveal delay={0.05}>
            <h2 className="mt-5 font-display text-h2 text-ink-900">
              Start free. Pay when it pays you back.
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-4 text-lead text-ink-600">
              {PRICING_LIVE
                ? "Simple plans that scale with your shop."
                : "Full pricing is launching soon. Start free today — early sellers keep founder pricing when paid plans go live."}
            </p>
          </Reveal>

          {/* Billing toggle (functional UI; checkout wires up later) */}
          <Reveal delay={0.12} className="mt-8 flex justify-center">
            <div
              className="inline-flex items-center gap-1 rounded-full border border-hairline bg-surface p-1"
              role="group"
              aria-label="Billing period"
            >
              {(["monthly", "yearly"] as Billing[]).map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBilling(b)}
                  aria-pressed={billing === b}
                  className={cn(
                    "relative rounded-full px-4 py-1.5 text-small font-medium transition-colors",
                    billing === b
                      ? "bg-ink-900 text-white"
                      : "text-ink-500 hover:text-ink-800",
                  )}
                >
                  {b === "monthly" ? "Monthly" : "Yearly"}
                  {b === "yearly" && (
                    <span
                      className={cn(
                        "ml-1.5 rounded-full px-1.5 py-0.5 text-[0.6rem] font-semibold",
                        billing === "yearly"
                          ? "bg-teal-500 text-white"
                          : "bg-teal-50 text-teal-700",
                      )}
                    >
                      2 months free
                    </span>
                  )}
                </button>
              ))}
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.08}>
          <div className="mx-auto mt-14 grid max-w-5xl grid-cols-1 items-start gap-5 md:grid-cols-3">
            {pricingTiers.map((tier) => (
              <PricingCard key={tier.id} tier={tier} billing={billing} />
            ))}
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <p className="mx-auto mt-8 max-w-xl text-center text-small text-ink-400">
            No card needed to start. Cancel anytime. GST invoice on every paid
            plan. Prices in ₹ for Indian sellers.
          </p>
        </Reveal>
      </Container>
    </Section>
  );
}
