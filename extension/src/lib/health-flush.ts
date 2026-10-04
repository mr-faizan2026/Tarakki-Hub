import { API } from "./config";
import { callBackend, isFailure } from "./backend";
import { deviceId } from "./device";
import { currentVersion } from "./version";
import { KEYS, read, update, write } from "./storage";
import type { EventsResponse, HealthEvent } from "./backend-types";

/**
 * Sending the health queue. BACKGROUND WORKER ONLY.
 *
 * Split from health.ts on purpose: the content script queues events and must
 * never import anything that can reach the seller's Supabase session (see the
 * header of health.ts). This half holds the token path, so nothing in content/
 * imports it.
 *
 * ── WHY A FAILED FLUSH KEEPS THE EVENTS ───────────────────────────────────
 * The interesting case is "Meesho broke AND the seller's connection is flaky",
 * and throwing the batch away there loses exactly the evidence that would have
 * explained it. The queue cap in health.ts bounds the damage instead.
 *
 * ── WHY A SIGNED-OUT FLUSH DROPS THEM ─────────────────────────────────────
 * The endpoint needs a session to attribute an event to an account. Holding a
 * queue across a sign-out would mean sending one seller's checks under the next
 * seller's session — wrong, and a privacy problem. Signed out, the batch goes.
 */

const FLUSH_MIN_GAP_MS = 60 * 1000;
const BATCH_MAX = 50;

/**
 * Last flush time, in storage rather than a module variable: MV3 restarts the
 * worker constantly, and a module-level timestamp would reset to 0 on every
 * restart, making the rate limit do nothing at all.
 */
const LAST_FLUSH_KEY = "tk_health_last_flush";

async function lastFlushAt(): Promise<number> {
  try {
    const got = await chrome.storage.local.get(LAST_FLUSH_KEY);
    return Number(got?.[LAST_FLUSH_KEY] ?? 0);
  } catch {
    return 0;
  }
}

async function markFlushed(at: number): Promise<void> {
  try {
    await chrome.storage.local.set({ [LAST_FLUSH_KEY]: at });
  } catch {
    /* ignore */
  }
}

/** Send what is queued. Returns how many the server accepted. Never throws. */
export async function flushHealth(force = false): Promise<number> {
  try {
    const now = Date.now();
    if (!force && now - (await lastFlushAt()) < FLUSH_MIN_GAP_MS) return 0;

    const queue = await read(KEYS.healthQueue);
    if (!queue.length) return 0;
    await markFlushed(now);

    const batch = queue.slice(0, BATCH_MAX);
    const events: HealthEvent[] = batch.map(({ at: _at, ...event }) => event);

    const result = await callBackend<EventsResponse>(API.events, {
      body: { device_id: await deviceId(), version: currentVersion(), events },
      attempts: 1,
      timeoutMs: 8000,
    });

    if (isFailure(result)) {
      if (result.transport === "no_session" || result.transport === "unauthenticated") {
        await write(KEYS.healthQueue, []);
      }
      return 0;
    }

    // Drop exactly what we sent; anything queued while the request was in flight
    // stays for the next flush.
    await update(KEYS.healthQueue, (current) => current.slice(batch.length));
    return result.data.ok ? result.data.accepted : 0;
  } catch {
    return 0;
  }
}
