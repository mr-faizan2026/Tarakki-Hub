import type { CSSProperties } from "react";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { AutofillDemo } from "./AutofillDemo";

const cities = ["Surat", "Jaipur", "Bhiwandi", "Indore", "Hyderabad", "Ludhiana", "Kanpur"];

/** Small helper for staggered CSS entrance delays. */
const delay = (ms: number): CSSProperties => ({ animationDelay: `${ms}ms` });

export function Hero() {
  return (
    <section
      id="top"
      className="relative overflow-hidden wash-teal pt-28 pb-16 sm:pt-32 sm:pb-20 lg:pb-28"
    >
      {/* faint dotted texture, right side only */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 top-24 hidden h-[420px] w-[46%] bg-dotgrid opacity-60 [mask-image:radial-gradient(70%_70%_at_60%_30%,black,transparent)] lg:block"
      />

      <Container className="relative">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-8">
          {/* Left — copy */}
          <div className="lg:col-span-6">
            <p
              className="rise inline-flex items-center gap-2 rounded-full border border-hairline-strong bg-surface/70 px-3 py-1.5 text-micro font-medium uppercase tracking-[0.1em] text-ink-500"
              style={delay(0)}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
              Works inside your Meesho supplier panel
            </p>

            <h1
              className="rise mt-5 font-display text-display-xl text-ink-900"
              style={delay(70)}
            >
              List your catalog in{" "}
              <span className="text-teal-600">seconds</span>, not hours.
            </h1>

            <p className="rise mt-5 max-w-xl text-lead text-ink-600" style={delay(140)}>
              Save a template once, then autofill any catalog in one click — and
              cut your shipping cost per order with spec-perfect product images.{" "}
              <span className="font-medium text-ink-800">Bas ek click, done.</span>
            </p>

            <div
              className="rise mt-8 flex flex-col gap-3 sm:flex-row sm:items-center"
              style={delay(210)}
            >
              <Button href="/signup" size="lg" className="w-full sm:w-auto">
                Start free
              </Button>
              <Button
                href="/signup"
                variant="secondary"
                size="lg"
                className="w-full sm:w-auto"
              >
                <ChromeGlyph />
                Add to Chrome
              </Button>
            </div>

            {/* trust strip */}
            <ul
              className="rise mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-small text-ink-500"
              style={delay(280)}
            >
              {[
                "No password sharing",
                "Review before publish",
                "Made for Indian sellers",
              ].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <svg viewBox="0 0 14 14" className="h-3.5 w-3.5 shrink-0" aria-hidden>
                    <path
                      d="M2.8 7.2 5.6 10 11 3.6"
                      stroke="var(--color-teal-600)"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  </svg>
                  {t}
                </li>
              ))}
            </ul>
          </div>

          {/* Right — live demo */}
          <div className="rise lg:col-span-6 lg:col-start-7" style={delay(180)}>
            <AutofillDemo className="mx-auto max-w-md lg:mr-0 lg:ml-auto" />
          </div>
        </div>

        {/* city strip */}
        <div className="rise mt-14 flex flex-col gap-3 border-t border-hairline pt-6 sm:mt-20 sm:flex-row sm:items-center sm:justify-between" style={delay(420)}>
          <p className="label-mono text-ink-400">Sellers already listing faster in</p>
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
            {cities.map((c) => (
              <li key={c} className="text-small font-medium text-ink-500">
                {c}
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  );
}

function ChromeGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 text-ink-500" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="8" cy="8" r="2.4" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8 1.6v4M13.5 5.2 9.4 7M2.5 5.2 6.6 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
