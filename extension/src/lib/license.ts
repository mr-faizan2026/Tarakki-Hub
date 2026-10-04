import { API } from "./config";
import {
  callBackend,
  failureMessage,
  isFailure,
  type BackendFailure,
} from "./backend";
import { deviceId, deviceLabel } from "./device";
import { getSupabase } from "./supabase";
import { currentVersion } from "./version";
import {
  KEYS,
  read,
  write,
  type LicenseState,
  type SignOutReason,
} from "./storage";
import type {
  ExtensionDeviceInfo,
  HeartbeatResponse,
  RegisterDeviceResponse,
  RevokeDeviceResponse,
} from "./backend-types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  LICENSING — registration, the heartbeat, and signing a device out
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  ── WHERE THE ENFORCEMENT ACTUALLY IS ─────────────────────────────────────
 *  Not here. The device limit is counted in SQL (register_extension_device) and
 *  a credit cannot be spent from a revoked install because consume_credit_for
 *  re-checks the row. Everything in this file is about telling the SELLER the
 *  truth promptly and clearly — which device list to prune, why they were signed
 *  out, how old the last check is. A tampered build of this file gains nothing;
 *  it can only lie to its own user.
 *
 *  That distinction is the whole reason the design works. The brief's rule —
 *  "never silently bypass the limit" — is kept by there being no bypass to find:
 *  the endpoint that would have to grant it is the one counting.
 *
 *  ── WHY THE STATE GOES TO chrome.storage ──────────────────────────────────
 *  MV3 kills the service worker. A heartbeat result held in a module variable is
 *  gone before the next alarm, so the panel would have nothing to render and
 *  would re-ask on every open. `KEYS.license` is the shared answer: the alarm
 *  writes it, the panel reads and watches it, and both see the same thing.
 */

/** The signed-in user id, or null. Read from the stored session, so it is cheap. */
async function currentUserId(): Promise<string | null> {
  try {
    const { data } = await getSupabase().auth.getSession();
    return data.session?.user.id ?? null;
  } catch {
    return null;
  }
}

/* ─── registration ──────────────────────────────────────────────────────── */

export type RegisterOutcome =
  | { kind: "registered"; limit: number; devices: ExtensionDeviceInfo[] }
  /** At the cap. The panel shows `devices` and offers to sign one out. */
  | { kind: "device_limit"; limit: number; devices: ExtensionDeviceInfo[] }
  | { kind: "blocked"; message: string }
  | { kind: "failed"; failure: BackendFailure };

/**
 * Register this install against the signed-in account. Called once after every
 * sign-in, and again after the seller signs another device out.
 *
 * An install that is already registered is reactivated rather than counted, so
 * this is safe to call as often as the panel likes.
 */
export async function registerDevice(): Promise<RegisterOutcome> {
  const result = await callBackend<RegisterDeviceResponse>(API.registerDevice, {
    body: {
      device_id: await deviceId(),
      label: await deviceLabel(),
      version: currentVersion(),
    },
  });

  if (isFailure(result)) return { kind: "failed", failure: result };

  const body = result.data;
  if (body.ok) {
    // Remember WHO this install is registered for. That is what lets a later
    // heartbeat tell "revoked from another computer" (sign out, say why) apart
    // from "never registered" (just register) — see HeartbeatOutcome.
    await write(KEYS.registeredFor, await currentUserId());
    return { kind: "registered", limit: body.limit, devices: body.devices };
  }
  if (body.code === "device_limit") {
    return { kind: "device_limit", limit: body.limit, devices: body.devices };
  }
  if (body.code === "account_blocked") {
    return { kind: "blocked", message: body.error };
  }
  return { kind: "failed", failure: { transport: "server" } };
}

/**
 * Sign one of the account's installs out — including, legitimately, this one.
 *
 * The revoked install discovers it at its next heartbeat and signs itself out
 * locally. It cannot spend a credit in the meantime: the server checks the row.
 */
export async function revokeDevice(
  targetDeviceId: string,
): Promise<{ ok: true; devices: ExtensionDeviceInfo[] } | { ok: false; message: string }> {
  const result = await callBackend<RevokeDeviceResponse>(API.revokeDevice, {
    body: { device_id: targetDeviceId },
  });

  if (isFailure(result)) {
    return { ok: false, message: failureMessage(result) };
  }
  if (!result.data.ok) return { ok: false, message: result.data.error };
  return { ok: true, devices: result.data.devices };
}

/* ─── the heartbeat ─────────────────────────────────────────────────────── */

export type HeartbeatOutcome =
  | { kind: "ok"; license: LicenseState }
  /** The account or this install is no longer allowed; we have signed out. */
  | { kind: "signed_out"; reason: SignOutReason }
  /**
   * The server does not know this install — and neither do we, because nothing
   * ever registered it for this account. NOT a revocation, and emphatically not a
   * reason to sign anybody out: it is simply the state between signing in and
   * registering. The panel's answer is to register; the alarm's answer is to wait
   * for the panel to do it.
   *
   * Distinguishing this from a revocation is the difference between "sign in
   * again" appearing after a sign-in, every time, for every new seller, and the
   * thing working.
   */
  | { kind: "unregistered"; license: LicenseState }
  | { kind: "failed"; failure: BackendFailure; cached: LicenseState | null };

/**
 * The periodic "still allowed, anything changed?" call.
 *
 * Called from three places, all of which want the same thing to happen:
 *   • the chrome.alarms tick (every ~15 minutes, service worker);
 *   • the side panel opening (so a seller blocked two minutes ago finds out now);
 *   • immediately after registering a device.
 *
 * On `device_ok: false` or `blocked: true` it signs the session out LOCALLY and
 * records why, so the sign-in screen can explain rather than just reappearing.
 * An unexplained sign-out is the single most alarming thing a paid tool can do.
 *
 * A transport failure is NOT a licence failure: the cached state stands and the
 * caller is told the check didn't land. An extension that locks a paying seller
 * out of their own catalog because a café's Wi-Fi dropped is worse than one that
 * keeps working on yesterday's answer — especially since the gates that matter
 * are server-side anyway.
 */
export async function heartbeat(): Promise<HeartbeatOutcome> {
  const cached = await read(KEYS.license);

  const result = await callBackend<HeartbeatResponse>(API.heartbeat, {
    body: { device_id: await deviceId(), version: currentVersion() },
    // The panel waits on this when it opens, so one retry only.
    attempts: 2,
  });

  if (isFailure(result)) {
    if (result.transport === "unauthenticated" || result.transport === "no_session") {
      // The session itself is gone. Not a revocation — don't claim one.
      return { kind: "failed", failure: result, cached };
    }
    return { kind: "failed", failure: result, cached };
  }

  const body = result.data;
  if (!body.ok) return { kind: "failed", failure: { transport: "server" }, cached };

  const license: LicenseState = {
    checkedAt: Date.now(),
    deviceOk: body.device_ok,
    blocked: body.blocked,
    plan: body.plan,
    hasActivePlan: body.has_active_plan,
    creditsRemaining: body.credits_remaining,
    imagesUsed: body.images_used,
    deviceLimit: body.device_limit,
    devices: body.devices,
    adapterConfigVersion: body.adapter_config_version,
    minVersion: body.min_version,
    latestVersion: body.latest_version,
  };

  await write(KEYS.license, license);
  // Kill switches ride along on the heartbeat so a pause takes effect within 15
  // minutes without waiting for a config fetch.
  await write(KEYS.killSwitches, body.kill_switches ?? {});
  await write(KEYS.versionGates, {
    checkedAt: Date.now(),
    minVersion: body.min_version,
    latestVersion: body.latest_version,
  });

  // An install that was never registered is not a revoked one. See the
  // "unregistered" case on HeartbeatOutcome for why conflating them would make
  // every first sign-in look like a lockout.
  if (!body.device_ok && !body.blocked) {
    const registeredFor = await read(KEYS.registeredFor);
    if (!registeredFor || registeredFor !== (await currentUserId())) {
      return { kind: "unregistered", license };
    }
  }

  if (body.blocked || !body.device_ok) {
    const reason: SignOutReason = body.blocked
      ? {
          at: Date.now(),
          kind: "blocked",
          message:
            "This account has been blocked. Contact TarakkiHub support if you think that's a mistake.",
        }
      : {
          at: Date.now(),
          kind: "device_revoked",
          message:
            "This computer was signed out of TarakkiHub from another device. Sign in again to use it here.",
        };
    await signOutLocally(reason);
    return { kind: "signed_out", reason };
  }

  return { kind: "ok", license };
}

/**
 * Should the panel re-check on open, or is the cached answer new enough?
 * `freshMs` comes from config so the two callers can't disagree.
 */
export function isFresh(license: LicenseState | null, freshMs: number): boolean {
  return !!license && Date.now() - license.checkedAt < freshMs;
}

/* ─── signing out ───────────────────────────────────────────────────────── */

/**
 * Drop the local session and leave a reason behind.
 *
 * Deliberately clears the cached licence too: a licence state left over from the
 * signed-out account would be read by the next sign-in's first render and could
 * show the previous seller's credit balance for a frame.
 */
export async function signOutLocally(reason: SignOutReason | null): Promise<void> {
  try {
    await getSupabase().auth.signOut();
  } catch {
    /* already gone, or storage unavailable — the reason below still stands */
  }
  await write(KEYS.license, null);
  await write(KEYS.registeredFor, null);
  await write(KEYS.signOutReason, reason);
}

/** Read and clear the reason — the sign-in screen shows it exactly once. */
export async function takeSignOutReason(): Promise<SignOutReason | null> {
  const reason = await read(KEYS.signOutReason);
  if (reason) await write(KEYS.signOutReason, null);
  return reason;
}
