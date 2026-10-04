import { authenticate, fail, json, preflight, rateLimit, readJson, str } from "@/lib/extension-api";
import type { EventsResponse, HealthEvent, HealthStatus } from "@/lib/extension-protocol";

/**
 * POST /api/extension/events
 *
 * Adapter health checks, batched. Body:
 *   { device_id, version, events: [{ feature, check_key, status, path?, detail? }] }
 *
 * ── THE PRIVACY RULE, ENFORCED HERE ───────────────────────────────────────
 * This route reads exactly five fields off each event and discards the rest of
 * the object. It does not forward unknown keys, so a future adapter bug that
 * accidentally attaches a form value to an event cannot leak it through this
 * endpoint — the field simply never reaches the database.
 *
 * `path` is additionally re-sanitised here (id-like segments → ":id") rather than
 * trusted from the client. The extension already does it; this is the gate that
 * means it is true even if the extension's own stripping regresses.
 *
 * record_extension_events() in SQL filters once more. Three gates for one
 * promise is proportionate: a health channel that quietly turns into a
 * data-collection channel is the kind of thing nobody notices until it matters.
 */
export const dynamic = "force-dynamic";

const MAX_EVENTS = 50;
const ALLOWED_STATUS: HealthStatus[] = ["ok", "not_found", "error"];

export function OPTIONS(request: Request): Response {
  return preflight(request);
}

/**
 * Replace every segment that looks like an identifier with ":id".
 *
 * Meesho's supplier URLs carry a seller code and catalog ids
 * ("/panel/v3/new/catalog/MYSHOP123/single"), and a seller code is personal data.
 * Numbers, long alphanumerics, UUIDs and anything with a digit in it all go.
 */
function sanitisePath(raw: string | null): string | null {
  if (!raw) return null;
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  return path
    .split("?")[0]
    .split("#")[0]
    .split("/")
    .map((segment) => {
      if (!segment) return segment;
      if (/\d/.test(segment)) return ":id";
      if (segment.length > 24) return ":id";
      return segment;
    })
    .join("/")
    .slice(0, 200);
}

export async function POST(request: Request): Promise<Response> {
  const caller = await authenticate(request);
  if (!caller) {
    // Health reporting is best-effort: a signed-out extension drops its batch
    // rather than queueing it, so a 401 here is not something to retry.
    return fail(request, "not_authenticated", "Sign in again to continue.", 401);
  }

  const body = await readJson(request);
  const deviceId = str(body.device_id, 64);
  const version = str(body.version, 20);

  if (!rateLimit(`events:${caller.user.id}:${deviceId ?? "none"}`, 12, 60_000)) {
    // Dropped, not an error: the extension must never treat telemetry
    // backpressure as a reason to bother the seller.
    return json<EventsResponse>(request, { ok: true, accepted: 0 });
  }

  const raw = Array.isArray(body.events) ? body.events : [];
  const events: HealthEvent[] = [];
  const seen = new Set<string>();

  for (const item of raw.slice(0, MAX_EVENTS)) {
    if (!item || typeof item !== "object") continue;
    const e = item as Record<string, unknown>;
    const feature = str(e.feature, 40);
    const checkKey = str(e.check_key, 60);
    const status = str(e.status, 20) as HealthStatus | null;
    if (!feature || !checkKey || !status || !ALLOWED_STATUS.includes(status)) continue;

    // One row per (feature, check, status, path) per batch. The extension
    // deduplicates per page load too; this covers a batch that merged two loads.
    const path = sanitisePath(str(e.path, 240));
    const dedupe = `${feature}|${checkKey}|${status}|${path ?? ""}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    events.push({
      feature,
      check_key: checkKey,
      status,
      ...(path ? { path } : {}),
      ...(str(e.detail, 200) ? { detail: str(e.detail, 200)! } : {}),
    });
  }

  if (!events.length) return json<EventsResponse>(request, { ok: true, accepted: 0 });

  const { data, error } = await caller.db.rpc("record_extension_events", {
    p_user: caller.user.id,
    p_device_id: deviceId,
    p_version: version,
    p_events: events,
  });

  if (error) {
    return fail(request, "server_error", "Couldn't record events.", 502);
  }

  return json<EventsResponse>(request, { ok: true, accepted: Number(data ?? 0) });
}
