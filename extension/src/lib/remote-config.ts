import { API } from "./config";
import { callBackend, isFailure } from "./backend";
import { validateAdapterConfig, validateKillSwitches } from "./adapter-schema";
import { KEYS, read, write, type CachedAdapterConfig } from "./storage";
import type { ConfigResponse } from "./backend-types";

/**
 * Fetching and caching the remote adapter config. The SCHEMA lives next door in
 * adapter-schema.ts — split out because it is pure logic with no imports beyond
 * zod, which lets the fixture tests exercise it without dragging a Supabase
 * client into the test bundle. This half is background-only (see backend.ts).
 */


export type ConfigFetchOutcome =
  | { kind: "updated"; version: number }
  | { kind: "unchanged"; version: number }
  | { kind: "invalid"; reason: string }
  | { kind: "failed" };

/**
 * Fetch, validate and cache the remote config.
 *
 * `force` skips the "same version, nothing to do" shortcut — used on startup,
 * where the cached version might have been written by a build with a different
 * set of bundled defaults.
 *
 * On ANY failure the cache is left exactly as it was. The adapter then keeps
 * using whatever it has (a previous remote config, or the bundled defaults), and
 * that is the whole fallback story: there is no state in which the adapter has no
 * configuration.
 */
export async function fetchAdapterConfig(force = false): Promise<ConfigFetchOutcome> {
  const cached = await read(KEYS.adapterConfig);

  // The config endpoint is public (it holds no user data), so this works on a
  // signed-out panel — which is what lets the "please update" screen appear on a
  // build too old to sign in.
  const result = await callBackend<ConfigResponse>(API.config, {
    anonymous: true,
    attempts: 2,
  });
  if (isFailure(result)) return { kind: "failed" };

  const body = result.data;
  if (!body.ok) return { kind: "failed" };

  await write(KEYS.killSwitches, validateKillSwitches(body.kill_switches));

  // The version floor, cached where a SIGNED-OUT panel can read it. This is the
  // whole reason /config is public: a build below min_version must be able to say
  // "please update" without first managing to sign in.
  await write(KEYS.versionGates, {
    checkedAt: Date.now(),
    minVersion: typeof body.min_version === "string" ? body.min_version : "0.0.0",
    latestVersion: typeof body.latest_version === "string" ? body.latest_version : "0.0.0",
  });

  const version = Number(body.adapter_config_version ?? 0);
  if (!force && cached && cached.version === version) {
    return { kind: "unchanged", version };
  }

  const checked = validateAdapterConfig(body.adapter_config);
  if (!checked.ok) return { kind: "invalid", reason: checked.reason };

  const next: CachedAdapterConfig = {
    version,
    fetchedAt: Date.now(),
    config: checked.config,
  };
  await write(KEYS.adapterConfig, next);
  return { kind: "updated", version };
}

/**
 * Is the cached config older than what the heartbeat just reported?
 * This is the trigger for a re-fetch, and the reason every admin edit bumps the
 * version: without a bump nothing here ever asks again.
 */
export async function configNeedsRefresh(reportedVersion: number): Promise<boolean> {
  const cached = await read(KEYS.adapterConfig);
  if (!cached) return true;
  return reportedVersion > cached.version;
}
