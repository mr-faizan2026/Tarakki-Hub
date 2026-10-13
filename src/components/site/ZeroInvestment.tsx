import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Reveal } from "@/components/motion/Reveal";
import { ECOM_TOOLS_URL } from "@/lib/config";

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  THE OTHER TARAKKI HUB PRODUCT — dropshipping, at ecomtools.tarakkihub.com
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  A separate application under the same brand: courier integrations, bulk
 *  order booking, a prepaid wallet, COD payouts. "Zero investment" is the
 *  dropshipping pitch — you sell without buying stock first.
 *
 *  ── WHY IT SITS AFTER THE FINAL CTA AND NOT IN THE HERO ───────────────────
 *  Every pixel above the final CTA is working on one job: turn a visitor into
 *  someone who installs the extension and buys credits. A link to a DIFFERENT
 *  product placed in that stretch competes with that job and sends warm traffic
 *  to another funnel mid-pitch.
 *
 *  Below the final CTA the arithmetic reverses. A visitor who has read the whole
 *  page and still not clicked "Start free" is, by definition, someone the main
 *  pitch did not land for — and dropshipping is a genuinely different answer for
 *  a seller who has no stock to list yet. They are the right audience for this,
 *  and they are the only ones who see it.
 *
 *  ── AND WHY IT IS A SECONDARY BUTTON ──────────────────────────────────────
 *  Same reasoning in one visual decision. Outlined, not filled: on a page with
 *  one primary action, a second filled button just splits attention. The
 *  reference design was an outlined button too.
 *
 *  Opens in a new tab on purpose — it is a different application, and someone
 *  browsing it out of curiosity should still have this page to come back to.
 */
export function ZeroInvestment() {
  return (
    <Section tone="sunk" spacing="sm">
      <Container>
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 text-center">
          <Reveal className="flex justify-center">
            <Eyebrow>Also from Tarakki Hub</Eyebrow>
          </Reveal>

          <Reveal delay={0.05}>
            <h2 className="font-display text-h3 font-semibold tracking-[-0.018em] text-ink-900">
              No stock? Start with zero investment.
            </h2>
          </Reveal>

          <Reveal delay={0.1}>
            <p className="max-w-xl text-body text-ink-500">
              Our dropshipping portal books couriers, uploads orders in bulk and
              handles COD payouts — so you can sell without buying inventory first.
            </p>
          </Reveal>

          <Reveal delay={0.15} className="flex flex-col items-center gap-2">
            <Button
              href={ECOM_TOOLS_URL}
              target="_blank"
              rel="noreferrer"
              variant="secondary"
              size="lg"
            >
              Zero Investment Tool
              <Icon name="arrowRight" size={18} />
            </Button>
            <span className="text-small text-ink-400">
              Start your business with zero investment
            </span>
          </Reveal>
        </div>
      </Container>
    </Section>
  );
}
