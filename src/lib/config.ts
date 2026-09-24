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
 * Billing will run through Cashfree. Checkout is not wired yet — this flag lets
 * the UI show a "launching soon" state and marks the single integration point
 * that the Cashfree order/session flow will plug into later.
 */
export const PAYMENTS = {
  provider: "cashfree" as const,
  enabled: false,
} as const;
