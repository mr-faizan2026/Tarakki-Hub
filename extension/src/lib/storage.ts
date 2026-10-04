/**
 * ════════════════════════════════════════════════════════════════════════════
 *  chrome.storage.local — the extension's ONLY durable state
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  ── THE MV3 RULE THIS FILE EXISTS TO ENFORCE ──────────────────────────────
 *  A service worker is not a process you own. Chrome stops it after ~30 seconds
 *  of inactivity and restarts it on the next event, with every module-level
 *  variable gone. So anything that must still be true on the next event —
 *  whether this device is still licensed, which features are switched off, which
 *  adapter config is in force, what health events are queued, whether an export
 *  has already been charged — lives HERE, not in a `let`.
 *
 *  The background's in-memory maps (readyTabs, shippingByTab) are the legitimate
 *  exception: they are a cache of things that can be rebuilt from chrome.tabs on
 *  demand, and losing them costs one re-read.
 *
 *  ── WHY TYPED KEYS RATHER THAN RAW get/set ────────────────────────────────
 *  Three contexts read this storage (panel, background, content script) and a
 *  key spelled slightly differently in one of them is a bug that looks like
 *  "the setting didn't save". The KEYS table below is the single spelling, and
 *  `read`/`write` are generic over it so a typo fails the build.
 *
 *  Every accessor is failure-tolerant. chrome.storage can throw (quota, a
 *  context being torn down mid-call) and none of it is worth taking a feature
 *  down for: a read falls back to the supplied default, a write is dropped.
 */

import type {
  AdapterConfigPayload,
  ExtensionDeviceInfo,
  HealthEvent,
  KillSwitchMap,
} from "./backend-types";

/* ─── the keys ──────────────────────────────────────────────────────────── */

/**
 * One place, one spelling. `tk_supabase_auth` (the Supabase session) is NOT here
 * on purpose — supabase-js owns that key and writes it through its own storage
 * adapter (see supabase.ts); nothing in this file should ever touch it.
 */
export const KEYS = {
  /** The random per-install id sent with every licensed call. */
  deviceId: "tk_device_id",
  /** Last heartbeat answer. The panel renders from this, not from the network. */
  license: "tk_license",
  /** Why the extension signed itself out, so the sign-in screen can say. */
  signOutReason: "tk_signout_reason",
  /** The user id this install is registered for, if any (see license.ts). */
  registeredFor: "tk_registered_for",
  /** min/latest version, cached separately so a SIGNED-OUT panel can gate. */
  versionGates: "tk_version_gates",
  /** Validated + merged remote adapter config, and when it was fetched. */
  adapterConfig: "tk_adapter_config",
  /** Feature kill switches, mirrored out of the heartbeat/config answers. */
  killSwitches: "tk_kill_switches",
  /** Queued health events waiting for a flush. */
  healthQueue: "tk_health_queue",
  /** Per-check "already reported this page load" markers, to deduplicate. */
  healthSeen: "tk_health_seen",
  /** Has the seller seen the three-step first-run guide? */
  onboardingDone: "tk_onboarding_done",
  /** The version whose "what's new" note has been shown. */
  whatsNewSeen: "tk_whats_new_seen",
  /** In-flight credit claims, keyed by idempotency key (see credits.ts). */
  creditClaims: "tk_credit_claims",
  /** True while a fill or export is running — blocks an auto-applied update. */
  busy: "tk_busy",
} as const;

export type StorageKey = (typeof KEYS)[keyof typeof KEYS];

/* ─── the shapes behind those keys ──────────────────────────────────────── */

/**
 * The cached licence. `checkedAt` is what makes a stale answer visible: a panel
 * opened on a dead network shows the last known state, and says how old it is,
 * rather than pretending it just confirmed anything.
 */
export type LicenseState = {
  checkedAt: number;
  /** False once a heartbeat says this install was signed out elsewhere. */
  deviceOk: boolean;
  blocked: boolean;
  plan: string;
  hasActivePlan: boolean;
  creditsRemaining: number;
  imagesUsed: number;
  deviceLimit: number;
  devices: ExtensionDeviceInfo[];
  adapterConfigVersion: number;
  minVersion: string;
  latestVersion: string;
};

export type CachedAdapterConfig = {
  version: number;
  fetchedAt: number;
  config: AdapterConfigPayload;
};

/**
 * The version floor and the latest published version.
 *
 * Cached separately from LicenseState on purpose: the blocking "please update"
 * screen has to work on a build too old to sign in, and a LicenseState only
 * exists after a successful heartbeat. Both the heartbeat and the public config
 * fetch write this key, so a signed-out panel has an answer too.
 */
export type VersionGates = {
  checkedAt: number;
  minVersion: string;
  latestVersion: string;
};

export type SignOutReason = {
  at: number;
  kind: "device_revoked" | "blocked";
  message: string;
};

/** One queued health event, with the id-stripped path it was observed on. */
export type QueuedHealthEvent = HealthEvent & { at: number };

/** Defaults are part of the contract: every reader gets the same empty state. */
export type StorageShape = {
  [KEYS.deviceId]: string | null;
  [KEYS.license]: LicenseState | null;
  [KEYS.signOutReason]: SignOutReason | null;
  [KEYS.registeredFor]: string | null;
  [KEYS.versionGates]: VersionGates | null;
  [KEYS.adapterConfig]: CachedAdapterConfig | null;
  [KEYS.killSwitches]: KillSwitchMap;
  [KEYS.healthQueue]: QueuedHealthEvent[];
  [KEYS.healthSeen]: Record<string, number>;
  [KEYS.onboardingDone]: boolean;
  [KEYS.whatsNewSeen]: string | null;
  [KEYS.creditClaims]: Record<string, { at: number; settled: boolean }>;
  [KEYS.busy]: boolean;
};

export const DEFAULTS: StorageShape = {
  [KEYS.deviceId]: null,
  [KEYS.license]: null,
  [KEYS.signOutReason]: null,
  [KEYS.registeredFor]: null,
  [KEYS.versionGates]: null,
  [KEYS.adapterConfig]: null,
  [KEYS.killSwitches]: {},
  [KEYS.healthQueue]: [],
  [KEYS.healthSeen]: {},
  [KEYS.onboardingDone]: false,
  [KEYS.whatsNewSeen]: null,
  [KEYS.creditClaims]: {},
  [KEYS.busy]: false,
};

/* ─── accessors ─────────────────────────────────────────────────────────── */

function available(): boolean {
  return typeof chrome !== "undefined" && !!chrome.storage?.local;
}

export async function read<K extends keyof StorageShape>(
  key: K,
): Promise<StorageShape[K]> {
  if (!available()) return DEFAULTS[key];
  try {
    const got = await chrome.storage.local.get(key);
    const value = got?.[key as string];
    return (value === undefined ? DEFAULTS[key] : value) as StorageShape[K];
  } catch {
    return DEFAULTS[key];
  }
}

export async function write<K extends keyof StorageShape>(
  key: K,
  value: StorageShape[K],
): Promise<void> {
  if (!available()) return;
  try {
    await chrome.storage.local.set({ [key]: value });
  } catch {
    /* quota or a torn-down context — the caller works from its own copy */
  }
}

export async function remove(key: keyof StorageShape): Promise<void> {
  if (!available()) return;
  try {
    await chrome.storage.local.remove(key as string);
  } catch {
    /* ignore */
  }
}

/**
 * Read several keys in one round trip. Worth it in the content script's boot
 * path, where two awaits is two frames of the seller looking at a blank card.
 */
export async function readMany<K extends keyof StorageShape>(
  keys: K[],
): Promise<Pick<StorageShape, K>> {
  const out = {} as Pick<StorageShape, K>;
  if (!available()) {
    for (const key of keys) out[key] = DEFAULTS[key];
    return out;
  }
  try {
    const got = await chrome.storage.local.get(keys as string[]);
    for (const key of keys) {
      const value = got?.[key as string];
      out[key] = (value === undefined ? DEFAULTS[key] : value) as StorageShape[K];
    }
  } catch {
    for (const key of keys) out[key] = DEFAULTS[key];
  }
  return out;
}

/**
 * Read-modify-write one key.
 *
 * NOT atomic — chrome.storage has no compare-and-swap, and two contexts
 * updating the same key in the same millisecond can lose one update. Every
 * caller here is tolerant of that: a dropped health event is a dropped health
 * event. The one place where losing a write would cost a seller money is the
 * credit claim, and THAT is settled on the server by a unique index, not here
 * (see credits.ts and consume_credit_for in 0004_extension.sql).
 */
export async function update<K extends keyof StorageShape>(
  key: K,
  mutate: (current: StorageShape[K]) => StorageShape[K],
): Promise<StorageShape[K]> {
  const current = await read(key);
  let next: StorageShape[K];
  try {
    next = mutate(current);
  } catch {
    return current;
  }
  await write(key, next);
  return next;
}

/**
 * Watch one key. Returns an unsubscribe function.
 *
 * This is how the side panel learns that the background's alarm heartbeat found
 * the device revoked, or that an admin paused a feature — without polling and
 * without a message protocol between them. Both contexts share one storage area,
 * so storage IS the channel.
 */
export function watch<K extends keyof StorageShape>(
  key: K,
  onChange: (value: StorageShape[K]) => void,
): () => void {
  if (!available() || !chrome.storage.onChanged) return () => {};

  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area !== "local") return;
    const change = changes[key as string];
    if (!change) return;
    const value = change.newValue;
    onChange((value === undefined ? DEFAULTS[key] : value) as StorageShape[K]);
  };

  chrome.storage.onChanged.addListener(listener);
  return () => {
    try {
      chrome.storage.onChanged.removeListener(listener);
    } catch {
      /* already gone */
    }
  };
}
