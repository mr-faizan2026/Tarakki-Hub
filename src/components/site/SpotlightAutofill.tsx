import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { Reveal, RevealGroup, RevealItem } from "@/components/motion/Reveal";
import { AutofillDemo } from "./AutofillDemo";
import { fadeInLeft, fadeRise } from "@/lib/motion";

const points = [
  "Save your listing style once — it becomes a reusable template.",
  "Category, GST, HSN and fabric are smart-mapped for you.",
  "Sizes, colours and prices flow in as variants automatically.",
  "Every catalog lands as a draft. Nothing publishes on its own.",
];

export function SpotlightAutofill() {
  return (
    <Section id="autofill" tone="ink" spacing="lg" className="wash-ink">
      <Container>
        <div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-2 lg:gap-16">
          {/* Left — narrative */}
          <div>
            <Reveal>
              <Eyebrow tone="onDark">The hero feature</Eyebrow>
            </Reveal>
            <Reveal delay={0.05}>
              <h2 className="mt-5 font-display text-h2 text-white">
                One template. Every catalog.{" "}
                <span className="text-teal-300">One click.</span>
              </h2>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="mt-5 max-w-xl text-lead text-ink-300">
                Autofill is the whole point. Set up a catalog the way you like it
                once, and Tarakki Hub fills the next hundred from that template —
                inside your own supplier panel, watching you stay in control.
              </p>
            </Reveal>

            <RevealGroup as="ul" stagger={0.06} className="mt-8 space-y-3.5">
              {points.map((p) => (
                <RevealItem as="li" key={p} variants={fadeInLeft} className="flex gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-500/15 text-teal-300">
                    <Icon name="check" size={13} strokeWidth={2.2} />
                  </span>
                  <span className="text-body text-ink-200">{p}</span>
                </RevealItem>
              ))}
            </RevealGroup>

            <Reveal delay={0.1}>
              <div className="mt-10 flex flex-col gap-6 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-xs text-small text-ink-300">
                  List{" "}
                  <span className="font-semibold text-white">100 catalogs</span>{" "}
                  in the time it used to take you to do one.
                </p>
                <Button href="/signup" variant="secondary" className="shrink-0">
                  Try autofill free
                </Button>
              </div>
            </Reveal>
          </div>

          {/* Right — the live demo, reprised on dark */}
          <Reveal variants={fadeRise}>
            <AutofillDemo className="mx-auto max-w-md" />
          </Reveal>
        </div>
      </Container>
    </Section>
  );
}
