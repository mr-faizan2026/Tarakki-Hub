import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { useAuth } from "./hooks/useAuth";
import { useTabState } from "./hooks/useTabState";
import { usePanelContext } from "./hooks/usePanelContext";
import { useLicense } from "./hooks/useLicense";
import { signOutLocally } from "@/lib/license";
import { sendToBackground } from "@/lib/messages";
import { Header } from "./components/Header";
import { StatusPill } from "./components/StatusPill";
import { SignIn } from "./components/SignIn";
import { Blocked } from "./components/Blocked";
import { LiveShipping } from "./components/LiveShipping";
import { UpdateRequired } from "./components/UpdateRequired";
import { DeviceLimit } from "./components/DeviceLimit";
import { Onboarding } from "./components/Onboarding";
import { PanelMenu } from "./components/PanelMenu";
import {
  FeaturePaused,
  StaleLicense,
  UpdateAvailable,
  WhatsNew,
} from "./components/LicenseNotices";

/**
 * ── THE TWO LAZY CHUNKS, AND WHY ──────────────────────────────────────────
 * These two subtrees carry everything heavy in the panel: the canvas compositor,
 * bounding-box detection, the variant recipes, the sticker art loader, and the
 * whole autofill editor. None of it is needed to render the panel's first frame —
 * header, status pill, live shipping — and the side panel is opened dozens of
 * times a day for a five-second glance at a rupee figure.
 *
 * Splitting them keeps that glance instant. The chunks are bundled inside the
 * extension and load from local disk, so the skeleton below is visible for a frame
 * or two rather than for a round trip.
 */
const ImageGenerator = lazy(() =>
  import("./components/ImageGenerator").then((m) => ({ default: m.ImageGenerator })),
);
const AutofillSection = lazy(() =>
  import("./components/autofill/AutofillSection").then((m) => ({
    default: m.AutofillSection,
  })),
);

/** Card-shaped placeholder, so the layout does not jump when a chunk lands. */
function SectionSkeleton({ label }: { label: string }) {
  return (
    <section className="section" aria-busy="true" aria-label={`${label} — loading`}>
      <h2 className="section__title">{label}</h2>
    </section>
  );
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  SIDE PANEL ROOT — which surface, and in what order
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  The order of the gates below is the design, not an accident:
 *
 *    1. loading            — one frame, from the cache.
 *    2. must_update        — BEFORE the sign-in form. A build below min_version is
 *                            one that can show a figure contradicting the seller's
 *                            own panel, and that is not something to let through
 *                            just because nobody has signed in yet. It is also why
 *                            /api/extension/config is public: this screen has to
 *                            work without a session.
 *    3. sign in            — with the reason, if we signed them out ourselves.
 *    4. blocked            — the admin has blocked the account.
 *    5. device_limit       — too many installs; the seller prunes one.
 *    6. the working panel  — header · notices · status · shipping · images · autofill.
 *
 *  ── THE PANEL-PRICING CONTEXT LIVES HERE ──────────────────────────────────
 *  Two cards answer from it and they must answer the same way. When the image
 *  generator owned it, the shipping card above knew only what was printed on the
 *  page: it announced "Shipping not detected on this screen" while the generator
 *  underneath was happily mirroring a perfectly good captured figure, and the
 *  seller had two cards disagreeing about whether the feature could run.
 *
 *  ── KILL SWITCHES REPLACE CARDS, THEY DO NOT DISABLE THEM ─────────────────
 *  A paused feature's controls are gone, not greyed out, because the content
 *  script refuses to act on a paused feature anyway — a button that looks live and
 *  cannot work is worse than no button.
 */
export function App() {
  const auth = useAuth();
  const { state: tab, rereadShipping, applyImage } = useTabState();

  const signedIn = !auth.loading && !!auth.account;
  const license = useLicense(signedIn);

  // A local override so a mid-session block (surfaced by the credit endpoint)
  // flips the UI immediately without waiting for a profile refetch.
  const [blockedOverride, setBlockedOverride] = useState(false);
  // Quoting keeps the Meesho tab busy, so the generator pauses the poll while a
  // run is going. It reports that up rather than owning the hook.
  const [quoting, setQuoting] = useState(false);
  /** An involuntary sign-out discovered mid-action, before the next heartbeat. */
  const [forcedSignOut, setForcedSignOut] = useState<string | null>(null);

  const blocked = !!auth.account?.blocked || blockedOverride;
  const updateRequired = license.gate.kind === "must_update";

  // Nothing above the working panel reads this, and a sign-in screen has no
  // business polling the seller's Meesho tab every five seconds.
  const working =
    signedIn && !blocked && !updateRequired && license.gate.kind === "ok";
  const panel = usePanelContext(tab.meeshoTabId, tab.contentReady, quoting || !working);

  /**
   * Send whatever health events the content scripts queued while the panel was
   * closed. Done on open because the panel opening is the one moment we know the
   * worker is awake AND a session exists — an alarm tick has neither guarantee.
   */
  useEffect(() => {
    if (!working) return;
    void sendToBackground({ type: "FLUSH_HEALTH" }).catch(() => {});
  }, [working]);

  /**
   * Signed out from another computer, discovered by a credit call rather than by a
   * heartbeat. Sign out locally with the reason so the sign-in screen can explain
   * it, exactly as the heartbeat path would have.
   */
  const onSignedOutElsewhere = useCallback((message: string) => {
    setForcedSignOut(message);
    void signOutLocally({ at: Date.now(), kind: "device_revoked", message });
  }, []);

  /**
   * Wait for BOTH, not either.
   *
   * `&&` here would render the sign-in form for the frame or two it takes
   * chrome.storage to hand back the session — a seller glancing at the panel
   * would see "Sign in" flash on every single open, which reads as having been
   * signed out. Both reads are local and resolve in a few milliseconds.
   */
  if (auth.loading || license.gate.kind === "loading") {
    return <div className="center-note">Loading…</div>;
  }

  if (updateRequired && license.gate.kind === "must_update") {
    return <UpdateRequired minVersion={license.gate.minVersion} />;
  }

  if (!auth.account) {
    return (
      <SignIn
        onSignIn={auth.signIn}
        reason={license.signOutReason?.message ?? forcedSignOut}
      />
    );
  }

  if (blocked) {
    return <Blocked onSignOut={auth.signOut} />;
  }

  if (license.gate.kind === "device_limit") {
    return (
      <DeviceLimit
        limit={license.gate.limit}
        devices={license.gate.devices}
        onSignOutDevice={license.signOutDevice}
        onSignOut={auth.signOut}
      />
    );
  }

  const features = license.features;

  return (
    <div className="app">
      <Header
        account={auth.account}
        onSignOut={auth.signOut}
        menu={
          <PanelMenu
            devices={license.license?.devices ?? []}
            deviceLimit={license.license?.deviceLimit ?? 1}
            onReopenGuide={license.reopenOnboarding}
            onSignOutDevice={license.signOutDevice}
            onSignOut={auth.signOut}
          />
        }
      />
      <div className="app__body">
        {license.showOnboarding ? (
          <Onboarding onDismiss={license.dismissOnboarding} />
        ) : null}
        {license.showWhatsNew ? <WhatsNew onDismiss={license.dismissWhatsNew} /> : null}
        {license.updateAvailable ? (
          <UpdateAvailable latest={license.updateAvailable} />
        ) : null}
        {license.stale ? (
          <StaleLicense
            checkedAt={license.checkedAt}
            problem={license.problem}
            onRefresh={() => void license.refresh()}
          />
        ) : null}

        <StatusPill tab={tab} panel={panel.context} />

        {features.live_shipping.enabled ? (
          <LiveShipping tab={tab} panel={panel.context} onReread={rereadShipping} />
        ) : (
          <FeaturePaused
            title="Live shipping"
            message={features.live_shipping.message}
          />
        )}

        {features.image_generator.enabled ? (
          <Suspense fallback={<SectionSkeleton label="Low-shipping images" />}>
            <ImageGenerator
              account={auth.account}
              tab={tab}
              panel={panel}
              onQuotingChange={setQuoting}
              applyImage={applyImage}
              onUsage={auth.applyUsage}
              onBlocked={() => setBlockedOverride(true)}
              onSignedOut={onSignedOutElsewhere}
            />
          </Suspense>
        ) : (
          <FeaturePaused
            title="Low-shipping images"
            message={features.image_generator.message}
          />
        )}

        {features.autofill.enabled ? (
          <Suspense fallback={<SectionSkeleton label="Listing autofill" />}>
            <AutofillSection account={auth.account} tab={tab} />
          </Suspense>
        ) : (
          <FeaturePaused title="Listing autofill" message={features.autofill.message} />
        )}
      </div>
    </div>
  );
}
