import { authenticate, fail, json, preflight, rateLimit, readJson, str } from "@/lib/extension-api";
import type { CreditErrorCode, CreditResponse } from "@/lib/extension-protocol";

/**
 * POST /api/extension/credit
 *
 * Spend credits for one final export. Body:
 *   { device_id, idempotency_key, action?, amount? }
 *
 * ── THE TWO THINGS THIS ADDS OVER consume_credit() ────────────────────────
 * 1. DEVICE. The install must be registered and active. An install the seller
 *    signed out from another computer cannot spend their credits, even though its
 *    Supabase token is still perfectly valid for an hour.
 *
 * 2. IDEMPOTENCY. The extension mints one key per final export and reuses it on
 *    every retry of that export. The first call charges; every later call with
 *    the same key replays the first call's answer. Retrying a timed-out export —
 *    the single most likely way to be charged twice — is therefore free.
 *
 * Both live in SQL (consume_credit_for), not here: a Node process can be
 * restarted between the check and the write, and two instances can run at once.
 * The unique index on credit_claims.idempotency_key is what actually makes
 * "charged once" true.
 *
 * `amount` is accepted but clamped to 1. The extension charges one credit per
 * low-shipping export and nothing else; a body asking for more is a bug or a
 * tampered client, and in both cases 1 is the right answer.
 */
export const dynamic = "force-dynamic";

/** Postgres `raise exception 'no_credits'` → the code the panel already knows. */
function classify(message: string | undefined): CreditErrorCode {
  const m = (message ?? "").toLowerCase();
  if (m.includes("no_credits")) return "no_credits";
  if (m.includes("account_blocked")) return "account_blocked";
  if (m.includes("device_revoked")) return "device_revoked";
  if (m.includes("missing_idempotency_key")) return "missing_idempotency_key";
  if (m.includes("idempotency_key_conflict")) return "idempotency_key_conflict";
  if (m.includes("not_authenticated")) return "not_authenticated";
  return "unknown";
}

const MESSAGES: Record<CreditErrorCode, string> = {
  no_credits: "You're out of credits.",
  account_blocked: "This account has been blocked. Contact support.",
  device_revoked:
    "This computer was signed out of TarakkiHub. Sign in again to keep going.",
  missing_idempotency_key: "That request was malformed. Try the export again.",
  idempotency_key_conflict: "That request was malformed. Try the export again.",
  not_authenticated: "Sign in again to continue.",
  unknown: "Couldn't spend a credit. Please try again.",
};

export function OPTIONS(request: Request): Response {
  return preflight(request);
}

export async function POST(request: Request): Promise<Response> {
  const caller = await authenticate(request);
  if (!caller) {
    return fail(request, "not_authenticated", MESSAGES.not_authenticated, 401);
  }

  const body = await readJson(request);
  const deviceId = str(body.device_id, 64);
  const key = str(body.idempotency_key, 100);

  if (!deviceId) {
    return json<CreditResponse>(request, {
      ok: false,
      code: "device_revoked",
      error: "This install isn't registered. Sign in again.",
    });
  }
  if (!key) {
    return json<CreditResponse>(request, {
      ok: false,
      code: "missing_idempotency_key",
      error: MESSAGES.missing_idempotency_key,
    });
  }

  // Generous: a retrying export may legitimately hit this several times, and a
  // replay costs nothing. It is only here to bound a runaway loop.
  if (!rateLimit(`credit:${caller.user.id}:${deviceId}`, 30, 60_000)) {
    return fail(request, "rate_limited", "Too many attempts. Wait a minute.", 429);
  }

  const { data, error } = await caller.db.rpc("consume_credit_for", {
    p_user: caller.user.id,
    p_device_id: deviceId,
    p_idempotency_key: key,
    p_action: str(body.action, 60) ?? "Low-shipping image",
    p_amount: 1,
  });

  if (error) {
    const code = classify(error.message);
    // An unknown Postgres failure is a server problem, not a domain answer: the
    // extension must be free to retry it with the same key.
    const status = code === "unknown" ? 502 : 200;
    return json<CreditResponse>(request, { ok: false, code, error: MESSAGES[code] }, status);
  }

  // rpc() returning a table row types as an array under some setups; normalise.
  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        credits_remaining: number;
        images_used: number;
        period_start: string;
        period_end: string;
      }
    | null;

  if (!row) {
    return json<CreditResponse>(
      request,
      { ok: false, code: "unknown", error: MESSAGES.unknown },
      502,
    );
  }

  return json<CreditResponse>(request, {
    ok: true,
    usage: {
      credits_remaining: row.credits_remaining,
      images_used: row.images_used,
      period_start: row.period_start,
      period_end: row.period_end,
    },
  });
}
