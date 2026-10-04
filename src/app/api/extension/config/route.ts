import { createAdminClient } from "@/lib/supabase/admin";
import {
  corsHeaders,
  json,
  preflight,
  rateLimit,
  readSettings,
  settingString,
} from "@/lib/extension-api";
import type {
  AdapterConfigPayload,
  ConfigResponse,
  KillSwitchMap,
} from "@/lib/extension-protocol";

/**
 * GET /api/extension/config
 *
 * The Meesho adapter's remote half, the kill switches, and the version floor.
 *
 * ── WHY THIS ONE IS UNAUTHENTICATED ───────────────────────────────────────
 * Deliberately. It holds no user data of any kind: CSS/ARIA selectors, label
 * words, timings, three booleans and two version strings. Making it public is
 * what lets the two screens that must work BEFORE sign-in actually work —
 * the blocking "please update TarakkiHub" screen, and a kill-switch message when
 * a feature has been paused. An update floor the seller can only see after
 * signing in is useless on the build that is too old to sign in.
 *
 * It is still rate-limited per caller, and it is `no-store` (see corsHeaders) so
 * a CDN can never serve a stale selector set after an emergency edit.
 *
 * ── WHAT THE EXTENSION DOES WITH IT ───────────────────────────────────────
 * Validates it against a schema, merges the valid parts over its bundled
 * defaults, caches it in chrome.storage.local. On anything invalid or
 * unreachable it uses the bundled defaults. The payload is DATA — never
 * evaluated, never injected as a script.
 */
export const dynamic = "force-dynamic";

export function OPTIONS(request: Request): Response {
  return preflight(request);
}

export async function GET(request: Request): Promise<Response> {
  // Unauthenticated, so the budget is per-origin-ish rather than per-device.
  // A real extension fetches this at startup and on a version bump, not in a
  // loop; this only has to stop a broken build from becoming a load generator.
  const key = request.headers.get("x-forwarded-for") ?? request.headers.get("origin") ?? "anon";
  if (!rateLimit(`config:${key}`, 60, 60_000)) {
    return new Response(
      JSON.stringify({ ok: false, code: "rate_limited", error: "Too many requests." }),
      { status: 429, headers: { ...corsHeaders(request), "content-type": "application/json" } },
    );
  }

  try {
    const db = createAdminClient();
    const settings = await readSettings(db, [
      "adapter_config",
      "kill_switches",
      "ext_min_version",
      "ext_latest_version",
    ]);

    const adapter = (settings.adapter_config ?? {}) as AdapterConfigPayload;

    return json<ConfigResponse>(request, {
      ok: true,
      adapter_config: adapter,
      adapter_config_version: Number(adapter.version ?? 0),
      kill_switches: (settings.kill_switches ?? {}) as KillSwitchMap,
      min_version: settingString(settings.ext_min_version, "0.0.0"),
      latest_version: settingString(settings.ext_latest_version, "0.0.0"),
    });
  } catch {
    // The extension falls back to its bundled defaults on any failure here, so a
    // 502 is strictly better than inventing an empty config that would read as
    // "the admin cleared every selector".
    return json<ConfigResponse>(
      request,
      { ok: false, code: "server_error", error: "Config unavailable." },
      502,
    );
  }
}
