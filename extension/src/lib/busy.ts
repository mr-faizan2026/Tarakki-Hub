import { KEYS, read, write } from "./storage";

/**
 * "Is the extension in the middle of something the seller would hate to lose?"
 *
 * Two callers set it: a quoting/export run in the image generator, and an
 * autofill run. One caller reads it: the background's `onUpdateAvailable`
 * handler, which must not reload the extension — tearing down the service worker,
 * the panel and every content script — while a fill is half-written into a
 * seller's catalog form or an export is mid-charge.
 *
 * ── WHY IT LIVES IN STORAGE AND CARRIES A TIMESTAMP ───────────────────────
 * In storage because the reader is a service worker Chrome restarts at will, and
 * a flag in its memory would read `false` after every restart — precisely during
 * the long operations this is meant to protect.
 *
 * With a timestamp because the writer is the side panel, which the seller can
 * close mid-run. A plain boolean would then be stuck at `true` forever and the
 * extension would never apply another update. The stale window below is longer
 * than any real run (a 20-image quoting pass is a couple of minutes) and short
 * enough that a forgotten flag costs one deferred update cycle, not a pinned
 * version.
 */

const STALE_MS = 10 * 60 * 1000;

/** Call when a run starts. Safe to call repeatedly — it just refreshes the clock. */
export async function markBusy(): Promise<void> {
  await write(KEYS.busy, true);
  await stampBusy(Date.now());
}

/** Call in a `finally`, so an error path cannot leave the flag set. */
export async function clearBusy(): Promise<void> {
  await write(KEYS.busy, false);
  await stampBusy(0);
}

/** True only when something is running AND said so recently. */
export async function isBusy(): Promise<boolean> {
  if (!(await read(KEYS.busy))) return false;
  const at = await busyStamp();
  return at > 0 && Date.now() - at < STALE_MS;
}

/* The stamp is a private sibling of KEYS.busy rather than a field on it, so the
 * boolean stays trivially readable from the storage inspector while debugging. */
const STAMP_KEY = "tk_busy_at";

async function stampBusy(at: number): Promise<void> {
  try {
    await chrome.storage.local.set({ [STAMP_KEY]: at });
  } catch {
    /* ignore */
  }
}

async function busyStamp(): Promise<number> {
  try {
    const got = await chrome.storage.local.get(STAMP_KEY);
    return Number(got?.[STAMP_KEY] ?? 0);
  } catch {
    return 0;
  }
}
