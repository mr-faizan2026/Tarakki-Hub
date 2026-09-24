import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Icon } from "@/components/ui/Icon";
import { Reveal, RevealGroup, RevealItem } from "@/components/motion/Reveal";
import { features, type Feature } from "@/content/features";
import { cn } from "@/lib/cn";

// Deliberate, non-uniform spans. Varied sizes and weights — not a card row.
// The listing tools fill the grid; the image generator anchors a wide block.
const spanById: Record<string, string> = {
  autofill: "sm:col-span-2 lg:col-span-4 lg:row-span-2",
  templates: "lg:col-span-2",
  mapping: "lg:col-span-2",
  bulk: "sm:col-span-2 lg:col-span-3",
  images: "sm:col-span-2 lg:col-span-3",
  draft: "sm:col-span-2 lg:col-span-2",
  shipgen: "sm:col-span-2 lg:col-span-4",
};

const groupDotClass: Record<Feature["group"], string> = {
  "List faster": "bg-teal-500",
  "Cut shipping cost": "bg-ink-500",
};

function GroupTag({ group, onDark }: { group: Feature["group"]; onDark?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-micro font-medium uppercase tracking-[0.1em]",
        onDark ? "text-ink-300" : "text-ink-400",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", groupDotClass[group])} />
      {group}
    </span>
  );
}

function FeaturedVisual() {
  return (
    <div className="mt-6 rounded-md border border-teal-200/70 bg-surface p-3">
      <div className="space-y-2.5">
        {[
          { w: "78%", auto: false },
          { w: "60%", auto: true },
          { w: "48%", auto: true },
        ].map((r, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-teal-500">
              <Icon name="check" size={10} className="text-white" strokeWidth={2.4} />
            </span>
            <span
              className="block h-1.5 rounded-full bg-ink-300"
              style={{ width: r.w }}
            />
            {r.auto && (
              <span className="rounded-full bg-teal-100 px-1.5 py-px text-[0.5rem] font-semibold uppercase tracking-[0.08em] text-teal-700">
                auto
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function FeatureCard({ feature }: { feature: Feature }) {
  const isFeatured = feature.id === "autofill";
  // The image generator anchors its own wide, focused block.
  const isFocus = feature.id === "shipgen";

  return (
    <RevealItem
      className={cn(
        "group flex flex-col rounded-lg p-6 transition-[transform,border-color,background-color] duration-200",
        spanById[feature.id],
        isFeatured
          ? "border border-teal-200 bg-teal-50/60 hover:-translate-y-0.5 hover:border-teal-300"
          : isFocus
            ? "border border-hairline-strong bg-surface hover:-translate-y-0.5 hover:border-teal-200"
            : "border border-hairline bg-surface hover:-translate-y-0.5 hover:border-teal-200",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-md",
            isFeatured || isFocus
              ? "bg-teal-500 text-white"
              : "bg-teal-50 text-teal-700",
          )}
        >
          <Icon name={feature.icon} size={22} />
        </span>
        <GroupTag group={feature.group} />
      </div>

      <h3
        className={cn(
          "mt-5 font-semibold text-ink-900",
          isFeatured ? "text-h3" : "text-h4",
        )}
      >
        {feature.title}
      </h3>
      <p
        className={cn(
          "mt-2 max-w-prose text-ink-600",
          isFeatured ? "text-lead" : "text-body",
        )}
      >
        {feature.body}
      </p>

      {isFeatured && <FeaturedVisual />}
    </RevealItem>
  );
}

export function Features() {
  return (
    <Section id="features" tone="canvas" spacing="lg">
      <Container>
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <Reveal>
              <Eyebrow>The toolkit</Eyebrow>
            </Reveal>
            <Reveal delay={0.05}>
              <h2 className="mt-5 font-display text-h2 text-ink-900">
                One suite for the whole listing job.
              </h2>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="mt-4 text-lead text-ink-600">
                Everything from your first template to bulk-listing hundreds of
                catalogs — grouped around what actually moves your business.
              </p>
            </Reveal>
          </div>

          <Reveal delay={0.12}>
            <ul className="flex flex-wrap gap-x-5 gap-y-2">
              {(["List faster", "Cut shipping cost"] as const).map((g) => (
                <li key={g}>
                  <GroupTag group={g} />
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        <RevealGroup
          stagger={0.05}
          className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:auto-rows-fr lg:grid-cols-6"
        >
          {features.map((f) => (
            <FeatureCard key={f.id} feature={f} />
          ))}
        </RevealGroup>
      </Container>
    </Section>
  );
}
