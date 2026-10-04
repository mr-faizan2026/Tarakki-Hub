import "server-only";

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  /api/extension/* — the shared plumbing
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Every extension endpoint has the same shape:
 *
 *    1. answer the CORS preflight (the caller's origin is chrome-extension://…,
 *       which is cross-origin to this app no matter where it is deployed);
 *    2. verify the caller's Supabase JWT — sent as `Authorization: Bearer …`,
 *       never as a cookie, so these routes are immune to CSRF and `*` is a safe
 *       default origin;
 *    3. do the work with the SERVICE ROLE, through the SQL functions in
 *       0004_extension.sql.
 *
 *  ── WHY THE SERVICE ROLE AND NOT THE CALLER'S OWN TOKEN ───────────────────
 *  Because the things these endpoints decide are exactly the things the caller
 *  must not be able to decide: how many devices it may have, whether this export
 *  has already been charged, whether a feature is switched off. A limit the
 *  client evaluates is not a limit. The JWT check above is what ties a
 *  service-role write to one specific user, and no endpoint here ever takes a
 *  user id from the request body.
 *
 *  ── RATE LIMITING ────────────────────────────────────────────────────────
 *  `rateLimit()` is a per-process sliding window. On a single Node instance that
 *  is a real limit; across several it is a per-instance one. It exists to stop a
 *  looping extension from flooding `extension_events`, not to stop an attacker —
 *  the authentication above does that. Swap in a shared store if this ever runs
 *  wide.
 */

/* ─── CORS ──────────────────────────────────────────────────────────────── */

/**
 * Comma-separated list of exact origins allowed to call these routes, e.g.
 *   EXTENSION_ALLOWED_ORIGINS=chrome-extension://abcdefghijklmnop...
 *
 * Unset (the default) allows any origin. That is safe here because these routes
 * are authenticated by a bearer token and read no cookies, so a hostile page
 * calling them gets exactly as far as its own Supabase session would — nowhere.
 * Set it once the extension's Web Store id is known; it costs nothing and closes
 * the door on a token leaked into another extension.
 */
function allowList(): string[] {
  return (process.env.EXTENSION_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function allowedOrigin(request: Request): string {
  const origin = request.headers.get("origin");
  const list = allowList();
  if (!list.length) return origin ?? "*";
  if (origin && list.includes(origin)) return origin;
  // Refused origins still get a header, just not theirs — the browser then
  // blocks the response, which is the honest outcome.
  return list[0];
}

export function corsHeaders(request: Request): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": allowedOrigin(request),
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "600",
    // The answers depend on who is asking; nothing here may be cached by a CDN.
    "Cache-Control": "no-store",
    Vary: "Origin, Authorization",
  };
}

/** Shared OPTIONS handler. Re-export it from every route file. */
export function preflight(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

/* ─── responses ─────────────────────────────────────────────────────────── */

/**
 * Generic on purpose: every route states which protocol type it is answering
 * with, so a renamed field in extension-protocol.ts fails the build here rather
 * than at the extension's runtime.
 */
export function json<T>(request: Request, body: T, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(request) });
}

export function fail(
  request: Request,
  code: string,
  message: string,
  status = 400,
): Response {
  return json(request, { ok: false, code, error: message }, status);
}

/* ─── authentication ────────────────────────────────────────────────────── */

export type ExtensionCaller = {
  user: User;
  /** Service-role client. Only reachable after the JWT above verified. */
  db: SupabaseClient<Database>;
};

/**
 * Verify the bearer token with Supabase and hand back the user plus a
 * service-role client. Returns null for anything that isn't a live session —
 * the caller turns that into a 401, which the extension treats as "sign in
 * again" rather than as an outage.
 */
export async function authenticate(
  request: Request,
): Promise<ExtensionCaller | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";
  if (!token) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;

  // An anon client is the right tool for validating a user token: it asks
  // Supabase's own /auth/v1/user endpoint, so an expired or revoked token fails
  // here rather than being trusted on its claims.
  const auth = createClient<Database>(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await auth.auth.getUser(token);
  if (error || !data.user) return null;

  return { user: data.user, db: createAdminClient() };
}

/* ─── request bodies ────────────────────────────────────────────────────── */

/** Parse a JSON body, tolerating an empty one. Never throws. */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const text = await request.text();
    if (!text) return {};
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function str(value: unknown, maxLen = 200): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLen) : null;
}

/* ─── rate limiting ─────────────────────────────────────────────────────── */

const windows = new Map<string, number[]>();

/**
 * True when this key is still inside its budget. `key` should identify the
 * install (user + device), not the IP: two sellers behind one shop router are
 * not one caller.
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (windows.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    windows.set(key, hits);
    return false;
  }
  hits.push(now);
  windows.set(key, hits);

  // The map would otherwise grow for the lifetime of the process.
  if (windows.size > 5000) {
    for (const [k, times] of windows) {
      if (!times.some((t) => now - t < windowMs)) windows.delete(k);
    }
  }
  return true;
}

/* ─── settings ──────────────────────────────────────────────────────────── */

/** Read several app_settings rows at once, as a plain map. */
export async function readSettings(
  db: SupabaseClient<Database>,
  keys: string[],
): Promise<Record<string, unknown>> {
  const { data } = await db.from("app_settings").select("key, value").in("key", keys);
  const out: Record<string, unknown> = {};
  for (const row of data ?? []) out[row.key] = row.value;
  return out;
}

/** app_settings stores scalars as JSON, so "0.2.0" arrives quoted. */
export function settingString(value: unknown, fallback: string): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return fallback;
}
