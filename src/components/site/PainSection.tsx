import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Reveal, RevealGroup, RevealItem } from "@/components/motion/Reveal";
import { fadeInLeft } from "@/lib/motion";

const ghosts = [
  { id: "#96", label: "Cotton Kurti — Maroon", w: "w-[70%]" },
  { id: "#97", label: "Cotton Kurti — Green", w: "w-[62%]" },
  { id: "#98", label: "Cotton Kurti — Black", w: "w-[74%]" },
  { id: "#99", label: "Cotton Kurti — Navy", w: "w-[58%]" },
];

export function PainSection() {
  return (
    <Section id="pain" tone="sunk" spacing="lg">
      <Container>
        <div className="grid grid-cols-1 gap-14 lg:grid-cols-12 lg:gap-10">
          {/* Left — the narrative */}
          <div className="lg:col-span-7">
            <Reveal>
              <Eyebrow>The daily grind</Eyebrow>
            </Reveal>

            <Reveal delay={0.05}>
              <h2 className="mt-5 max-w-2xl font-display text-h2 text-ink-900">
                The same listing, typed out a hundred times.
              </h2>
            </Reveal>

            <Reveal delay={0.1}>
              <p className="mt-5 max-w-xl text-lead text-ink-600">
                One kurti. Eight sizes. Five colours. Every field re-typed by
                hand — name, category, GST, HSN, fabric, price. Then the next
                catalog. Then the next. It&apos;s not hard work. It&apos;s just{" "}
                <span className="font-medium text-ink-800">
                  slow, boring, and easy to get wrong.
                </span>
              </p>
            </Reveal>

            {/* The single editorial pull-quote (Fraunces) */}
            <Reveal delay={0.15}>
              <figure className="mt-10 border-l-2 border-teal-400 pl-6">
                <blockquote className="font-serif text-h3 italic leading-snug text-ink-800">
                  &ldquo;Har din do ghante sirf form bharne mein chale jaate
                  the.&rdquo;
                </blockquote>
                <figcaption className="mt-3 text-small text-ink-500">
                  Rizwan A. — menswear seller, Bhiwandi
                </figcaption>
              </figure>
            </Reveal>

            {/* The one amber accent — the cost of the grind */}
            <Reveal delay={0.2}>
              <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
                <div>
                  <div className="font-display text-h2 font-semibold text-amber-600">
                    ~10 hrs
                  </div>
                  <div className="mt-1 text-small text-ink-500">
                    lost every week to re-typing
                  </div>
                </div>
                <span className="hidden h-10 w-px bg-hairline-strong sm:block" />
                <div>
                  <div className="font-display text-h2 font-semibold text-ink-900">
                    1 in 9
                  </div>
                  <div className="mt-1 text-small text-ink-500">
                    listings has a costly typo
                  </div>
                </div>
              </div>
            </Reveal>
          </div>

          {/* Right — the repetition made visible */}
          <div className="lg:col-span-5">
            <RevealGroup className="relative" stagger={0.08}>
              <RevealItem variants={fadeInLeft}>
                <div className="mb-3 flex items-center justify-between">
                  <span className="label-mono text-ink-400">
                    Your listing queue
                  </span>
                  <span className="rounded-full bg-ink-800 px-2 py-0.5 text-micro font-semibold text-teal-100">
                    97 more
                  </span>
                </div>
              </RevealItem>

              <div className="space-y-2.5">
                {ghosts.map((g, i) => (
                  <RevealItem key={g.id} variants={fadeInLeft}>
                    <div
                      className="rounded-md border border-hairline bg-surface p-4"
                      style={{ opacity: 1 - i * 0.16 }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-small font-medium text-ink-700">
                          {g.label}
                        </span>
                        <span className="text-micro text-ink-400">
                          catalog {g.id}
                        </span>
                      </div>
                      <div className="mt-3 space-y-2">
                        <span className={`block h-1.5 rounded-full bg-hairline-strong ${g.w}`} />
                        <span className="block h-1.5 w-[45%] rounded-full bg-hairline-strong" />
                      </div>
                      <div className="mt-3 text-micro text-ink-400">
                        ~6 min by hand
                      </div>
                    </div>
                  </RevealItem>
                ))}
              </div>

              {/* fade-out to imply endless repetition */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-canvas-sunk to-transparent"
              />
            </RevealGroup>
          </div>
        </div>
      </Container>
    </Section>
  );
}
