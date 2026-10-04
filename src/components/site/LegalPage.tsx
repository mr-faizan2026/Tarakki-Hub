import type { ReactNode } from "react";
import { Nav } from "@/components/site/Nav";
import { Footer } from "@/components/site/Footer";
import { Container } from "@/components/ui/Container";

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  THE SHARED SHELL FOR A PUBLISHED POLICY
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Terms, refund and shipping all render the same furniture: the site nav, a
 *  "Legal" eyebrow, a title, a last-updated line, an on-this-page index and the
 *  footer. Three copies of that is three places for them to drift apart, and a
 *  payment aggregator reading all three in one sitting notices.
 *
 *  ── WHY /privacy DOES NOT USE THIS ────────────────────────────────────────
 *  It predates it, it carries data tables this shell has no notion of, and it is
 *  the canonical text the Chrome Web Store listing is filled in from — see the
 *  header of src/app/privacy/page.tsx. Rewriting a working, submitted policy to
 *  save a few lines of layout is a bad trade. If it is ever revised for other
 *  reasons, it can move onto this then.
 *
 *  ── THE INDEX IS BUILT FROM THE SAME ARRAY THAT RENDERS THE SECTIONS ──────
 *  Not hand-maintained beside it. A table of contents that lists a section the
 *  page no longer has is the classic policy-page bug, and the only reliable fix
 *  is to make it impossible: pass `sections` and the shell renders both.
 */

export type LegalSection = {
  /** Anchor id — stable, because people link to clauses. */
  id: string;
  /**
   * Plain text, rendered into both the heading and the index.
   *
   * Write real characters, never HTML entities: JSX decodes "&ldquo;" in an
   * attribute but NOT in a string sitting in an object literal, so an entity
   * here ships to the page verbatim. Type the “ ” — ’ you actually want.
   */
  title: string;
  body: ReactNode;
};

export function LegalPage({
  title,
  lastUpdated,
  intro,
  sections,
}: {
  title: string;
  lastUpdated: string;
  /** One line under the title, before the index. */
  intro?: ReactNode;
  sections: LegalSection[];
}) {
  return (
    <>
      <Nav />
      <main id="main" className="bg-canvas">
        <Container className="py-16 sm:py-20 lg:py-24">
          <div className="max-w-3xl">
            <p className="label-mono text-ink-500">Legal</p>
            <h1 className="mt-3 font-display text-h2 font-semibold tracking-[-0.02em] text-ink-900">
              {title}
            </h1>
            <p className="mt-4 text-body text-ink-500">
              Last updated {lastUpdated}.{intro ? <> {intro}</> : null}
            </p>

            <nav
              aria-label="On this page"
              className="mt-10 rounded-xl border border-hairline bg-surface p-5"
            >
              <h2 className="text-micro font-semibold uppercase tracking-[0.12em] text-ink-500">
                On this page
              </h2>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {sections.map((section) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className="text-small text-teal-700 hover:text-teal-800"
                    >
                      {section.title}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="mt-14 flex flex-col gap-12">
              {sections.map((section) => (
                <section key={section.id} id={section.id} className="scroll-mt-24">
                  <h2 className="font-display text-h3 font-semibold tracking-[-0.018em] text-ink-900">
                    {section.title}
                  </h2>
                  <div className="mt-4 flex flex-col gap-4 text-body text-ink-600">
                    {section.body}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </Container>
      </main>
      <Footer />
    </>
  );
}

/** A bulleted list, styled once so the policies cannot disagree about it. */
export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="flex list-disc flex-col gap-2 pl-5 marker:text-ink-300">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

/** A pulled-out clause that a reader must not skim past. */
export function LegalCallout({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-hairline bg-canvas-sunk p-4 text-small">
      {children}
    </p>
  );
}
