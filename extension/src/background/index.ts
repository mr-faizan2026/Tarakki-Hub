import { MEESHO_MATCH } from "@/lib/config";
import { EMPTY_FORM_STATUS, type FormStatus } from "@/lib/autofill-types";
import {
  broadcast,
  sendToContent,
  type BgToContentRequest,
  type ContentToBg,
  type ContentToBgRequest,
  type PanelToBgRequest,
  type ShippingReading,
  type TabState,
} from "@/lib/messages";

/**
 * Background service worker — the orchestration hub. It owns NO Supabase state
 * (the side panel does, see lib/supabase.ts); its jobs are:
 *   1. Open the side panel when the toolbar icon is clicked.
 *   2. Track whether the focused tab is the Meesho supplier panel, and whether
 *      its content script has handshaked — the "Session connected" inputs.
 *   3. Relay live shipping readings and catalog-form status from the content
 *      script to the panel.
 *   4. Forward panel requests (re-read, apply image, live image quotes, category
 *      search, autofill capture / fill / field scan) to the content script.
 *   5. Perform the one privileged favour the content script asks for: a
 *      MAIN-world value write (chrome.scripting is not callable from a content
 *      script — see content/meesho/fill/main-world.ts).
 *
 * MV3 service workers get evicted, so all state below is rebuildable from
 * chrome.tabs on demand; the in-memory maps are just a fast cache.
 */

const EMPTY_SHIPPING: ShippingReading = { value: null, raw: null };

/** Tabs whose content script has announced itself this worker lifetime. */
const readyTabs = new Set<number>();
/** Last shipping reading pushed per tab. */
const shippingByTab = new Map<number, ShippingReading>();
/** Last catalog-form status pushed per tab (SPA routes change without a load). */
const formByTab = new Map<number, FormStatus>();

/* ─── side panel open-on-click ─────────────────────────────────────────── */

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {});
  void registerPanelProbe();
  void injectIntoOpenMeeshoTabs();
});

chrome.runtime.onStartup.addListener(() => {
  void chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {});
  void registerPanelProbe();
});

// Also on every worker wake. Registration is idempotent (it replaces its own
// id), and a probe that isn't installed is not a degraded mirror — it is no
// mirror at all, which now blocks quoting entirely. Cheap insurance.
void registerPanelProbe();

/* ─── the page-world pricing probe ─────────────────────────────────────── */

/**
 * public/panel-probe.js has to run in the PAGE's JavaScript world to see the
 * panel's own pricing calls — the requests every quote mirrors (see
 * content/panel-context.ts). It can't be a declared content script: CRXJS wraps
 * those in a loader that calls chrome.runtime.getURL(), which doesn't exist in
 * the MAIN world. Registering it here injects the file verbatim instead, at
 * document_start so it is installed before the panel's own bundle loads.
 */
const PROBE_SCRIPT_ID = "tarakkihub-panel-probe";

async function registerPanelProbe(): Promise<void> {
  try {
    // Registering an id that already exists throws, and a persisted
    // registration survives updates — so replace rather than add.
    await chrome.scripting
      .unregisterContentScripts({ ids: [PROBE_SCRIPT_ID] })
      .catch(() => {});
    await chrome.scripting.registerContentScripts([
      {
        id: PROBE_SCRIPT_ID,
        matches: ["https://supplier.meesho.com/*"],
        js: ["panel-probe.js"],
        runAt: "document_start",
        world: "MAIN",
        allFrames: false,
        persistAcrossSessions: true,
      },
    ]);
  } catch {
    // Without the probe, quoting falls back to the seller's typed price and
    // says so in the panel — degraded, but never silently wrong.
  }
}

/**
 * The panel is deliberately enabled on every tab, not just Meesho. That's the
 * only way the "Open your Meesho supplier panel" empty state (which lives IN the
 * panel) can be shown when the user opens it elsewhere. The panel adapts its
 * content to the active tab instead of Chrome hiding it with no explanation.
 */

/* ─── active-tab tracking → TAB_STATE broadcasts ───────────────────────── */

async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    return tab;
  } catch {
    return undefined;
  }
}

function isMeesho(url: string | undefined): boolean {
  return !!url && MEESHO_MATCH.test(url);
}

async function buildState(): Promise<TabState> {
  const tab = await getActiveTab();
  // `tab.url` is only populated for hosts we hold permission for (Meesho), so an
  // undefined url reliably means "not the supplier panel" here.
  if (tab?.id != null && isMeesho(tab.url)) {
    return {
      meeshoTabId: tab.id,
      contentReady: readyTabs.has(tab.id),
      shipping: shippingByTab.get(tab.id) ?? EMPTY_SHIPPING,
      form: formByTab.get(tab.id) ?? EMPTY_FORM_STATUS,
    };
  }
  return {
    meeshoTabId: null,
    contentReady: false,
    shipping: EMPTY_SHIPPING,
    form: EMPTY_FORM_STATUS,
  };
}

async function broadcastState(): Promise<void> {
  broadcast({ type: "TAB_STATE", state: await buildState() });
}

chrome.tabs.onActivated.addListener(() => void broadcastState());
chrome.windows.onFocusChanged.addListener(() => void broadcastState());
chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  // React to navigations and load completion; ignore noisy partial updates.
  if (changeInfo.url || changeInfo.status === "complete") {
    void broadcastState();
  }
});
chrome.tabs.onRemoved.addListener((tabId) => {
  readyTabs.delete(tabId);
  shippingByTab.delete(tabId);
  formByTab.delete(tabId);
  void broadcastState();
});

/* ─── message hub ──────────────────────────────────────────────────────── */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Messages carrying a sender.tab come from the content script; those without
  // come from the side panel (an extension page).
  if (sender.tab?.id != null) {
    const tabId = sender.tab.id;
    // The one content-script message that needs a real answer.
    if ((message as ContentToBgRequest)?.type === "BG_MAIN_WORLD_SET") {
      const req = message as ContentToBgRequest;
      setInMainWorld(tabId, req.marker, req.value)
        .then((ok) => sendResponse({ ok }))
        .catch(() => sendResponse({ ok: false }));
      return true; // async response
    }
    handleContentMessage(message as ContentToBg, tabId);
    sendResponse({ ok: true });
    return; // synchronous ack
  }

  handlePanelMessage(message as PanelToBgRequest)
    .then(sendResponse)
    .catch((err) => sendResponse({ ok: false, error: String(err) }));
  return true; // async response
});

/* ─── the MAIN-world write ─────────────────────────────────────────────── */

/**
 * Set a value on one element from the PAGE's own JavaScript world.
 *
 * The content script has already marked the element with `data-tk-fill="marker"`
 * (the DOM is shared between worlds, only the JS globals are isolated) and has
 * already tried the same write from its own world. This is the fallback for the
 * few React controls that ignore an isolated-world write.
 *
 * `func` is serialised and runs in the page, so it can reference nothing from
 * this file — everything it needs arrives in `args`.
 */
async function setInMainWorld(
  tabId: number,
  marker: string,
  value: string,
): Promise<boolean> {
  try {
    const url = (await chrome.tabs.get(tabId)).url;
    if (!isMeesho(url)) return false;

    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      args: [marker, value],
      func: (mark: string, text: string) => {
        const el = document.querySelector(`[data-tk-fill="${mark}"]`);
        if (!el) return false;

        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          const proto =
            el instanceof HTMLTextAreaElement
              ? HTMLTextAreaElement.prototype
              : HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
          if (setter) setter.call(el, text);
          else el.value = text;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return el.value === text;
        }

        if (el.getAttribute("contenteditable") === "true") {
          el.textContent = text;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return (el.textContent ?? "") === text;
        }

        return false;
      },
    });
    return result?.result === true;
  } catch {
    // Tab navigating, or scripting refused. The caller reports the field as
    // needing attention — it is never reported as filled.
    return false;
  }
}

function handleContentMessage(message: ContentToBg, tabId: number): void {
  switch (message.type) {
    case "CONTENT_READY":
      readyTabs.add(tabId);
      void broadcastState();
      break;
    case "CONTENT_PROBE_MISSING":
      // The tab was open before this extension version, so navigation-time
      // injection never ran for it. Inject the probe now rather than making the
      // seller work out that a reload is what's wrong.
      void injectProbeInto(tabId);
      break;
    case "SHIPPING_UPDATE":
      shippingByTab.set(tabId, message.shipping);
      // Only surface a reading for the tab the user is actually looking at.
      void (async () => {
        const active = await getActiveTab();
        if (active?.id === tabId) {
          broadcast({ type: "SHIPPING_UPDATE", shipping: message.shipping });
          broadcast({ type: "TAB_STATE", state: await buildState() });
        }
      })();
      break;
    case "FORM_STATUS_UPDATE":
      formByTab.set(tabId, message.status);
      void (async () => {
        const active = await getActiveTab();
        if (active?.id === tabId) {
          broadcast({ type: "TAB_STATE", state: await buildState() });
        }
      })();
      break;
    case "FILL_PROGRESS_UPDATE":
      // Progress belongs to the run the panel started, so it is relayed
      // regardless of which tab currently has focus — a seller who clicks away
      // mid-fill should still see it finish.
      broadcast({ type: "FILL_PROGRESS", progress: message.progress });
      break;
  }
}

async function handlePanelMessage(
  message: PanelToBgRequest,
): Promise<unknown> {
  switch (message.type) {
    case "GET_STATE":
      return buildState();

    case "REREAD_SHIPPING": {
      const tab = await getActiveTab();
      if (tab?.id == null || !isMeesho(tab.url)) {
        return { shipping: EMPTY_SHIPPING };
      }
      return forwardToContent(tab.id, { type: "CONTENT_REREAD" });
    }

    case "APPLY_IMAGE": {
      const tab = await getActiveTab();
      if (tab?.id == null || !isMeesho(tab.url)) {
        return { ok: false, error: "Open your supplier panel first." };
      }
      return forwardToContent(tab.id, {
        type: "CONTENT_APPLY",
        dataUrl: message.dataUrl,
        fileName: message.fileName,
      });
    }

    case "QUOTE_IMAGE":
      return forwardToMeeshoTab(message.tabId, {
        type: "CONTENT_QUOTE",
        dataUrl: message.dataUrl,
        fileName: message.fileName,
        mode: message.mode,
        sscatId: message.sscatId,
        manual: message.manual,
        expectSignature: message.expectSignature,
      });

    case "SEARCH_CATEGORIES":
      return forwardToMeeshoTab(message.tabId, {
        type: "CONTENT_SEARCH_CATEGORIES",
        query: message.query,
      });


    case "PANEL_CONTEXT":
      return forwardToMeeshoTab(message.tabId, { type: "CONTENT_PANEL_CONTEXT" });

    /* ─── Part 2: autofill ─── */

    case "GET_FORM_STATUS":
      return forwardToMeeshoTab(message.tabId, { type: "CONTENT_FORM_STATUS" });

    case "CAPTURE_FORM":
      return forwardToMeeshoTab(message.tabId, {
        type: "CONTENT_CAPTURE_FORM",
        includeEmpty: message.includeEmpty,
      });

    case "SCAN_FIELDS":
      return forwardToMeeshoTab(message.tabId, {
        type: "CONTENT_SCAN_FIELDS",
        profileFields: message.profileFields,
      });

    case "FILL_FORM":
      return forwardToMeeshoTab(message.tabId, {
        type: "CONTENT_FILL",
        fields: message.fields,
        overwrite: message.overwrite,
      });

    case "CANCEL_FILL":
      return forwardToMeeshoTab(message.tabId, { type: "CONTENT_FILL_CANCEL" });

    case "HIGHLIGHT_FIELD":
      return forwardToMeeshoTab(message.tabId, {
        type: "CONTENT_HIGHLIGHT",
        key: message.key,
        tone: message.tone,
      });

    /* ─── Part 3: the control plane ─── */

    case "SYNC_CONFIG":
      return syncConfig(message.version);

    case "FLUSH_HEALTH":
      return { sent: await flushHealth(true) };
  }
}

/**
 * Forward to a specific tab the panel named — but only while it is still the
 * supplier panel (the user may have navigated it elsewhere mid-run).
 */
async function forwardToMeeshoTab<T extends BgToContentRequest>(
  tabId: number,
  req: T,
): Promise<unknown> {
  let url: string | undefined;
  try {
    url = (await chrome.tabs.get(tabId)).url;
  } catch {
    url = undefined; // tab closed
  }
  if (!isMeesho(url)) {
    return {
      ok: false,
      code: "unreachable",
      error: "Your supplier panel tab was closed or navigated away. Reopen it and try again.",
    };
  }
  return forwardToContent(tabId, req);
}

/**
 * Send to the content script, translating a dead port into a friendly error.
 *
 * ── THE RETRY, AND WHY IT EXISTS ──────────────────────────────────────────
 * A dead port almost always means one specific thing: that supplier tab was open
 * BEFORE this extension was installed or updated, so the declarative content
 * script — which only injects on navigation — was never put into it. The tab
 * looks perfectly normal to the seller, and every panel action against it fails
 * with "couldn't reach your supplier panel. Try reloading that tab", which is
 * true, unhelpful, and avoidable: the fix is one injection away.
 *
 * So the first failure triggers an injection and ONE retry. A second failure is a
 * real problem (the tab is mid-navigation, or Chrome refused scripting) and the
 * seller gets the reload advice, which by then is actually the right advice.
 */
async function forwardToContent<T extends BgToContentRequest>(
  tabId: number,
  req: T,
  allowInject = true,
): Promise<unknown> {
  try {
    return await sendToContent(tabId, req);
  } catch {
    if (allowInject && (await injectOnDemand(tabId))) {
      return forwardToContent(tabId, req, false);
    }
    return {
      ok: false,
      code: "unreachable",
      shipping: EMPTY_SHIPPING,
      error: "Couldn't reach your supplier panel. Try reloading that tab.",
    };
  }
}

/**
 * Put the content script into a tab that is missing it, and wait long enough for
 * it to register its message listener before the caller retries.
 *
 * Returns false when the tab isn't a supplier panel any more, or injection was
 * refused — in both cases a retry would fail the same way.
 */
async function injectOnDemand(tabId: number): Promise<boolean> {
  try {
    const url = (await chrome.tabs.get(tabId)).url;
    if (!isMeesho(url)) return false;
    await injectInto(tabId);
    // The script boots and handshakes asynchronously; without this pause the
    // retry races its own listener registration and fails for a second time.
    await new Promise<void>((resolve) => setTimeout(resolve, 250));
    return true;
  } catch {
    return false;
  }
}

/* ─── first-install convenience ────────────────────────────────────────── */

/**
 * Registered and declarative content scripts only inject on NAVIGATION, so a
 * Meesho tab that was already open when the extension was installed or updated
 * gets neither the content script nor the page-world probe until a reload.
 *
 * That gap is not cosmetic. The content script alone still handshakes, so the
 * side panel says "connected" and looks healthy — while the probe that captures
 * the panel's own pricing request is absent, and every quote loses its mirror.
 * That is precisely the state that produced ₹288 quotes beside a panel showing
 * ₹110. Inject both, now, into every open supplier tab.
 */
async function injectIntoOpenMeeshoTabs(): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({
      url: "https://supplier.meesho.com/*",
    });
    await Promise.all(tabs.map((tab) => (tab.id == null ? null : injectInto(tab.id))));
  } catch {
    /* scripting/query unavailable — ignore */
  }
}

/** Put the page-world probe into one tab that is missing it. Best-effort. */
async function injectProbeInto(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["panel-probe.js"],
      world: "MAIN",
    });
  } catch {
    /* not injectable right now — a reload of that tab still fixes it */
  }
}

/** Probe + content script, for a tab that predates this extension version. */
async function injectInto(tabId: number): Promise<void> {
  await injectProbeInto(tabId);
  if (readyTabs.has(tabId)) return;
  try {
    const files = chrome.runtime.getManifest().content_scripts?.[0]?.js;
    if (files?.length) {
      await chrome.scripting.executeScript({ target: { tabId }, files });
    }
  } catch {
    /* tab not injectable (e.g. mid-navigation) — declarative will catch it */
  }
}

/* ════════════════════════════════════════════════════════════════════════════
 *  PART 3 — THE CONTROL PLANE
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Four jobs the background took on in Part 3, all of them things that must keep
 *  happening whether or not the side panel is open:
 *
 *    1. HEARTBEAT on a chrome.alarms tick. Is this device still licensed, is the
 *       account still live, has the admin changed anything.
 *    2. REMOTE ADAPTER CONFIG. Fetch, validate, cache. It lives here rather than
 *       in the panel because validation carries a zod schema, and the panel's
 *       initial bundle is kept small.
 *    3. HEALTH FLUSH. Send what the content scripts queued. The only context that
 *       holds an access token, deliberately.
 *    4. UPDATES. Apply one when nothing is running; leave a "what's new" note.
 *
 *  ── THE MV3 CONSTRAINT THAT SHAPES ALL OF IT ──────────────────────────────
 *  This worker is stopped after ~30 seconds idle and restarted on the next event,
 *  with every module variable gone. So:
 *    • no setInterval — chrome.alarms, which outlives the worker;
 *    • no state in memory — every result goes to chrome.storage (lib/storage.ts);
 *    • every top-level registration below is idempotent, because this file is
 *      re-evaluated on each wake.
 */

import {
  HEALTH_FLUSH_ALARM,
  HEALTH_FLUSH_PERIOD_MINUTES,
  HEARTBEAT_ALARM,
  HEARTBEAT_PERIOD_MINUTES,
} from "@/lib/config";
import { heartbeat } from "@/lib/license";
import { configNeedsRefresh, fetchAdapterConfig } from "@/lib/remote-config";
import { flushHealth } from "@/lib/health-flush";
import { report } from "@/lib/health";
import { isBusy } from "@/lib/busy";
import { KEYS, write } from "@/lib/storage";
import { currentVersion } from "@/lib/version";

/* ─── alarms ────────────────────────────────────────────────────────────── */

/**
 * Create the alarms.
 *
 * `chrome.alarms.create` with an existing name REPLACES that alarm, so this is
 * safe to call on every wake — and it is called on every wake on purpose. An
 * alarm can be lost when an extension is reloaded or a profile is restored, and
 * an extension that quietly stopped heartbeating would keep running off a licence
 * state that is weeks old without anything looking wrong.
 */
function ensureAlarms(): void {
  try {
    chrome.alarms.create(HEARTBEAT_ALARM, {
      periodInMinutes: HEARTBEAT_PERIOD_MINUTES,
    });
    chrome.alarms.create(HEALTH_FLUSH_ALARM, {
      periodInMinutes: HEALTH_FLUSH_PERIOD_MINUTES,
    });
  } catch {
    /* alarms unavailable — the panel still heartbeats on open */
  }
}

ensureAlarms();

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === HEARTBEAT_ALARM) void onHeartbeatTick();
  if (alarm.name === HEALTH_FLUSH_ALARM) void flushHealth();
});

/**
 * One heartbeat, plus the two things its answer can trigger.
 *
 * A signed-out or offline extension gets `no_session` / `offline` back, which is
 * not something to act on: the panel registers and heartbeats when the seller next
 * signs in. Nothing is logged and nothing is retried beyond what callBackend
 * already does.
 */
async function onHeartbeatTick(): Promise<void> {
  const outcome = await heartbeat();
  if (outcome.kind !== "ok") return;

  // This is where an admin publishing a selector fix reaches installed extensions.
  if (await configNeedsRefresh(outcome.license.adapterConfigVersion)) {
    await syncConfig(outcome.license.adapterConfigVersion);
  }

  // Piggyback the flush: the worker is awake and authenticated right now, which
  // is the cheapest moment there is to send telemetry.
  await flushHealth();
}

/**
 * Fetch and cache the remote adapter config.
 *
 * An INVALID config is reported as a health event rather than swallowed. Without
 * that, a mistyped selector set would be rejected silently on every install and
 * the admin would watch their edit have no effect with nothing to explain why —
 * the most confusing failure this feature can have. With it, /admin shows
 * `config / remote_config` turning to `error` with the offending path.
 */
async function syncConfig(reportedVersion = 0): Promise<{ ok: boolean; version: number }> {
  const outcome = await fetchAdapterConfig();
  if (outcome.kind === "invalid") {
    await report(
      {
        feature: "config",
        checkKey: "remote_config",
        status: "error",
        detail: outcome.reason,
      },
      `config|${reportedVersion}`,
    );
    return { ok: false, version: 0 };
  }
  if (outcome.kind === "failed") return { ok: false, version: 0 };
  return { ok: true, version: outcome.version };
}

/* ─── startup and install ───────────────────────────────────────────────── */

chrome.runtime.onStartup.addListener(() => {
  ensureAlarms();
  // Force a refetch: the cached version may have been written by a build whose
  // bundled defaults differ from this one's, so "same version" is not "same
  // effective config".
  void fetchAdapterConfig(true);
  void onHeartbeatTick();
});

chrome.runtime.onInstalled.addListener((details) => {
  ensureAlarms();
  void fetchAdapterConfig(true);

  void (async () => {
    const version = currentVersion();
    if (details.reason === "install") {
      // A brand-new install has nothing to be told about what changed. Marking
      // this version as seen keeps the "what's new" note off a first run, where
      // the three-step onboarding is the right thing to show instead.
      await write(KEYS.whatsNewSeen, version);
      return;
    }
    if (details.reason === "update" && details.previousVersion !== version) {
      // Clear the marker so the panel shows the note once, next time it opens.
      await write(KEYS.whatsNewSeen, null);
    }
  })();
});

/* ─── applying an update ────────────────────────────────────────────────── */

/**
 * Chrome has a newer version of this extension ready and is asking whether to
 * apply it now. `chrome.runtime.reload()` tears down this worker, the side panel
 * and every content script immediately.
 *
 * ── WHY THIS WAITS ────────────────────────────────────────────────────────
 * Doing that mid-autofill leaves a seller's catalog form half-written with no
 * report of what landed; doing it mid-export can lose a generated image. (The
 * charge itself is safe — the server's idempotency key covers it — but the seller
 * would still watch their image disappear.)
 *
 * So: apply immediately when idle, otherwise check back until the run finishes.
 * If nothing ever clears the flag, `isBusy` ages it out (lib/busy.ts) and the
 * update lands on a later check. Every path here ends in an updated extension —
 * Chrome applies a pending update on the next browser restart regardless — so the
 * only question this handler decides is whether a seller loses work on the way.
 */
const UPDATE_RETRY_MS = 30_000;

chrome.runtime.onUpdateAvailable.addListener(() => {
  void applyUpdateWhenIdle();
});

async function applyUpdateWhenIdle(): Promise<void> {
  try {
    if (await isBusy()) {
      // chrome.alarms has a one-minute floor, so a short wait uses a timer. If
      // Chrome stops the worker before it fires, the update still applies at the
      // next browser restart.
      setTimeout(() => void applyUpdateWhenIdle(), UPDATE_RETRY_MS);
      return;
    }
    chrome.runtime.reload();
  } catch {
    /* reload refused — Chrome applies it on the next restart */
  }
}
