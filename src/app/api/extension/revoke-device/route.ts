import { authenticate, fail, json, preflight, rateLimit, readJson, str } from "@/lib/extension-api";
import type { ExtensionDeviceInfo, RevokeDeviceResponse } from "@/lib/extension-protocol";

/**
 * POST /api/extension/revoke-device
 *
 * Body: { device_id: string } — one of the caller's OWN devices. The user id
 * comes from the bearer token, so this can only ever sign out an install
 * belonging to the signed-in account.
 *
 * Revoking the install you are calling from is allowed and sensible ("sign this
 * computer out"). The revoked install discovers it at its next heartbeat
 * (device_ok = false) and signs itself out; in the meantime it still cannot
 * spend a credit, because consume_credit_for() re-checks the row.
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
    return json<RevokeDeviceResponse>(request, {
      ok: false,
      code: "bad_request",
      error: "No device id was sent.",
    });
  }

  if (!rateLimit(`revoke:${caller.user.id}`, 30, 60_000)) {
    return fail(request, "rate_limited", "Too many attempts. Wait a minute.", 429);
  }

  const { data, error } = await caller.db.rpc("revoke_extension_device", {
    p_user: caller.user.id,
    p_device_id: deviceId,
  });

  if (error) {
    return fail(request, "server_error", "Couldn't sign that device out.", 502);
  }

  const envelope = (data ?? {}) as { revoked?: boolean; devices?: ExtensionDeviceInfo[] };
  return json<RevokeDeviceResponse>(request, {
    ok: true,
    revoked: envelope.revoked === true,
    devices: envelope.devices ?? [],
  });
}
