import type { ReactNode } from "react";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Reveal, RevealGroup, RevealItem } from "@/components/motion/Reveal";

/* --- Crafted mini-visuals (built from primitives, no stock art) --------- */

function VisualTemplate() {
  return (
    <div className="rounded-md border border-hairline bg-canvas p-3">
      <div className="space-y-2">
        <span className="block h-1.5 w-3/4 rounded-full bg-hairline-strong" />
        <span className="block h-1.5 w-1/2 rounded-full bg-hairline-strong" />
        <span className="block h-1.5 w-2/3 rounded-full bg-hairline-strong" />
      </div>
      <div className="mt-3 inline-flex items-center gap-1.5 rounded border border-teal-200 bg-teal-50 px-2 py-1 text-micro font-semibold text-teal-700">
        <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" aria-hidden>
          <path
            d="M3 2h6v8l-3-2-3 2z"
            stroke="currentColor"
            strokeWidth="1.1"
            strokeLinejoin="round"
          />
        </svg>
        Saved as template
      </div>
    </div>
  );
}

function VisualAutofill() {
  return (
    <div className="relative rounded-md border border-hairline bg-canvas p-3">
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="h-3.5 w-3.5 shrink-0 rounded-full bg-teal-500" />
            <span
              className="block h-1.5 rounded-full bg-ink-300"
              style={{ width: `${70 - i * 12}%` }}
            />
          </div>
        ))}
      </div>
      <div className="absolute -bottom-1 right-3 flex items-center gap-1.5 rounded bg-teal-500 px-2 py-1 text-micro font-semibold text-white shadow-sm">
        <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" aria-hidden>
          <path d="M9 1 2.5 9.2H7l-1 5.8L13.5 6.8H9z" fill="white" />
        </svg>
        1 click
      </div>
    </div>
  );
}

function VisualReview() {
  return (
    <div className="rounded-md border border-hairline bg-canvas p-3">
      <div className="flex items-center justify-between">
        <span className="text-micro font-medium text-ink-500">Draft #98</span>
        <span className="inline-flex items-center gap-1 text-micro font-semibold text-teal-700">
          <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" aria-hidden>
            <path
              d="M2.5 6.2 4.8 8.5 9.5 3.5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Checked
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="block h-1.5 w-1/2 rounded-full bg-hairline-strong" />
        <span className="inline-flex h-7 items-center rounded bg-ink-900 px-3 text-micro font-semibold text-white">
          Publish
        </span>
      </div>
    </div>
  );
}

type Step = {
  n: string;
  title: string;
  body: string;
  visual: ReactNode;
};

const steps: Step[] = [
  {
    n: "01",
    title: "Save a template once",
    body: "Fill one listing exactly how you like it — sizes, GST, HSN, fabric, price rules. Save it. That's your template.",
    visual: <VisualTemplate />,
  },
  {
    n: "02",
    title: "Autofill any catalog",
    body: "Open a new catalog in the Supplier Panel. One click, and every field fills itself from your template. No re-typing.",
    visual: <VisualAutofill />,
  },
  {
    n: "03",
    title: "Review, then publish",
    body: "Check the draft, tweak the one variant that's different, hit publish. You stay in control the whole time.",
    visual: <VisualReview />,
  },
];

export function HowItWorks() {
  return (
    <Section id="how" tone="surface" spacing="lg">
      <Container>
        <div className="max-w-2xl">
          <Reveal>
            <Eyebrow>How it works</Eyebrow>
          </Reveal>
          <Reveal delay={0.05}>
            <h2 className="mt-5 font-display text-h2 text-ink-900">
              From one template to a hundred listings.
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-4 text-lead text-ink-600">
              Three steps. Set it up once, then it&apos;s the same click every
              time.
            </p>
          </Reveal>
        </div>

        <RevealGroup
          as="ul"
          stagger={0.12}
          className="relative mt-14 grid gap-y-12 lg:grid-cols-3 lg:gap-x-8 lg:gap-y-0"
        >
          {/* Desktop horizontal rail */}
          <span
            aria-hidden
            className="absolute left-0 right-0 top-7 hidden h-px bg-hairline lg:block"
          />

          {steps.map((step, i) => (
            <RevealItem as="li" key={step.n} className="relative">
              {/* Mobile vertical rail (skip on last) */}
              {i < steps.length - 1 && (
                <span
                  aria-hidden
                  className="absolute bottom-[-3rem] left-7 top-16 w-px bg-hairline lg:hidden"
                />
              )}

              <div className="flex items-start gap-5 lg:block">
                {/* Node */}
                <div className="relative z-10 flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-hairline-strong bg-surface">
                  <span className="font-display text-h4 font-semibold text-ink-900">
                    {step.n}
                  </span>
                  <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-teal-500 ring-2 ring-surface" />
                </div>

                {/* Content */}
                <div className="min-w-0 lg:mt-6">
                  <h3 className="text-h4 font-semibold text-ink-900">
                    {step.title}
                  </h3>
                  <p className="mt-2 max-w-sm text-body text-ink-600">
                    {step.body}
                  </p>
                  <div className="mt-5 max-w-xs">{step.visual}</div>
                </div>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </Container>
    </Section>
  );
}
