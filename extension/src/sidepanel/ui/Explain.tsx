import { useState, type ReactNode } from "react";
import { Icon } from "./Icon";

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  THE PANEL'S ONE PLACE FOR PROSE
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  This panel is ~380px wide and every card used to carry a paragraph saying
 *  WHY it behaves the way it does — why a quote mirrors the panel's own pricing
 *  request, why a figure we can't reconcile is hidden, why stickers are a risk.
 *  All of it true, all of it worth saying once; none of it worth three lines of
 *  grey text on every open, which is what it had become. A seller who glances at
 *  this panel forty times a day was reading an essay to find a rupee figure.
 *
 *  So the rule is: the card shows the number, the control and at most one short
 *  line. Everything that answers "but why?" lives behind this.
 *
 *  ── WHY FOLDED AND NOT DELETED ────────────────────────────────────────────
 *  Because the explanations are what make the figures trustworthy. "We quote by
 *  re-asking Meesho your panel's own question" is the whole reason a number here
 *  can be believed, and a seller who wants to know that deserves an answer in
 *  the product rather than in a support reply. Collapsed is cheap; absent is
 *  not.
 *
 *  ── WHAT MUST NOT GO IN HERE ──────────────────────────────────────────────
 *  Anything the seller has to ACT on. A blocker, a QC risk, a figure we refuse
 *  to show — those stay visible as a short line, because text nobody opens is
 *  text nobody reads, and a warning behind a tap is a warning that was not
 *  given. This is for context, never for instructions.
 */
export function Explain({
  label = "Why?",
  children,
}: {
  /** The trigger’s wording. Two or three words — it sits under a title. */
  label?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  /* A block, not a fragment: dropped into one of the panel's flex rows a
     fragment would make the expanded paragraph a sibling flex item squeezed in
     beside its own trigger. */
  return (
    <div className="explain">
      <button
        type="button"
        className={open ? "explain__btn is-open" : "explain__btn"}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={open ? "Hide" : label}
      >
        <Icon name="info" size={12.5} />
        <span>{label}</span>
      </button>
      {open ? <p className="explain__body">{children}</p> : null}
    </div>
  );
}
