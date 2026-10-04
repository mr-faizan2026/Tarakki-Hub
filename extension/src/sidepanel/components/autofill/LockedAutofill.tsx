import { BILLING_URL } from "@/lib/config";
import { Icon } from "../../ui/Icon";

/**
 * The locked state for free, expired and blocked accounts.
 *
 * It is not a bluff. `has_active_plan()` in the database gates every read and
 * write of `autofill_profiles`, so this screen is reporting a decision that has
 * already been made server-side — a tampered extension sees the same empty list.
 *
 * The image generator from Part 1 keeps working on a free plan with the seller's
 * credits; only autofill is plan-only. The copy says so, so nothing feels broken.
 */
export function LockedAutofill({ reason }: { reason?: string | null }) {
  return (
    <section className="section locked">
      <div className="locked__head">
        <div className="section__title" style={{ color: "var(--ink-500)" }}>
          <Icon name="sliders" size={18} />
          Listing autofill
        </div>
        <span className="badge-soon">Paid plans</span>
      </div>

      <p className="hint" style={{ marginTop: 8 }}>
        Fill your next listing in one click. No credits.
      </p>

      {reason ? (
        <p className="hint" style={{ marginTop: 6, color: "var(--ink-600)" }}>
          {reason}
        </p>
      ) : null}

      <a
        className="btn btn-primary btn--block"
        href={BILLING_URL}
        target="_blank"
        rel="noreferrer"
        style={{ marginTop: 12, textDecoration: "none" }}
      >
        <Icon name="arrowRight" size={15} />
        Upgrade to use autofill
      </a>
    </section>
  );
}
