import { Container } from "@/components/ui/Container";
import { Icon } from "@/components/ui/Icon";
import { Reveal } from "@/components/motion/Reveal";

export function FinalCTA() {
  return (
    <section id="start" className="relative overflow-hidden bg-teal-800 py-24 text-white sm:py-32">
      {/* dotted texture */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(rgba(255,255,255,0.18)_1px,transparent_1px)] [background-size:24px_24px]"
      />
      {/* hairline frame detail, top */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/15"
      />

      <Container className="relative">
        <div className="mx-auto max-w-2xl text-center">
          <Reveal>
            <p className="font-serif text-lead italic text-teal-100">
              Bas ek click. Done.
            </p>
          </Reveal>
          <Reveal delay={0.05}>
            <h2 className="mt-4 font-display text-h2 text-white">
              Your listings, done in seconds.
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mx-auto mt-5 max-w-xl text-lead text-teal-50/90">
              Add Tarakki Hub, save your first template, and never re-type a
              catalog again. Start free — no card, no setup fee.
            </p>
          </Reveal>

          <Reveal delay={0.15}>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href="/signup"
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-white px-6 text-body font-semibold text-teal-800 transition-transform duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-px hover:bg-teal-50 active:translate-y-0 sm:w-auto"
              >
                Start free
                <Icon name="arrowRight" size={18} />
              </a>
              <a
                href="/signup"
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md border border-white/30 px-6 text-body font-medium text-white transition-colors duration-150 hover:border-white/60 hover:bg-white/5 sm:w-auto"
              >
                Add to Chrome
              </a>
            </div>
          </Reveal>

          <Reveal delay={0.2}>
            <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-small text-teal-100">
              {["Free to start", "No card needed", "Works in your panel"].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <Icon name="check" size={15} strokeWidth={2.2} className="text-teal-200" />
                  {t}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
