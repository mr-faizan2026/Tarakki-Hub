/**
 * Build-time configuration. Values come from Vite env (`import.meta.env`), so
 * nothing sensitive is hardcoded in components. See `.env.example`.
 *
 * IMPORTANT: only the Supabase URL + ANON key live here. The anon key is public
 * and safe to ship in a client. The SERVICE-ROLE key must NEVER appear in the
 * extension — every privileged write goes through the `consume_credit` RPC,
 * which runs server-side with definer privileges (see credits.ts).
 */

const env = import.meta.env;

function required(name: string, value: string | undefined): string {
  if (!value) {
    // Surfaced loudly during dev; a production build fails typecheck earlier.
    console.error(`[TarakkiHub] Missing required env var: ${name}`);
    return "";
  }
  return value;
}

export const SUPABASE_URL = required(
  "VITE_SUPABASE_URL",
  env.VITE_SUPABASE_URL,
);

export const SUPABASE_ANON_KEY = required(
  "VITE_SUPABASE_ANON_KEY",
  env.VITE_SUPABASE_ANON_KEY,
);

/** The web dashboard — where "upgrade / billing" and account links point. */
export const WEB_APP_URL: string =
  env.VITE_WEB_APP_URL ?? "https://tarakkihub.com";

export const BILLING_URL = `${WEB_APP_URL}/dashboard/billing`;

/** The one host the extension operates on. Kept as data so the adapter, the
 *  background per-tab logic and the panel all agree on a single definition. */
export const MEESHO_HOST = "supplier.meesho.com";
export const MEESHO_MATCH = /^https:\/\/supplier\.meesho\.com\//i;

/** Display copy only — the real grant happens in the DB's starter_credits(). */
export const STARTER_CREDITS = 3;

/** chrome.storage.local key namespace for the persisted Supabase session. */
export const SESSION_STORAGE_KEY = "tk_supabase_auth";

/**
 * Developer tools in the side panel — currently the autofill **Field scan** view,
 * which lists every control the Meesho adapter detects on the current page.
 *
 * On in `npm run dev`, and in a production build only when VITE_DEV_TOOLS=true is
 * set explicitly. It is the instrument for tuning detection against the real
 * Meesho form and for diagnosing a Meesho UI change; it is not seller-facing.
 */
// NOTE: written as direct `import.meta.env.X` reads, NOT via the `env` alias above.
// Vite replaces those textually at build time, so Rollup can fold this to a
// literal `false` in a production build and drop every branch guarded by it —
// including the dynamic import of the field-scan view (see AutofillSection).
// Read through `env.DEV` instead and the fold does not happen: the debug view
// ships, unreachable but present, in the zip Chrome review downloads.
export const DEV_TOOLS: boolean =
  import.meta.env.DEV || import.meta.env.VITE_DEV_TOOLS === "true";

/** chrome.storage.local key: has the seller been told where profiles are stored? */
export const AUTOFILL_NOTICE_KEY = "tk_autofill_storage_notice_seen";

/* ════════════════════════════════════════════════════════════════════════════
 *  PART 3 — the backend control plane
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * Where /api/extension/* lives. Same origin as the dashboard, so one env var
 * covers both. The manifest's host_permissions must include this origin —
 * see manifest.config.ts, which states it separately because it is evaluated in
 * Node and cannot read import.meta.env.
 */
export const API_BASE = `${WEB_APP_URL.replace(/\/+$/, "")}/api/extension`;

export const API = {
  registerDevice: `${API_BASE}/register-device`,
  revokeDevice: `${API_BASE}/revoke-device`,
  heartbeat: `${API_BASE}/heartbeat`,
  config: `${API_BASE}/config`,
  events: `${API_BASE}/events`,
  credit: `${API_BASE}/credit`,
} as const;

/**
 * Heartbeat cadence.
 *
 * chrome.alarms will not fire faster than once a minute in a packed extension,
 * and 15 minutes is the shortest interval that is both well within that and
 * cheap: four calls an hour per install. The panel also heartbeats on open, so
 * a seller who has just been blocked or signed out elsewhere finds out when they
 * next look at the panel rather than up to 15 minutes later.
 */
export const HEARTBEAT_ALARM = "tk_heartbeat";
export const HEARTBEAT_PERIOD_MINUTES = 15;

/** Flushing queued health events. Deliberately slower than the heartbeat. */
export const HEALTH_FLUSH_ALARM = "tk_health_flush";
export const HEALTH_FLUSH_PERIOD_MINUTES = 30;

/**
 * How old a cached heartbeat may be before the panel re-checks on open.
 * Short enough that opening the panel after lunch re-checks; long enough that
 * closing and reopening it four times in a minute does not.
 */
export const LICENSE_FRESH_MS = 2 * 60 * 1000;

/**
 * How old a cached heartbeat may be before the panel stops trusting it at all.
 *
 * It does NOT lock the seller out — a dead network is not a licence problem, and
 * an extension that bricks itself offline is worse than one that keeps working.
 * Past this the panel says the licence state is stale and when it was last
 * confirmed, and the server-side gates (RLS, consume_credit_for) continue to be
 * the things that actually decide anything.
 */
export const LICENSE_STALE_MS = 24 * 60 * 60 * 1000;

/** chrome.storage key namespace for the device label shown in the device list. */
export const DEVICE_LABEL_MAX = 60;
