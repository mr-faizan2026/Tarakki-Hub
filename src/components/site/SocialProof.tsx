import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Stat } from "@/components/ui/Stat";
import { TestimonialCard } from "@/components/ui/Testimonial";
import { Reveal } from "@/components/motion/Reveal";
import { testimonials } from "@/content/testimonials";

export function SocialProof() {
  return (
    <Section id="sellers" tone="canvas" spacing="lg">
      <Container>
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl">
            <Reveal>
              <Eyebrow variant="editorial">
                Sellers doing more, typing less.
              </Eyebrow>
            </Reveal>
            <Reveal delay={0.05}>
              <h2 className="mt-4 font-display text-h2 text-ink-900">
                Real shops. Real hours saved.
              </h2>
            </Reveal>
          </div>

          <Reveal delay={0.1}>
            <div className="grid grid-cols-2 gap-x-10 gap-y-6 sm:grid-cols-3">
              <Stat value={68} suffix="K+" label="listings autofilled" />
              <Stat value={10} suffix=" hrs" label="saved / week per seller" />
              <Stat value={4.8} decimals={1} suffix="/5" label="avg seller rating" />
            </div>
          </Reveal>
        </div>

        {/* Masonry wall — intentionally uneven, textured */}
        <Reveal delay={0.05}>
          <div className="mt-12 gap-4 [column-fill:_balance] sm:columns-2 sm:gap-4 lg:columns-3">
            {testimonials.map((t) => (
              <TestimonialCard key={t.name} t={t} className="mb-4" />
            ))}
          </div>
        </Reveal>
      </Container>
    </Section>
  );
}
