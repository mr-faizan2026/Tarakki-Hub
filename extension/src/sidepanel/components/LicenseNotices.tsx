import { currentVersion } from "@/lib/version";
import { Icon, type IconName } from "../ui/Icon";
import { relativeTime } from "./DeviceLimit";

/**
 * The quiet notices — the ones that must not look like errors.
 *
 * All three share one shape and one rule: they inform, they can be dismissed or
 * acted on, and none of them stops the seller doing their work. The loud cases
 * (below min_version, blocked, over the device limit) are whole screens
 * elsewhere, and keeping those two categories visually distinct is the point —
 * an advisory styled like a failure trains sellers to ignore failures.
 */

function Strip({
  icon,
  tone,
  children,
  onDismiss,
  dismissLabel,
}: {
  icon: IconName;
  tone: "info" | "warn";
  children: React.ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
}) {
  const color = tone === "warn" ? "var(--amber-500)" : "var(--teal-600)";
  return (
    <div
      className="row"
      style={{
        gap: 8,
        alignItems: "flex-start",
        padding: "9px 11px",
        border: "1px solid var(--hairline)",
        borderRadius: "var(--radius-lg)",
        background: "var(--surface)",
      }}
    >
      <span style={{ color, flexShrink: 0, marginTop: 1 }}>
        <Icon name={icon} size={15} />
      </span>
      <div className="hint" style={{ minWidth: 0, flex: 1 }}>
        {children}
      </div>
      {onDismiss ? (
        <button
          type="button"
          className="btn btn-ghost btn--sm"
          onClick={onDismiss}
          aria-label={dismissLabel ?? "Dismiss"}
          style={{ padding: "0 5px", flexShrink: 0 }}
        >
          <Icon name="close" size={13} />
        </button>
      ) : null}
    </div>
  );
}

/**
 * A newer version is published and this one still works fine.
 *
 * No steps and no urgency on purpose: Chrome will install it on its own, usually
 * within a few hours, and the background applies a ready update as soon as nothing
 * is running. Telling a seller to go and do something they do not need to do is
 * how a notice becomes noise.
 */
export function UpdateAvailable({ latest }: { latest: string }) {
  return (
    <Strip icon="refresh" tone="info">
      TarakkiHub {latest} is out — Chrome installs it automatically.
    </Strip>
  );
}

/**
 * Shown once after an update. The content is deliberately about what the SELLER
 * can now do differently, not a changelog: a version number and a list of internal
 * work is something only we care about.
 */
export function WhatsNew({ onDismiss }: { onDismiss: () => void }) {
  return (
    <Strip
      icon="spark"
      tone="info"
      onDismiss={onDismiss}
      dismissLabel="Dismiss what's new"
    >
      <strong style={{ color: "var(--ink-800)" }}>
        Updated to {currentVersion()}.
      </strong>{" "}
      Meesho changes now get fixed without a reinstall, and your computers are listed
      under the menu.
    </Strip>
  );
}

/**
 * The licence hasn't been confirmed in a long time.
 *
 * ── WHY THIS IS A NOTE AND NOT A LOCK ─────────────────────────────────────
 * Because the things it would protect are not protected here. Spending a credit
 * is checked server-side; reading an autofill profile is checked by RLS. An
 * offline extension cannot do either, whatever this panel believes. So the honest
 * move is to say when we last checked and let the seller carry on — locking them
 * out of their own catalog because a shop's connection dropped would be a worse
 * product and no more secure.
 */
export function StaleLicense({
  checkedAt,
  problem,
  onRefresh,
}: {
  checkedAt: number | null;
  problem: string | null;
  onRefresh: () => void;
}) {
  return (
    <Strip icon="alert" tone="warn">
      {problem ?? "Couldn't check your account recently."}{" "}
      {checkedAt
        ? `Last confirmed ${relativeTime(new Date(checkedAt).toISOString())}.`
        : "Not confirmed on this computer yet."}{" "}
      Your tools keep working.{" "}
      <button
        type="button"
        onClick={onRefresh}
        style={{
          background: "none",
          border: 0,
          padding: 0,
          font: "inherit",
          color: "var(--teal-700)",
          cursor: "pointer",
          textDecoration: "underline",
        }}
      >
        Check again
      </button>
    </Strip>
  );
}

/**
 * A feature the admin has paused.
 *
 * It takes the place of the feature's own card rather than appearing next to it —
 * the controls are gone, not merely disabled, because the content script refuses
 * to act on a paused feature anyway and a button that looks live but cannot work
 * is worse than no button.
 */
export function FeaturePaused({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <section className="section" aria-label={`${title} — paused`}>
      <div className="row" style={{ gap: 8, alignItems: "center" }}>
        <span style={{ color: "var(--amber-500)", display: "flex" }}>
          <Icon name="lock" size={16} />
        </span>
        <h2 className="section__title" style={{ margin: 0 }}>
          {title}
        </h2>
        <span className="plan-chip" style={{ marginLeft: "auto" }}>
          Paused
        </span>
      </div>
      <p className="hint" style={{ marginTop: 8 }}>
        {message}
      </p>
    </section>
  );
}
