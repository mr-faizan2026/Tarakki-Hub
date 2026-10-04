import { authenticate, fail, json, preflight, rateLimit, readJson, str } from "@/lib/extension-api";
import type { ExtensionDeviceInfo, HeartbeatResponse, KillSwitchMap } from "@/lib/extension-protocol";

/**
 * POST /api/extension/heartbeat
 *
 * Body: { device_id: string, version?: string }
 *
 * The periodic "am I still allowed, and has anything changed" call — roughly
 * every 15 minutes from a chrome.alarms tick, plus once whenever the side panel
 * opens. One round trip because the extension needs all of it at once and MV3
 * gives no guarantee it will be alive for a second request.
 *
 * It is also the only thing that stamps `last_seen_at`, which is what makes the
 * device list in the panel mean anything.
 */
export const dynamic = "force-dynamic";

export function OPTIONS(request: Request): Response {
  return preflight(request);
}

export async function POST(request: Request): Promise<Response> {
  const caller = await authenticate(request);
  if (!caller) {
    return fail(request, "not_authenticated", "Sign in again to continue.", 401);
  }

  const body = await readJson(request);
  const deviceId = str(body.device_id, 64);
  if (!deviceId) {
    return fail(request, "bad_request", "No device id was sent.", 400);
  }

  // 15-minute alarms plus panel opens plus a retry or two. Anything beyond this
  // is a loop, and a loop must not be able to generate load indefinitely.
  if (!rateLimit(`heartbeat:${caller.user.id}:${deviceId}`, 40, 60_000)) {
    return fail(request, "rate_limited", "Too many heartbeats.", 429);
  }

  const { data, error } = await caller.db.rpc("extension_heartbeat", {
    p_user: caller.user.id,
    p_device_id: deviceId,
    p_version: str(body.version, 20),
  });

  if (error) {
    return fail(request, "server_error", "Couldn't reach TarakkiHub.", 502);
  }

  const h = (data ?? {}) as Record<string, unknown>;

  return json<HeartbeatResponse>(request, {
    ok: true,
    device_ok: h.device_ok === true,
    blocked: h.blocked === true,
    plan: typeof h.plan === "string" ? h.plan : "free",
    has_active_plan: h.has_active_plan === true,
    credits_remaining: Number(h.credits_remaining ?? 0),
    images_used: Number(h.images_used ?? 0),
    device_limit: Number(h.device_limit ?? 1),
    devices: (h.devices ?? []) as ExtensionDeviceInfo[],
    adapter_config_version: Number(h.adapter_config_version ?? 0),
    min_version: typeof h.min_version === "string" ? h.min_version : "0.0.0",
    latest_version: typeof h.latest_version === "string" ? h.latest_version : "0.0.0",
    kill_switches: (h.kill_switches ?? {}) as KillSwitchMap,
  });
}
