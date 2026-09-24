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
