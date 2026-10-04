import { authenticate, fail, json, preflight, rateLimit, readJson, str } from "@/lib/extension-api";
import type { ExtensionDeviceInfo, RegisterDeviceResponse } from "@/lib/extension-protocol";

/**
 * POST /api/extension/register-device
 *
 * Called once after every sign-in. Body:
 *   { device_id: string, label?: string, version?: string }
 *
 * The device limit is enforced in SQL (register_extension_device), not here, and
 * hitting it is a 200 with `ok: false, code: "device_limit"` carrying the list of
 * active installs. The panel renders that list and lets the seller sign one out;
 * there is deliberately no path through this route that registers a device over
 * the cap.
 *
 * `device_id` comes from the request, but the USER never does — it is taken from
 * the verified bearer token, so one account cannot register a device onto
 * another.
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
    return json<RegisterDeviceResponse>(request, {
      ok: false,
      code: "bad_request",
      error: "No device id was sent.",
    });
  }

  // A sign-in loop should not be able to hammer this.
  if (!rateLimit(`register:${caller.user.id}`, 20, 60_000)) {
    return fail(request, "rate_limited", "Too many attempts. Wait a minute.", 429);
  }

  const { data, error } = await caller.db.rpc("register_extension_device", {
    p_user: caller.user.id,
    p_device_id: deviceId,
    p_label: str(body.label, 80),
    p_version: str(body.version, 20),
  });

  if (error) {
    return fail(request, "server_error", "Couldn't register this device.", 502);
  }

  const envelope = (data ?? {}) as {
    ok?: boolean;
    code?: string;
    limit?: number;
    devices?: ExtensionDeviceInfo[];
  };

  if (envelope.ok) {
    return json<RegisterDeviceResponse>(request, {
      ok: true,
      limit: envelope.limit ?? 1,
      devices: envelope.devices ?? [],
    });
  }

  if (envelope.code === "device_limit") {
    return json<RegisterDeviceResponse>(request, {
      ok: false,
      code: "device_limit",
      limit: envelope.limit ?? 1,
      devices: envelope.devices ?? [],
    });
  }

  if (envelope.code === "account_blocked") {
    return json<RegisterDeviceResponse>(request, {
      ok: false,
      code: "account_blocked",
      error: "This account has been blocked. Contact support.",
    });
  }

  return json<RegisterDeviceResponse>(request, {
    ok: false,
    code: "bad_request",
    error: "Couldn't register this device.",
  });
}
