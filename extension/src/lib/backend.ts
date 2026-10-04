import { getSupabase } from "./supabase";

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  THE BACKEND CLIENT — one way to call /api/extension/*
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Three things every caller needs and none of them should reimplement:
 *
 *  1. THE TOKEN. Every call carries the Supabase access token as a bearer header,
 *     never a cookie. The token is read fresh from the session on each call, so a
 *     worker that woke up after an hour asleep refreshes rather than sending a
 *     dead one.
 *
 *  2. THE TWO KINDS OF FAILURE, KEPT APART. A 200 with `{ ok: false, code }` is a
 *     DOMAIN answer — "you are at your device limit", "no credits" — and is
 *     returned to the caller as data. Anything else (offline, 5xx, a 401, a body
 *     that isn't JSON) is a TRANSPORT failure and comes back as
 *     `{ transport: <reason> }`. Collapsing the two is how "sign out one of your
 *     devices" turns into "something went wrong", which no seller can act on.
 *
 *  3. RETRIES THAT KNOW WHEN TO STOP. Network errors and 5xx are retried with
 *     backoff. A 401 is not — a dead session is not going to recover by asking
 *     again, and retrying it just delays the sign-in screen. A 429 is not either:
 *     the server is telling us to stop.
 *
 *  ── WHY THE TOKEN NEVER REACHES A CONTENT SCRIPT ──────────────────────────
 *  Nothing in this file is imported by content/. The content script runs beside
 *  Meesho's own JavaScript, and while the isolated world protects it from the
 *  page, the simplest way to never leak a seller's session into a third-party
 *  page is to never put it there. Health events travel content → background and
 *  are sent from the background, which is where this client lives.
 */

export type BackendFailure =
  /** No network, DNS failure, the fetch itself threw. */
  | { transport: "offline" }
  /** The session is gone or rejected — the panel must sign in again. */
  | { transport: "unauthenticated" }
  /** 5xx, or a 200 that wasn't JSON. Retried, then surfaced. */
  | { transport: "server" }
  /** The server asked us to slow down. */
  | { transport: "rate_limited" }
  /** There is no signed-in session to call with at all. */
  | { transport: "no_session" };

export type BackendResult<T> = { data: T } | BackendFailure;

export function isFailure<T>(result: BackendResult<T>): result is BackendFailure {
  return "transport" in result;
}

/** Plain-English, seller-facing. These appear in the panel verbatim. */
export const FAILURE_MESSAGES: Record<BackendFailure["transport"], string> = {
  offline: "You appear to be offline. TarakkiHub will catch up when you reconnect.",
  unauthenticated: "Your session expired. Sign in again to continue.",
  server: "TarakkiHub is having trouble right now. Try again in a moment.",
  rate_limited: "Too many requests just now. Wait a minute and try again.",
  no_session: "Sign in to continue.",
};

export function failureMessage(failure: BackendFailure): string {
  return FAILURE_MESSAGES[failure.transport];
}

/* ─── the request ───────────────────────────────────────────────────────── */

type RequestOptions = {
  /** POST body. Omit for a GET. */
  body?: unknown;
  /** Total attempts including the first. 1 = no retry. */
  attempts?: number;
  /** Abandon the whole call (including retries) after this long. */
  timeoutMs?: number;
  /** Skip the bearer token entirely — only /config, which is public. */
  anonymous?: boolean;
};

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_TIMEOUT_MS = 12_000;

/** 0.4s, 1.2s, 3.6s — long enough to outlast a Wi-Fi handover, short enough
 *  that a seller waiting on an export doesn't think it hung. */
const BACKOFF_MS = [400, 1200, 3600];

async function accessToken(): Promise<string | null> {
  try {
    const { data } = await getSupabase().auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Call one endpoint. `T` is the response type from backend-types.ts.
 *
 * The response is NOT validated beyond "it parsed as JSON" — these endpoints are
 * ours, and the one payload that comes from a human (the adapter config) is
 * schema-checked separately in remote-config.ts, where getting it wrong matters.
 */
export async function callBackend<T>(
  url: string,
  options: RequestOptions = {},
): Promise<BackendResult<T>> {
  const attempts = Math.max(1, options.attempts ?? DEFAULT_ATTEMPTS);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;

  let token: string | null = null;
  if (!options.anonymous) {
    token = await accessToken();
    if (!token) return { transport: "no_session" };
  }

  let lastFailure: BackendFailure = { transport: "server" };

  for (let attempt = 0; attempt < attempts; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return lastFailure;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remaining);

    try {
      const response = await fetch(url, {
        method: options.body === undefined ? "GET" : "POST",
        headers: {
          ...(options.body === undefined ? {} : { "content-type": "application/json" }),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        // These are cross-origin calls to our own backend with a bearer token.
        // `omit` makes it explicit that no cookie is ever involved.
        credentials: "omit",
        cache: "no-store",
        signal: controller.signal,
      });

      if (response.status === 401 || response.status === 403) {
        return { transport: "unauthenticated" };
      }
      if (response.status === 429) {
        return { transport: "rate_limited" };
      }
      if (response.status >= 500) {
        lastFailure = { transport: "server" };
      } else {
        // 2xx and 4xx both carry a JSON envelope the caller understands; a 4xx
        // here means the request was malformed, which is a bug, not an outage.
        try {
          return { data: (await response.json()) as T };
        } catch {
          lastFailure = { transport: "server" };
        }
      }
    } catch (err) {
      // AbortError means we hit the deadline; anything else is a dead network.
      lastFailure =
        err instanceof Error && err.name === "AbortError"
          ? { transport: "server" }
          : { transport: "offline" };
    } finally {
      clearTimeout(timer);
    }

    if (attempt < attempts - 1) {
      const wait = Math.min(BACKOFF_MS[attempt] ?? 3600, Math.max(0, deadline - Date.now()));
      if (wait <= 0) break;
      await sleep(wait);
    }
  }

  return lastFailure;
}
