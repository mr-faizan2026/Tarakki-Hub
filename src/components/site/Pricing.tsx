import { createClient } from "@/lib/supabase/server";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Reveal } from "@/components/motion/Reveal";
import { PackCard } from "@/components/billing/PackCard";
import { STARTER_CREDITS } from "@/lib/config";
import type { CreditPack } from "@/lib/supabase/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  PRICING — credit packs, read from the database
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  ── WHY THIS IS NO LONGER A CLIENT COMPONENT ──────────────────────────────
 *  It used to be one, for a monthly/yearly toggle over a hard-coded tier list.
 *  The product does not sell subscriptions — it sells one-time credit packs — so
 *  there is no billing period to toggle, and the only thing left to do was read
 *  four rows. A server component does that without shipping the list, or a
 *  second copy of the prices, to the browser. The old scaffolding (content/
 *  pricing.ts, ui/PricingCard, billing/PlanCard) was deleted rather than left
 *  behind: a dead price list is one somebody edits and then wonders why the
 *  page did not change.
 *
 *  ── THE PRICES ARE NOT IN THIS FILE, AND THAT IS THE POINT ────────────────
 *  They are in `credit_packs`, which is also what /api/checkout charges from.
 *  One row per pack, read by both. A price written in the page and a price
 *  written in the checkout WILL eventually disagree, and the version the buyer
 *  sees is the one they will hold you to.
 *
 *  ── RENDERS FOR SIGNED-OUT VISITORS ───────────────────────────────────────
 *  Which is most of this page's traffic. `credit_packs` has a public read policy
 *  for exactly this; `signedIn` only decides whether the button starts a
 *  checkout or sends them to sign up first.
 */
export async function Pricing() {
  const supabase = await createClient();

  const [{ data }, { data: auth }] = await Promise.all([
    supabase
      .from("credit_packs")
      .select("*")
      .eq("active", true)
      .order("sort_order", { ascending: true }),
    supabase.auth.getUser(),
  ]);

  const packs = (data ?? []) as CreditPack[];
  const signedIn = !!auth?.user;

  return (
    <Section id="pricing" tone="canvas" spacing="lg">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <Reveal className="flex justify-center">
            <Eyebrow>Pricing</Eyebrow>
          </Reveal>
          <Reveal delay={0.05}>
            <h2 className="mt-5 font-display text-h2 text-ink-900">
              Pay once. Use the credits when you list.
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-4 text-lead text-ink-600">
              No subscription and no auto-debit. Buy a pack of credits, spend one
              only when you use an image that beats your own photo&rsquo;s shipping.
            </p>
          </Reveal>
        </div>

        {packs.length === 0 ? (
          /* Only reachable before 0005_billing.sql has been run. Says what is
             wrong rather than rendering an empty grid that looks like a bug. */
          <Reveal delay={0.08}>
            <p className="mx-auto mt-12 max-w-md rounded-lg border border-hairline bg-surface p-5 text-center text-small text-ink-500">
              Packs aren&rsquo;t set up yet. Run the <code>0005_billing.sql</code>{" "}
              migration to seed them.
            </p>
          </Reveal>
        ) : (
          <Reveal delay={0.08}>
            <div className="mx-auto mt-14 grid max-w-6xl grid-cols-1 items-start gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {packs.map((pack) => (
                <PackCard key={pack.id} pack={pack} signedIn={signedIn} />
              ))}
            </div>
          </Reveal>
        )}

        <Reveal delay={0.1}>
          <p className="mx-auto mt-8 max-w-xl text-center text-small text-ink-400">
            Start with {STARTER_CREDITS} free credits — no card needed. All prices in
            ₹ and include GST. Credits are valid for the days shown on each pack.
          </p>
        </Reveal>
      </Container>
    </Section>
  );
}
