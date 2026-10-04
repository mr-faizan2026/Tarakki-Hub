import { useState } from "react";
import { MEESHO_HOST } from "@/lib/config";
import { Icon, type IconName } from "../ui/Icon";

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  FIRST RUN — three steps, then out of the way
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Shown once, on the first open. Dismissible, and reopenable from the panel menu
 *  (a guide you cannot get back to is a guide you have to remember).
 *
 *  ── WHY THREE STEPS AND NOT A TOUR ────────────────────────────────────────
 *  Only one thing actually blocks a new seller, and it is step 2: nothing in this
 *  panel can do anything until a supplier-panel tab is open and has priced a
 *  listing, because every figure we show is read from that page. Before that the
 *  seller sees empty cards and reasonably assumes the extension is broken. These
 *  steps exist to get them past that, and then to stop talking.
 *
 *  Step 3 is honest about the plan split — autofill is paid, the image tool is
 *  not — because discovering that from a locked card after following a guide feels
 *  like a bait and switch.
 */

type Step = {
  icon: IconName;
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    icon: "check",
    title: "You're signed in",
    body: "Your plan and credits are at the top. Credits are only spent on an image you choose to use.",
  },
  {
    icon: "puzzle",
    title: `Open your ${MEESHO_HOST} tab`,
    body: "Go to Add Single Catalog and enter your selling price, so Meesho draws its price breakdown. Everything here is read from that.",
  },
  {
    icon: "image",
    title: "Try the image optimiser",
    body: "Drop in your product photo and press Generate. Meesho prices each variation live, cheapest first.",
  },
];

export function Onboarding({ onDismiss }: { onDismiss: () => void }) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <section
      className="section"
      aria-labelledby="onboarding-title"
      style={{ borderColor: "var(--teal-200)", background: "var(--teal-50)" }}
    >
      <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
        <span className="eyebrow">
          {step + 1} of {STEPS.length}
        </span>
        <button
          type="button"
          className="btn btn-ghost btn--sm"
          onClick={onDismiss}
          aria-label="Dismiss the getting-started guide"
          style={{ padding: "0 6px" }}
        >
          <Icon name="close" size={15} />
        </button>
      </div>

      <div className="row" style={{ gap: 10, marginTop: 10, alignItems: "flex-start" }}>
        <span style={{ color: "var(--teal-600)", flexShrink: 0, marginTop: 2 }}>
          <Icon name={current.icon} size={20} />
        </span>
        <div style={{ minWidth: 0 }}>
          <h3 id="onboarding-title" style={{ fontSize: 15 }}>
            {current.title}
          </h3>
          <p className="hint" style={{ marginTop: 4 }}>
            {current.body}
          </p>
        </div>
      </div>

      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        {step > 0 ? (
          <button
            type="button"
            className="btn btn-ghost btn--sm"
            onClick={() => setStep((s) => s - 1)}
          >
            Back
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-primary btn--sm"
          style={{ marginLeft: "auto" }}
          onClick={() => (isLast ? onDismiss() : setStep((s) => s + 1))}
        >
          {isLast ? "Got it" : "Next"}
        </button>
      </div>
    </section>
  );
}
