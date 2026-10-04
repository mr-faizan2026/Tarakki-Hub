import { useCallback, useEffect, useRef, useState } from "react";
import { LICENSE_FRESH_MS, LICENSE_STALE_MS } from "@/lib/config";
import { failureMessage } from "@/lib/backend";
import {
  heartbeat,
  isFresh,
  registerDevice,
  revokeDevice,
  takeSignOutReason,
} from "@/lib/license";
import { sendToBackground } from "@/lib/messages";
import {
  featureState,
  type FeatureId,
  type FeatureState,
} from "@/lib/kill-switches";
import {
  KEYS,
  read,
  readMany,
  watch,
  write,
  type LicenseState,
  type SignOutReason,
  type VersionGates,
} from "@/lib/storage";
import { compareVersions, currentVersion, isBelow } from "@/lib/version";
import type { ExtensionDeviceInfo, KillSwitchMap } from "@/lib/backend-types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  useLicense — everything the panel needs to decide WHAT TO RENDER
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  It answers five questions, in the order the panel asks them:
 *
 *    1. Is this build too old to run at all?        → `mustUpdate`
 *    2. Is the account blocked?                     → `blocked`
 *    3. Is this install over the device limit?       → `deviceLimit`
 *    4. Which features has the admin paused?         → `features`
 *    5. Is there an update, or a first run, or a new version to mention?
 *
 *  ── RENDER FROM CACHE, THEN CONFIRM ───────────────────────────────────────
 *  The first paint comes from chrome.storage, not from the network. A side panel
 *  that shows a spinner for 400ms on every open — which is every time a seller
 *  glances at it — feels broken in a way that no amount of correctness fixes. So
 *  the cached licence renders immediately and a heartbeat confirms it behind.
 *
 *  ── STALE IS SHOWN, NOT ENFORCED ──────────────────────────────────────────
 *  When the last confirmation is older than LICENSE_STALE_MS the panel SAYS so
 *  and keeps working. It does not lock the seller out, because:
 *    • a dead network is not a licence problem, and
 *    • the gates that actually decide anything are server-side — RLS on
 *      autofill_profiles, the device check inside consume_credit_for. An offline
 *      extension cannot spend a credit or read a profile no matter what this hook
 *      believes.
 *  An extension that bricks itself on a café Wi-Fi is worse than one that keeps
 *  working on yesterday's answer.
 *
 *  ── WHY STORAGE IS THE CHANNEL ────────────────────────────────────────────
 *  The background's alarm heartbeat writes the same keys this hook watches, so a
 *  revocation found while the panel was closed is on screen the moment it opens,
 *  and one found while it is open arrives without any message plumbing between
 *  the two contexts.
 */

export type LicenseGate =
  /** Still reading the cache — one frame, usually. */
  | { kind: "loading" }
  /** Below min_version. Nothing else may run. */
  | { kind: "must_update"; minVersion: string }
  /** Over the device limit; the seller must sign one out. */
  | { kind: "device_limit"; limit: number; devices: ExtensionDeviceInfo[] }
  /** Cleared to work. */
  | { kind: "ok" };

export type LicenseApi = {
  gate: LicenseGate;
  license: LicenseState | null;
  /** True when the last confirmed check is older than LICENSE_STALE_MS. */
  stale: boolean;
  /** When the licence was last confirmed, for the "checked X ago" line. */
  checkedAt: number | null;
  /** A transport problem from the most recent attempt, if it failed. */
  problem: string | null;
  features: Record<FeatureId, FeatureState>;
  /** A newer version is published, but this one still works. */
  updateAvailable: string | null;
  /** First run: show the three-step guide. */
  showOnboarding: boolean;
  /** Just updated: show the one-time "what's new" note. */
  showWhatsNew: boolean;
  /** Why we signed the seller out, shown once on the sign-in screen. */
  signOutReason: SignOutReason | null;
  dismissOnboarding: () => void;
  reopenOnboarding: () => void;
  dismissWhatsNew: () => void;
  /** Sign one device out, then retry registration. */
  signOutDevice: (deviceId: string) => Promise<string | null>;
  /** Re-check now — the manual escape hatch from a failed check. */
  refresh: () => Promise<void>;
};

const ALL_ON: Record<FeatureId, FeatureState> = {
  live_shipping: { enabled: true, message: "" },
  image_generator: { enabled: true, message: "" },
  autofill: { enabled: true, message: "" },
};

function toFeatures(map: KillSwitchMap): Record<FeatureId, FeatureState> {
  return {
    live_shipping: featureState(map, "live_shipping"),
    image_generator: featureState(map, "image_generator"),
    autofill: featureState(map, "autofill"),
  };
}

/**
 * `signedIn` gates the licensed half: with no session there is nobody to register
 * or heartbeat for, but the version gate and the kill switches still apply — which
 * is exactly why those two come from the public config endpoint.
 */
export function useLicense(signedIn: boolean): LicenseApi {
  const version = currentVersion();

  const [license, setLicense] = useState<LicenseState | null>(null);
  const [gates, setGates] = useState<VersionGates | null>(null);
  const [features, setFeatures] = useState(ALL_ON);
  const [deviceLimit, setDeviceLimit] = useState<{
    limit: number;
    devices: ExtensionDeviceInfo[];
  } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboardingDone, setOnboardingDone] = useState(true);
  const [whatsNewSeen, setWhatsNewSeen] = useState<string | null>(version);
  const [signOutReason, setSignOutReason] = useState<SignOutReason | null>(null);

  /** Guards against two confirm passes racing on a fast remount. */
  const confirming = useRef(false);

  /* ─── first paint: everything from the cache, in one round trip ───────── */

  useEffect(() => {
    let active = true;
    void (async () => {
      const cached = await readMany([
        KEYS.license,
        KEYS.versionGates,
        KEYS.killSwitches,
        KEYS.onboardingDone,
        KEYS.whatsNewSeen,
      ]);
      if (!active) return;
      setLicense(cached[KEYS.license]);
      setGates(cached[KEYS.versionGates]);
      setFeatures(toFeatures(cached[KEYS.killSwitches]));
      setOnboardingDone(cached[KEYS.onboardingDone]);
      setWhatsNewSeen(cached[KEYS.whatsNewSeen]);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  /* ─── the sign-out reason, read once and consumed ─────────────────────── */

  useEffect(() => {
    if (signedIn) {
      // A fresh sign-in makes the previous reason history; keeping it would show
      // "you were signed out" to someone who has just signed back in.
      setSignOutReason(null);
      return;
    }
    // Signing out clears the device-limit verdict and any transport complaint:
    // they belong to the account that just left. Carrying them over would greet
    // the next seller with the previous one's device list.
    setDeviceLimit(null);
    setProblem(null);
    let active = true;
    void takeSignOutReason().then((reason) => active && setSignOutReason(reason));
    return () => {
      active = false;
    };
  }, [signedIn]);

  /* ─── live updates from the background's own heartbeat ────────────────── */

  useEffect(() => {
    const stops = [
      watch(KEYS.license, setLicense),
      watch(KEYS.versionGates, setGates),
      watch(KEYS.killSwitches, (map) => setFeatures(toFeatures(map))),
      watch(KEYS.whatsNewSeen, setWhatsNewSeen),
      watch(KEYS.onboardingDone, setOnboardingDone),
    ];
    return () => stops.forEach((stop) => stop());
  }, []);

  /* ─── confirm, behind the first paint ────────────────────────────────── */

  const confirm = useCallback(
    async (force: boolean) => {
      if (confirming.current) return;
      confirming.current = true;
      try {
        /* 1. The public config: the version floor and the kill switches. Done
         *    even when signed out, which is the point — a build below the floor
         *    has to be able to say so without signing in first. Handed to the
         *    background because validating the adapter config carries a zod
         *    schema that has no business in this bundle. */
        try {
          await sendToBackground({ type: "SYNC_CONFIG", version: 0 });
        } catch {
          /* worker asleep or reloading — the cached gates still stand */
        }

        if (!signedIn) return;

        /* 2. The licensed half. */
        const cached = await read(KEYS.license);
        if (!force && isFresh(cached, LICENSE_FRESH_MS)) return;

        let outcome = await heartbeat();

        /* 3. An unregistered install is the normal state right after signing in.
         *    Register, then take the registration's own answer as the truth —
         *    it carries the device list we would need for the limit screen. */
        if (outcome.kind === "unregistered") {
          const registration = await registerDevice();
          if (registration.kind === "device_limit") {
            setDeviceLimit({
              limit: registration.limit,
              devices: registration.devices,
            });
            return;
          }
          if (registration.kind === "failed") {
            setProblem(failureMessage(registration.failure));
            return;
          }
          // "blocked" needs no special case: the heartbeat below reports it, and
          // signs out, with the same message the register call would have given.
          setDeviceLimit(null);
          outcome = await heartbeat();
        }

        if (outcome.kind === "failed") {
          setProblem(failureMessage(outcome.failure));
          return;
        }
        if (outcome.kind === "ok") {
          setDeviceLimit(null);
          setProblem(null);
        }
      } finally {
        confirming.current = false;
      }
    },
    [signedIn],
  );

  // On open, and whenever the session appears. The dependency on `signedIn` is
  // what makes signing in trigger registration immediately rather than at the
  // next 15-minute alarm.
  useEffect(() => {
    void confirm(false);
  }, [confirm]);

  /* ─── derived answers ────────────────────────────────────────────────── */

  const minVersion = gates?.minVersion ?? license?.minVersion ?? "0.0.0";
  const latestVersion = gates?.latestVersion ?? license?.latestVersion ?? "0.0.0";

  const gate: LicenseGate = loading
    ? { kind: "loading" }
    : isBelow(version, minVersion)
      ? { kind: "must_update", minVersion }
      : deviceLimit
        ? { kind: "device_limit", limit: deviceLimit.limit, devices: deviceLimit.devices }
        : { kind: "ok" };

  const checkedAt = license?.checkedAt ?? null;
  const stale = signedIn && (!checkedAt || Date.now() - checkedAt > LICENSE_STALE_MS);

  const updateAvailable =
    compareVersions(version, latestVersion) < 0 ? latestVersion : null;

  const dismissOnboarding = useCallback(() => {
    setOnboardingDone(true);
    void write(KEYS.onboardingDone, true);
  }, []);

  const reopenOnboarding = useCallback(() => {
    setOnboardingDone(false);
    void write(KEYS.onboardingDone, false);
  }, []);

  const dismissWhatsNew = useCallback(() => {
    setWhatsNewSeen(version);
    void write(KEYS.whatsNewSeen, version);
  }, [version]);

  const signOutDevice = useCallback(
    async (target: string): Promise<string | null> => {
      const result = await revokeDevice(target);
      if (!result.ok) return result.message;

      // Try registration again now that a slot is free. If the seller signed THIS
      // install out, registration simply reactivates it — which is the right
      // outcome: they are sitting in front of it.
      const registration = await registerDevice();
      if (registration.kind === "device_limit") {
        setDeviceLimit({ limit: registration.limit, devices: registration.devices });
        return "That freed a slot, but you are still over the limit. Sign out one more.";
      }
      if (registration.kind === "failed") return failureMessage(registration.failure);
      if (registration.kind === "blocked") return registration.message;

      setDeviceLimit(null);
      await heartbeat();
      return null;
    },
    [],
  );

  const refresh = useCallback(async () => {
    setProblem(null);
    await confirm(true);
  }, [confirm]);

  return {
    gate,
    license,
    stale,
    checkedAt,
    problem,
    features,
    updateAvailable,
    // Onboarding wins over "what's new": a first run has nothing to compare to.
    showOnboarding: !loading && !onboardingDone,
    showWhatsNew: !loading && onboardingDone && whatsNewSeen !== version,
    signOutReason,
    dismissOnboarding,
    reopenOnboarding,
    dismissWhatsNew,
    signOutDevice,
    refresh,
  };
}
