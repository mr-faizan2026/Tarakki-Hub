/**
 * ════════════════════════════════════════════════════════════════════════════
 *  THE /api/extension/* WIRE CONTRACT
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Pure types, no imports, no runtime. This file MIRRORS the web app's
 *  `src/lib/extension-protocol.ts`. The two cannot import from each other
 *  (separate packages, separate tsconfigs), so they are kept in lockstep by
 *  hand — CHANGE BOTH TOGETHER, exactly as db-types.ts tracks the migrations.
 *
 *  ── TWO KINDS OF FAILURE, AND WHY THEY LOOK DIFFERENT ─────────────────────
 *  A DOMAIN answer ("you are at your device limit", "no credits left") is a 200
 *  with `ok: false` and a `code`. It is information the panel renders as a
 *  screen, not an outage.
 *
 *  A TRANSPORT or AUTH failure (401, 5xx, a dead network) is a non-2xx status.
 *  The extension retries those with backoff and otherwise keeps working from its
 *  cached state.
 *
 *  Collapsing the two is how "sign out one of your devices" becomes "something
 *  went wrong, try again", which no seller can act on.
 */

/* ─── register-device ───────────────────────────────────────────────────── */

export type ExtensionDeviceInfo = {
  device_id: string;
  label: string | null;
  ext_version: string | null;
  last_seen_at: string;
  created_at: string;
};

export type RegisterDeviceResponse =
  | {
      ok: true;
      limit: number;
      devices: ExtensionDeviceInfo[];
    }
  | {
      ok: false;
      /** At the cap. `devices` is the list the panel asks the seller to prune. */
      code: "device_limit";
      limit: number;
      devices: ExtensionDeviceInfo[];
    }
  | { ok: false; code: "account_blocked" | "bad_request"; error: string };

/* ─── revoke-device ─────────────────────────────────────────────────────── */

export type RevokeDeviceResponse =
  | { ok: true; revoked: boolean; devices: ExtensionDeviceInfo[] }
  | { ok: false; code: string; error: string };

/* ─── heartbeat ─────────────────────────────────────────────────────────── */

/**
 * One round trip answers everything the extension must re-ask periodically.
 *
 * `device_ok: false` means this install has been signed out elsewhere (or never
 * registered). `blocked: true` means the admin has blocked the account. Either
 * one makes the extension sign itself out locally and say which it was.
 */
export type HeartbeatResponse =
  | {
      ok: true;
      device_ok: boolean;
      blocked: boolean;
      plan: string;
      has_active_plan: boolean;
      credits_remaining: number;
      images_used: number;
      device_limit: number;
      devices: ExtensionDeviceInfo[];
      /** Bumped by the admin on every adapter_config edit. */
      adapter_config_version: number;
      /** Below this, the extension refuses to run and says to update. */
      min_version: string;
      /** Above the running version, a quiet "update available" note. */
      latest_version: string;
      kill_switches: KillSwitchMap;
    }
  | { ok: false; code: string; error: string };

/* ─── config ────────────────────────────────────────────────────────────── */

/**
 * A kill switch per feature. `enabled: false` makes that section of the panel
 * show `message` and do nothing on the page — no DOM writes, no Meesho calls.
 */
export type KillSwitch = { enabled: boolean; message?: string };
export type KillSwitchMap = Partial<
  Record<"live_shipping" | "image_generator" | "autofill", KillSwitch>
> &
  Record<string, KillSwitch | undefined>;

/**
 * The remote half of the Meesho adapter's configuration. Every key is optional;
 * only the keys present override the extension's bundled defaults.
 *
 * THIS IS DATA. The extension validates it against a schema and merges it over
 * its own constants. It is never evaluated, never injected as a script, never
 * passed to `Function()`. `placeholderNoise` is the one string compiled into a
 * RegExp, and that compilation is wrapped — an invalid pattern falls back to the
 * bundled one rather than throwing inside discovery.
 */
export type AdapterConfigPayload = {
  /** Bump on every edit, or nobody re-fetches. */
  version?: number;
  shipping?: {
    labels?: string[];
    negative?: string[];
    maxClimb?: number;
  };
  form?: {
    anchorText?: string[];
    excludeSelectors?: string[];
    minControls?: number;
    /** How many DISTINCT anchorText words a container must mention. Default 2. */
    minAnchors?: number;
    coverage?: { preferred?: number; fallback?: number };
  };
  labels?: {
    maxLen?: number;
    sectionMaxLen?: number;
    defaultSection?: string;
    /** Source for a RegExp, compiled with the `i` flag. */
    placeholderNoise?: string;
  };
  dropdown?: {
    selectors?: string[];
    listbox?: string[];
    option?: string[];
    confirmLabels?: string[];
    optionFallbackMaxLen?: number;
  };
  timing?: {
    retries?: number;
    perFieldTimeoutMs?: number;
    betweenFieldsMs?: number;
    settleQuietMs?: number;
    settleMaxMs?: number;
    optionWaitMs?: number;
    maxPasses?: number;
  };
  fuzzyThreshold?: number;
};

export type ConfigResponse =
  | {
      ok: true;
      adapter_config: AdapterConfigPayload;
      adapter_config_version: number;
      kill_switches: KillSwitchMap;
      min_version: string;
      latest_version: string;
    }
  | { ok: false; code: string; error: string };

/* ─── events ────────────────────────────────────────────────────────────── */

export type HealthStatus = "ok" | "not_found" | "error";

/**
 * One adapter health check.
 *
 * WHAT MAY BE IN HERE: the feature, the check, the status, an id-stripped URL
 * path, and a short adapter-side reason. NOTHING ELSE — no form values, no
 * product names, no prices, no seller details. The server filters again (see
 * record_extension_events in 0004_extension.sql), because this promise is worth
 * enforcing on both sides.
 */
export type HealthEvent = {
  feature: string;
  check_key: string;
  status: HealthStatus;
  /** e.g. "/panel/v3/new/catalog/:id/single" — every id segment replaced. */
  path?: string;
  detail?: string;
};

export type EventsResponse =
  | { ok: true; accepted: number }
  | { ok: false; code: string; error: string };

/* ─── credit ────────────────────────────────────────────────────────────── */

export type CreditErrorCode =
  | "no_credits"
  | "account_blocked"
  | "device_revoked"
  | "missing_idempotency_key"
  | "idempotency_key_conflict"
  | "not_authenticated"
  | "unknown";

export type CreditResponse =
  | {
      ok: true;
      usage: {
        credits_remaining: number;
        images_used: number;
        period_start: string;
        period_end: string;
      };
    }
  | { ok: false; code: CreditErrorCode; error: string };
