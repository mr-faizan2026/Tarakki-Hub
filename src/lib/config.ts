/**
 * App-wide configuration constants.
 *
 * ── Starter credits ─────────────────────────────────────────────────────────
 * Every new account is granted this many free credits on signup. This constant
 * is the single source of truth for *display copy* ("Start with 3 free
 * credits"). The actual grant happens in the database, in the
 * `public.starter_credits()` SQL function (see
 * `supabase/migrations/0001_init.sql`) which defaults to the same value. Change
 * both together if you ever move off 3.
 */
export const STARTER_CREDITS = 3;

/**
 * ── Payment gateway ─────────────────────────────────────────────────────────
 * Billing runs through Cashfree, selling one-time CREDIT PACKS — see
 * supabase/migrations/0005_billing.sql and src/lib/cashfree.ts.
 *
 * There is no build-time "enabled" flag any more, and deliberately so: whether
 * checkout works is decided at request time by whether CASHFREE_APP_ID and
 * CASHFREE_SECRET_KEY are set (cashfreeConfig() returns null when they are
 * not). A constant here could say "enabled" on a deployment whose keys were
 * never added, which is the one lie this surface must not tell.
 */
export const PAYMENTS = {
  provider: "cashfree" as const,
} as const;

/**
 * ── The app's own public origin ─────────────────────────────────────────────
 * Cashfree needs two absolute URLs on every order: where to send the buyer back
 * (`return_url`) and where to POST the result (`notify_url`). Neither can be a
 * relative path, and `notify_url` has to be reachable from Cashfree's servers —
 * so on localhost the webhook simply never arrives, which is why the billing
 * page also polls the order status.
 *
 * `NEXT_PUBLIC_SITE_URL` wins when set. On Vercel we fall back to the
 * deployment's own host, and finally to localhost for `next dev`.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${vercel.replace(/\/+$/, "")}`;

  return "http://localhost:3000";
}

/**
 * ── The sibling product ─────────────────────────────────────────────────────
 * ecomtools.tarakkihub.com is a SEPARATE Tarakki Hub application — the
 * dropshipping and shipping portal (courier integrations, bulk order booking,
 * prepaid wallet, COD payouts). It shares the brand and the domain, nothing
 * else: no shared session, no shared database.
 *
 * Kept here rather than inline so the one link on the marketing page and any
 * future ones cannot drift apart.
 */
export const ECOM_TOOLS_URL = "https://ecomtools.tarakkihub.com/";
