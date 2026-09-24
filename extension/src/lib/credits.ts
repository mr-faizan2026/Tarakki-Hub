import { getSupabase } from "./supabase";
import type { Usage } from "./db-types";

/**
 * Credit spending — the cheat-proof path.
 *
 * The extension NEVER writes the `usage` table directly: RLS forbids it. The
 * only way to move a credit is `public.consume_credit(action, amount)`, a
 * SECURITY DEFINER Postgres function granted to `authenticated`. It:
 *   1. verifies the caller's JWT server-side (auth.uid()),
 *   2. refuses blocked accounts,
 *   3. checks the balance and decrements atomically,
 *   4. logs a credit_events row the web dashboard displays,
 * all with definer privileges the client doesn't have. A tampered client can't
 * grant itself credits — it can only ask the server to spend one it owns.
 *
 * This is the "secure backend endpoint" the spec requires; it happens to be a
 * database function invoked over PostgREST rather than a bespoke HTTP route,
 * which keeps the whole flow inside the one backend the web app already uses.
 */

export type CreditErrorKind =
  | "no_credits"
  | "account_blocked"
  | "not_authenticated"
  | "unknown";

export class CreditError extends Error {
  kind: CreditErrorKind;
  constructor(kind: CreditErrorKind, message?: string) {
    super(message ?? kind);
    this.name = "CreditError";
    this.kind = kind;
  }
}

function classify(message: string | undefined): CreditErrorKind {
  const m = (message ?? "").toLowerCase();
  if (m.includes("no_credits")) return "no_credits";
  if (m.includes("account_blocked")) return "account_blocked";
  if (m.includes("not_authenticated")) return "not_authenticated";
  return "unknown";
}

/**
 * Spend exactly one credit — the price of a low-shipping run, charged only when
 * the seller uses an image whose LIVE Meesho shipping beat their own photo's
 * (see ImageGenerator). Returns the updated usage row (so the panel can show
 * the new balance immediately).
 * Throws CreditError('no_credits') at zero balance, ('account_blocked') if the
 * admin has blocked the account.
 */
export async function spendExportCredit(
  action = "Low-shipping image",
): Promise<Usage> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("consume_credit", {
    p_action: action,
    p_amount: 1,
  });

  if (error) {
    throw new CreditError(classify(error.message), error.message);
  }
  if (!data) {
    throw new CreditError("unknown", "No usage row returned from consume_credit");
  }
  // rpc() returning a table row types as an array under some setups; normalise.
  return (Array.isArray(data) ? data[0] : data) as Usage;
}
