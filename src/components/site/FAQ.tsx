import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Accordion } from "@/components/ui/Accordion";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Reveal } from "@/components/motion/Reveal";
import { faqs } from "@/content/faqs";

export function FAQ() {
  return (
    <Section id="faq" tone="surface" spacing="lg">
      <Container>
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-12">
          {/* Intro */}
          <div className="lg:col-span-5">
            <Reveal>
              <Eyebrow>FAQ</Eyebrow>
            </Reveal>
            <Reveal delay={0.05}>
              <h2 className="mt-5 font-display text-h2 text-ink-900">
                Questions sellers actually ask.
              </h2>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="mt-4 text-lead text-ink-600">
                Straight answers on safety, GST, and how it fits your shop. No
                fine print games.
              </p>
            </Reveal>

            <Reveal delay={0.15}>
              <div className="mt-8 rounded-lg border border-hairline bg-canvas p-5">
                <div className="flex items-center gap-2 text-ink-800">
                  <Icon name="shield" size={20} className="text-teal-600" />
                  <span className="text-small font-semibold">
                    Still unsure? Poochh lo.
                  </span>
                </div>
                <p className="mt-2 text-small text-ink-500">
                  Talk to a real person — in Hindi or English — before you set
                  anything up.
                </p>
                <Button href="/signup" variant="ghost" size="sm" className="mt-3 -ml-2">
                  Chat with support
                  <Icon name="arrowRight" size={16} />
                </Button>
              </div>
            </Reveal>
          </div>

          {/* Accordion */}
          <div className="lg:col-span-7">
            <Reveal delay={0.05}>
              <Accordion items={faqs} />
            </Reveal>
          </div>
        </div>
      </Container>
    </Section>
  );
}
