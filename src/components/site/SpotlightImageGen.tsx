import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Icon } from "@/components/ui/Icon";
import { Reveal } from "@/components/motion/Reveal";
import { cn } from "@/lib/cn";

const KURTI_PATH =
  "M52 22 C55 16 65 16 68 22 L92 30 L108 58 L98 68 L82 54 L86 132 C70 140 50 140 34 132 L38 54 L22 68 L12 58 L28 30 Z";

function ProductShot({
  fill,
  className,
}: {
  fill: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 120 150"
      className={cn("h-full w-full", className)}
      aria-hidden
    >
      <path d={KURTI_PATH} fill={fill} />
      {/* placket line + button dots for a little garment detail */}
      <path
        d="M60 24 L60 128"
        stroke="rgba(255,255,255,0.5)"
        strokeWidth="1.4"
      />
      <circle cx="60" cy="46" r="1.6" fill="rgba(255,255,255,0.6)" />
      <circle cx="60" cy="60" r="1.6" fill="rgba(255,255,255,0.6)" />
      <circle cx="60" cy="74" r="1.6" fill="rgba(255,255,255,0.6)" />
    </svg>
  );
}

function ShipTag({
  amount,
  band,
  good,
}: {
  amount: string;
  band: string;
  good?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-micro text-ink-400">{band}</span>
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-micro font-semibold",
          good ? "bg-teal-50 text-teal-700" : "bg-canvas-sunk text-ink-500",
        )}
      >
        <Icon name="rupee" size={11} strokeWidth={2} />
        {amount}
      </span>
    </div>
  );
}

export function SpotlightImageGen() {
  return (
    <Section id="images" tone="surface" spacing="lg">
      <Container>
        <div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-12 lg:gap-12">
          {/* Left — visual (before / after + variations) */}
          <div className="order-2 lg:order-1 lg:col-span-7">
            <Reveal>
              <div className="rounded-lg border border-hairline bg-canvas p-4 sm:p-6">
                <div className="grid grid-cols-2 gap-4">
                  {/* Original */}
                  <figure className="space-y-2.5">
                    <div className="relative aspect-[4/5] overflow-hidden rounded-md border border-hairline bg-canvas-sunk">
                      <div className="absolute left-2 top-2 rounded bg-surface/80 px-1.5 py-0.5 text-micro font-medium text-ink-500">
                        Original
                      </div>
                      {/* off-centre, distracting backdrop */}
                      <div className="absolute -right-4 top-6 h-16 w-16 rounded-full bg-ink-300/25" />
                      <div className="absolute inset-0 flex items-center justify-center p-7">
                        <ProductShot fill="var(--color-ink-400)" className="translate-x-2 scale-90" />
                      </div>
                    </div>
                    <ShipTag band="Shipping band" amount="78" />
                  </figure>

                  {/* Optimized */}
                  <figure className="space-y-2.5">
                    <div className="relative aspect-[4/5] overflow-hidden rounded-md border border-teal-200 bg-white ring-1 ring-teal-100">
                      <div className="absolute left-2 top-2 z-10 inline-flex items-center gap-1 rounded bg-teal-500 px-1.5 py-0.5 text-micro font-semibold text-white">
                        <Icon name="spark" size={10} strokeWidth={2} />
                        Optimized
                      </div>
                      <div className="absolute right-2 top-2 z-10 rounded bg-ink-900 px-1.5 py-0.5 text-[0.55rem] font-medium text-teal-100">
                        Spec-ready
                      </div>
                      <div className="absolute inset-0 flex items-center justify-center p-6">
                        <ProductShot fill="var(--color-teal-600)" />
                      </div>
                    </div>
                    <ShipTag band="Shipping band" amount="64" good />
                  </figure>
                </div>

                {/* delta + variations */}
                <div className="mt-5 flex items-center justify-between rounded-md border border-hairline bg-surface px-4 py-3">
                  <div className="flex items-center gap-2 text-small">
                    <span className="font-semibold text-teal-700">−₹14</span>
                    <span className="text-ink-500">per order, on this catalog</span>
                  </div>
                  <span className="label-mono text-ink-400">4 variations ready</span>
                </div>

                <div className="mt-4 grid grid-cols-4 gap-3">
                  {[
                    { tone: "var(--color-teal-500)", pick: true },
                    { tone: "var(--color-ink-500)", pick: false },
                    { tone: "var(--color-teal-700)", pick: false },
                    { tone: "var(--color-ink-700)", pick: false },
                  ].map((v, i) => (
                    <div
                      key={i}
                      className={cn(
                        "relative aspect-square overflow-hidden rounded border bg-white p-3",
                        v.pick ? "border-teal-400 ring-1 ring-teal-200" : "border-hairline",
                      )}
                    >
                      <ProductShot fill={v.tone} />
                      {v.pick && (
                        <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-teal-500">
                          <Icon name="check" size={9} className="text-white" strokeWidth={2.6} />
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>

          {/* Right — narrative */}
          <div className="order-1 lg:order-2 lg:col-span-5">
            <Reveal>
              <Eyebrow>Cut shipping cost</Eyebrow>
            </Reveal>
            <Reveal delay={0.05}>
              <h2 className="mt-5 font-display text-h2 text-ink-900">
                Better images. Lower shipping band.
              </h2>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="mt-5 text-lead text-ink-600">
                The generator makes clean, spec-correct product images tuned to
                keep your shipping band — and your cost per order — low. Pick a
                variation, review it, done. Chhote saving, har order pe.
              </p>
            </Reveal>
            <Reveal delay={0.15}>
              <div className="mt-8 rounded-md border-l-2 border-teal-400 bg-teal-50/50 py-3 pl-5 pr-4">
                <p className="text-body text-ink-700">
                  &ldquo;₹9,000+ a month bach raha hai after I switched to the
                  optimized images.&rdquo;
                </p>
                <p className="mt-1.5 text-small text-ink-500">
                  Karan Mehta — home &amp; kitchen, Surat
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </Container>
    </Section>
  );
}
