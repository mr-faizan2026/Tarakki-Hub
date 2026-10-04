import { API } from "./config";
import { callBackend, isFailure } from "./backend";
import { deviceId } from "./device";
import { KEYS, update } from "./storage";
import type { CreditErrorCode, CreditResponse } from "./backend-types";
import type { Usage } from "./db-types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  SPENDING A CREDIT — the cheat-proof and the charge-once path
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Part 1 spent credits through the `consume_credit` Postgres RPC: the extension
 *  asked the server to decrement, and the server checked the JWT, the block
 *  status and the balance with definer privileges the client doesn't have. That
 *  part has not changed and is still the thing that makes cheating pointless.
 *
 *  Part 3 moves the call to POST /api/extension/credit, which wraps that same
 *  logic (consume_credit_for) with two additions the RPC could not express:
 *
 *  ── 1. THE DEVICE ─────────────────────────────────────────────────────────
 *  The spend is refused unless this install is registered and active. A Supabase
 *  access token stays valid for an hour, so an install the seller signed out from
 *  another computer could otherwise keep spending their credits for that hour.
 *
 *  ── 2. IDEMPOTENCY ────────────────────────────────────────────────────────
 *  One key per final export, reused on every retry of that export. The server
 *  charges on the first call with a given key and REPLAYS the same answer for
 *  every later one.
 *
 *  This exists because of a specific, likely failure: the seller clicks Download,
 *  the request charges the credit, the response is lost to a dropped connection,
 *  and the extension — reasonably — retries. Without a key that is two credits for
 *  one image. Worse, MV3 can kill the service worker and the panel can be closed
 *  mid-request, so "I already charged this" cannot be remembered reliably on this
 *  side at all. It is remembered by a unique index on the server.
 *
 *  The local `creditClaims` record below is NOT the guarantee — it is a cheap way
 *  to recognise our own retry and to avoid a pointless round trip. The guarantee
 *  is the primary key on `credit_claims.idempotency_key`.
 */

export type CreditErrorKind =
  | "no_credits"
  | "account_blocked"
  /** This install was signed out elsewhere. */
  | "device_revoked"
  | "not_authenticated"
  /** The network or the backend, not the account. Retrying is reasonable. */
  | "unavailable"
  | "unknown";

export class CreditError extends Error {
  kind: CreditErrorKind;
  constructor(kind: CreditErrorKind, message?: string) {
    super(message ?? kind);
    this.name = "CreditError";
    this.kind = kind;
  }
}

const MESSAGES: Record<CreditErrorKind, string> = {
  no_credits: "You're out of credits — using a cheaper image needs 1 credit.",
  account_blocked: "This account has been blocked. Contact support.",
  device_revoked:
    "This computer was signed out of TarakkiHub. Sign in again to keep going.",
  not_authenticated: "Your session expired. Sign in again to continue.",
  unavailable:
    "Couldn't reach TarakkiHub to spend a credit. Check your connection and try again — you haven't been charged.",
  unknown: "Couldn't spend a credit. Please try again.",
};

export function creditErrorMessage(error: unknown): string {
  return error instanceof CreditError
    ? (error.message || MESSAGES[error.kind])
    : MESSAGES.unknown;
}

function kindFor(code: CreditErrorCode): CreditErrorKind {
  switch (code) {
    case "no_credits":
      return "no_credits";
    case "account_blocked":
      return "account_blocked";
    case "device_revoked":
      return "device_revoked";
    case "not_authenticated":
      return "not_authenticated";
    default:
      return "unknown";
  }
}

/**
 * Mint the key for one export. Called ONCE when a run starts, kept in the run's
 * state, and reused by every retry of that run's charge.
 *
 * Not derived from the run's sequence number: that counter restarts at 1 whenever
 * the panel reopens, so a key built from it would collide with yesterday's run and
 * the server would dutifully REPLAY that old charge — handing out a free export
 * and showing a stale balance. A random id per run is the only version of this
 * that is safe.
 */
export function newIdempotencyKey(): string {
  try {
    return `exp_${crypto.randomUUID()}`;
  } catch {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return `exp_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
  }
}

/**
 * Spend exactly one credit for one low-shipping export.
 *
 * `idempotencyKey` must be the SAME string for every attempt at the same export,
 * and different for a different export. Returns the updated usage row so the panel
 * can show the new balance immediately.
 *
 * Throws CreditError. `unavailable` is the one kind that means "try again" —
 * every other kind is the server's decision and retrying will not change it.
 */
export async function spendExportCredit(
  action = "Low-shipping image",
  idempotencyKey?: string,
): Promise<Usage> {
  const key = idempotencyKey ?? newIdempotencyKey();

  // A breadcrumb, not a lock: it lets a later retry recognise its own key, and
  // gives the storage inspector something to read when a charge is disputed.
  await rememberClaim(key, false);

  const result = await callBackend<CreditResponse>(API.credit, {
    body: {
      device_id: await deviceId(),
      idempotency_key: key,
      action,
    },
    // Retrying with the same key is free, so retry generously — a timeout here is
    // exactly the case idempotency was built for.
    attempts: 3,
    timeoutMs: 20_000,
  });

  if (isFailure(result)) {
    if (result.transport === "unauthenticated" || result.transport === "no_session") {
      throw new CreditError("not_authenticated", MESSAGES.not_authenticated);
    }
    throw new CreditError("unavailable", MESSAGES.unavailable);
  }

  const body = result.data;
  if (!body.ok) {
    const kind = kindFor(body.code);
    throw new CreditError(kind, body.error || MESSAGES[kind]);
  }

  await rememberClaim(key, true);

  // The endpoint returns only the four fields the panel renders. The rest of the
  // Usage row (id, user_id) is not sent — it is the seller's own row and the panel
  // has it already from loadAccount(); synthesising the shape here keeps the
  // existing onUsage() plumbing unchanged.
  return {
    id: "",
    user_id: "",
    credits_remaining: body.usage.credits_remaining,
    images_used: body.usage.images_used,
    period_start: body.usage.period_start,
    period_end: body.usage.period_end,
  };
}

/** Keep the last few claims, newest kept, so this never grows unbounded. */
const CLAIMS_KEPT = 20;

async function rememberClaim(key: string, settled: boolean): Promise<void> {
  await update(KEYS.creditClaims, (claims) => {
    const next = { ...claims, [key]: { at: Date.now(), settled } };
    const entries = Object.entries(next).sort((a, b) => b[1].at - a[1].at);
    return Object.fromEntries(entries.slice(0, CLAIMS_KEPT));
  });
}
