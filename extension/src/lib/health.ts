import { KEYS, read, update, write, type QueuedHealthEvent } from "./storage";
import type { HealthStatus } from "./backend-types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  ADAPTER HEALTH REPORTING — "can the adapter still find what it needs?"
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Meesho changes its supplier panel without telling anyone. Before this, the
 *  first sign was a support message days later; the point of this channel is that
 *  /admin shows a check dropping from 98% found to 3% found within the hour, and
 *  the fix is a selector edit in adapter_config rather than a release.
 *
 *  ── WHAT IS IN AN EVENT. ALL OF IT. ───────────────────────────────────────
 *      feature     "shipping" | "form" | "fill" | "image" | "config"
 *      check_key   "figure_found", "form_root", "field_detect", …
 *      status      "ok" | "not_found" | "error"
 *      path        the URL path with every id segment replaced by ":id"
 *      detail      a short adapter-side reason, e.g. "listbox empty"
 *
 *  NOT in an event, and there is no code path that could put them there: field
 *  labels, field values, product names, prices, SKUs, the seller's shop name or
 *  code, image bytes, URLs with query strings, or anything typed into the form.
 *  `report()` below accepts exactly the five fields above and `sanitisePath`
 *  strips the rest of the URL. The API route re-filters, and so does the SQL.
 *  Three gates, because a health channel that quietly becomes a data channel is
 *  the kind of thing nobody notices until it matters.
 *
 *  ── WHY THIS FILE HAS NO SENDER IN IT ─────────────────────────────────────
 *  It is imported by the CONTENT SCRIPT, which runs beside Meesho's own
 *  JavaScript. Sending requires the seller's Supabase access token, and the
 *  simplest way to never leak a session into a third-party page is for the module
 *  that runs in that page to have no code path to it. Queueing lives here (plain
 *  chrome.storage); sending lives in health-flush.ts, which only the background
 *  worker imports.
 *
 *  ── THE THREE VOLUME CONTROLS ─────────────────────────────────────────────
 *  1. DEDUPLICATION per page load. A MutationObserver on a React form fires
 *     hundreds of times; the same (feature, check, status, path) is recorded once
 *     per page load, keyed in storage so a service-worker restart doesn't reset it.
 *  2. A QUEUE CAP. 200 events, oldest dropped. Telemetry must never be the thing
 *     that fills a seller's storage quota.
 *  3. RATE LIMITING on the flush (health-flush.ts). At most one flush a minute,
 *     and the server drops a batch over its own budget without complaining.
 *
 *  ── AND THE RULE THAT OUTRANKS ALL OF THEM ────────────────────────────────
 *  Telemetry never bothers the seller and never fails an action. Every failure in
 *  this file is swallowed. If the backend is down, events sit in the queue; if the
 *  queue overflows, events are lost. Neither is worth a single pixel of the panel.
 */

const QUEUE_MAX = 200;
const SEEN_TTL_MS = 10 * 60 * 1000;

/* ─── path sanitising ───────────────────────────────────────────────────── */

/**
 * Strip identifiers out of a URL path.
 *
 * Meesho's supplier URLs carry the seller's own shop code and catalog ids
 * ("/panel/v3/new/catalog/MYSHOP123/single"), and a shop code identifies a
 * business. Anything with a digit in it, and anything implausibly long, becomes
 * ":id". Query strings and fragments go entirely — they are where ids hide.
 *
 * Exported because the content script calls it before handing a path over, and
 * the unit tests check it directly: this is the function standing between a
 * health event and a seller's shop name.
 */
export function sanitisePath(href: string): string {
  let path: string;
  try {
    path = new URL(href, "https://supplier.meesho.com").pathname;
  } catch {
    path = String(href ?? "").split("?")[0].split("#")[0];
  }
  return path
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

/* ─── recording ─────────────────────────────────────────────────────────── */

export type HealthReport = {
  feature: string;
  checkKey: string;
  status: HealthStatus;
  /** A full href is fine — it is sanitised here. */
  url?: string;
  detail?: string;
};

/**
 * Queue one check result. Deduplicated per page load.
 *
 * `pageKey` identifies the page load being reported on: the content script passes
 * its own boot id, so the same check on a later navigation is reported again
 * (which is what makes "it broke after they clicked Next" visible) while a
 * MutationObserver firing 400 times in one load reports once.
 */
export async function report(entry: HealthReport, pageKey: string): Promise<void> {
  try {
    const path = entry.url ? sanitisePath(entry.url) : undefined;
    const dedupe = `${pageKey}|${entry.feature}|${entry.checkKey}|${entry.status}|${path ?? ""}`;

    const now = Date.now();
    const seen = await read(KEYS.healthSeen);
    if (seen[dedupe] && now - seen[dedupe] < SEEN_TTL_MS) return;

    // Prune while we are here; this map is the one thing that grows with use.
    const prunedSeen: Record<string, number> = { [dedupe]: now };
    for (const [key, at] of Object.entries(seen)) {
      if (now - at < SEEN_TTL_MS) prunedSeen[key] = at;
    }
    await write(KEYS.healthSeen, prunedSeen);

    const event: QueuedHealthEvent = {
      at: now,
      feature: entry.feature.slice(0, 40),
      check_key: entry.checkKey.slice(0, 60),
      status: entry.status,
      ...(path ? { path } : {}),
      ...(entry.detail ? { detail: entry.detail.slice(0, 200) } : {}),
    };

    await update(KEYS.healthQueue, (queue) => {
      const next = [...queue, event];
      // Oldest first out: a current break matters more than a fixed one.
      return next.length > QUEUE_MAX ? next.slice(next.length - QUEUE_MAX) : next;
    });
  } catch {
    /* telemetry never fails an action */
  }
}

/** Several checks at once, for the page self-test. */
export async function reportAll(entries: HealthReport[], pageKey: string): Promise<void> {
  for (const entry of entries) await report(entry, pageKey);
}

