import {
  pushToBackground,
  type BgToContentRequest,
  type CaptureResponse,
  type CategorySearchResponse,
  type FillResponse,
  type ManualPricing,
  type QuoteMode,
  type QuoteResponse,
  type ScanResponse,
  type ShippingReading,
} from "@/lib/messages";
import type { CapturedField, FormStatus } from "@/lib/autofill-types";
import {
  applyImageToListing,
  cancelFill,
  categoryPath,
  confidenceFor,
  discoverFields,
  fillRunning,
  formRoot,
  formStatus,
  highlightField,
  readShipping,
  runFill,
  toCaptured,
  toScanned,
} from "./meesho";
import { applyAdapterConfig } from "./meesho/config";
import { MeeshoApiError, quoteImage, searchCategories } from "./meesho-api";
import { reportFillOutcome, reportImageApply, runSelfTest } from "./self-test";
import { readFeature } from "@/lib/kill-switches";
import { KEYS, read, watch } from "@/lib/storage";
import { pingProbe, pricingContext, probeInstalled, watchPanelCalls } from "./panel-context";

/**
 * Content script on supplier.meesho.com. It:
 *   • announces itself to the background (the handshake behind "Session
 *     connected"),
 *   • reads the live shipping charge and re-reads on any DOM mutation (the panel
 *     is a React SPA that updates asynchronously),
 *   • records the panel's own pricing request so quotes can mirror it exactly
 *     (panel-context.ts + public/panel-probe.js),
 *   • gets Meesho's live shipping quote for each generated image (meesho-api.ts),
 *   • reports whether a catalog form is on screen, and captures / fills it when
 *     the seller asks (meesho/discovery.ts + meesho/fill),
 *   • answers panel requests relayed by the background.
 *
 * ── WHAT IT WRITES TO THE PAGE ─────────────────────────────────────────────
 * Two things, both on the seller's own click: an image into the front-image input
 * (Part 1), and the fields of a saved autofill profile (Part 2). It NEVER clicks
 * Next, Save, Submit or Publish, and never advances a step — the seller reviews
 * and submits the catalog themselves.
 */

const EMPTY: ShippingReading = { value: null, raw: null };

/**
 * The kill switches, mirrored into plain booleans.
 *
 * Declared HERE, above every reader, because the boot sequence below calls
 * `currentReading()` and a `let` referenced before its declaration is executed is
 * a TDZ throw — which in a content script means the whole adapter silently dies
 * on load.
 *
 * They exist at all because the observer callback and `pushIfChanged` run on a
 * hot path and cannot await storage, so the async `readFeature` answer is cached
 * and kept current by a watch (see syncFeatureFlags). Fail-open: until the first
 * read lands both are on — losing a seller's toolkit to a storage hiccup is the
 * worse failure (see lib/kill-switches.ts).
 */
let liveShippingOn = true;
let imagesOn = true;

function currentReading(): ShippingReading {
  // A paused live-shipping feature reads nothing off the page at all.
  if (!liveShippingOn) return EMPTY;
  const hit = readShipping();
  return hit
    ? { value: hit.value, raw: hit.raw, source: hit.source }
    : EMPTY;
}

let lastKey = "";

function pushIfChanged(reading: ShippingReading): void {
  const key = `${reading.value}|${reading.raw}`;
  if (key === lastKey) return;
  lastKey = key;
  pushToBackground({ type: "SHIPPING_UPDATE", shipping: reading });
}

/* ─── catalog-form status ──────────────────────────────────────────────── */

let lastFormKey = "";
let lastFormAt = 0;

/** Rediscovery is not free, so it is rate-limited and only pushed on a change. */
const FORM_STATUS_MIN_GAP_MS = 1200;

function pushFormStatus(force = false): void {
  const now = Date.now();
  if (!force && now - lastFormAt < FORM_STATUS_MIN_GAP_MS) return;
  lastFormAt = now;

  // Never re-scan mid-run: discovery would fight the engine for the same DOM.
  if (fillRunning()) return;

  const status = safeFormStatus();
  const key = `${status.present}|${status.fieldCount}|${status.filledCount}|${status.categoryPath}|${status.url}`;
  if (!force && key === lastFormKey) return;
  lastFormKey = key;
  pushToBackground({ type: "FORM_STATUS_UPDATE", status });
}

/** Discovery walks markup we do not control; a throw must never kill the script. */
function safeFormStatus(): FormStatus {
  try {
    return formStatus();
  } catch {
    return {
      present: false,
      fieldCount: 0,
      filledCount: 0,
      categoryPath: null,
      url: location.href,
    };
  }
}

/* ─── Part 3: the remote adapter config ────────────────────────────────── */

/**
 * The admin-editable half of the adapter (selectors, label words, timings).
 *
 * It is read straight out of chrome.storage.local — content scripts have access,
 * so there is no message hop, no waiting on the service worker, and nothing to go
 * wrong if the worker is asleep when this page loads. The background fetches and
 * VALIDATES it (lib/remote-config.ts); this side only applies what is already
 * known good.
 *
 * Until it lands, the bundled defaults are in force. That is the whole fallback
 * story: there is no moment at which the adapter has no configuration.
 */
async function loadAdapterConfig(): Promise<void> {
  try {
    const cached = await read(KEYS.adapterConfig);
    applyAdapterConfig(cached?.config ?? null, cached?.version ?? 0);
  } catch {
    /* storage unavailable — the bundled defaults are already in force */
  }
}

/** An admin publishing a fix mid-session should not need a reload to reach us. */
watch(KEYS.adapterConfig, (cached) => {
  applyAdapterConfig(cached?.config ?? null, cached?.version ?? 0);
  // Re-answer with the new selectors rather than leaving a stale "not detected".
  lastKey = "";
  lastFormKey = "";
  pushIfChanged(currentReading());
  pushFormStatus(true);
});

/**
 * One id per page load, used to deduplicate health checks.
 *
 * The href is part of it on purpose: the supplier panel is an SPA, so a seller
 * moving from the orders list to the catalog form is a new screen that deserves
 * its own checks, even though the content script never re-booted.
 */
const BOOT_ID = Math.random().toString(36).slice(2, 10);
const pageKey = () => `${BOOT_ID}|${location.pathname}`;

/** Let the page settle before judging whether the adapter can find anything. */
const SELF_TEST_DELAY_MS = 1500;

function scheduleSelfTest(): void {
  window.setTimeout(() => void runSelfTest(pageKey()), SELF_TEST_DELAY_MS);
}

/* ─── boot ─────────────────────────────────────────────────────────────── */

// Start listening before the handshake: the panel prices things on its own
// schedule and we want the earliest call it makes.
watchPanelCalls();
pushToBackground({ type: "CONTENT_READY" });

// The config load is async, so the first reading uses the bundled defaults and
// the `watch` above corrects it a moment later if a remote config is cached.
void loadAdapterConfig().then(() => {
  lastKey = "";
  lastFormKey = "";
  pushIfChanged(currentReading());
  pushFormStatus(true);
  scheduleSelfTest();
});

pushIfChanged(currentReading());
pushFormStatus(true);

/**
 * Self-heal a missing page-world probe.
 *
 * Registered MAIN-world scripts only inject on navigation, so a supplier tab
 * that was already open when the extension was installed or updated has this
 * content script (the background injects it) but NO probe — a tab that looks
 * connected while nothing can be mirrored. Rather than leave the seller to
 * discover that a reload is the fix, ask the background to inject one and ping
 * again. Quoting stays blocked until a probe answers.
 */
const PROBE_WAIT_MS = 500;
window.setTimeout(() => {
  if (probeInstalled()) return;
  pushToBackground({ type: "CONTENT_PROBE_MISSING" });
  window.setTimeout(pingProbe, PROBE_WAIT_MS * 2);
}, PROBE_WAIT_MS);

/* ─── live re-read via MutationObserver (scoped, debounced) ────────────── */

/**
 * ── WHY THIS OBSERVER IS FUSSED OVER ──────────────────────────────────────
 * The supplier panel is a React SPA that mutates constantly, and this callback
 * runs on the seller's own tab while they type into their catalog. Three rules:
 *
 *   SCOPED  — once a catalog form is found, observe THE FORM, not <body>. On a
 *             live Kurtis form that is the difference between reacting to the
 *             form and reacting to every toast, tooltip and sidebar animation on
 *             the page. We fall back to <body> only while no form is known,
 *             because that is the state in which a form APPEARING is the event we
 *             are waiting for.
 *   DEBOUNCED — one re-read per quiet 350ms, never per mutation.
 *   DISCONNECTED when it cannot help: during a fill (discovery would fight the
 *             engine for the same DOM) and when both the features that consume
 *             its output are switched off.
 */

const OBSERVE_OPTIONS: MutationObserverInit = {
  subtree: true,
  childList: true,
  characterData: true,
};

let debounce: number | undefined;
let observedTarget: Node | null = null;

const observer = new MutationObserver(() => {
  window.clearTimeout(debounce);
  debounce = window.setTimeout(() => {
    pushIfChanged(currentReading());
    pushFormStatus();
    // The form may have appeared or been replaced since we attached.
    retargetObserver();
  }, 350);
});

/**
 * Point the observer at the narrowest useful target, and detach entirely when
 * there is nothing for it to do.
 *
 * Cheap to call: it does nothing unless the target actually changed, so the
 * debounced callback can call it on every tick.
 */
function retargetObserver(): void {
  // Nothing consumes a re-read while a fill owns the DOM.
  if (fillRunning()) {
    if (observedTarget) {
      observer.disconnect();
      observedTarget = null;
    }
    return;
  }

  // Both consumers paused → no reason to watch the page at all.
  if (!liveShippingOn && !imagesOn) {
    if (observedTarget) {
      observer.disconnect();
      observedTarget = null;
    }
    return;
  }

  let target: Node = document.body;
  try {
    target = formRoot() ?? document.body;
  } catch {
    target = document.body;
  }

  if (target === observedTarget) return;
  observer.disconnect();
  observer.observe(target, OBSERVE_OPTIONS);
  observedTarget = target;
}

async function syncFeatureFlags(): Promise<void> {
  liveShippingOn = (await readFeature("live_shipping")).enabled;
  imagesOn = (await readFeature("image_generator")).enabled;
  retargetObserver();
  if (!liveShippingOn) {
    // Stop asserting a figure we are no longer allowed to read.
    lastKey = "";
    pushToBackground({ type: "SHIPPING_UPDATE", shipping: EMPTY });
  }
}

watch(KEYS.killSwitches, () => void syncFeatureFlags());
void syncFeatureFlags();
retargetObserver();

/* ─── SPA navigation ───────────────────────────────────────────────────── */

/**
 * The supplier panel changes route without a page load, so nothing re-runs: the
 * content script that booted on the orders list is the one running on the catalog
 * form. Watching `location.href` is deliberately simple — patching History from
 * this isolated world would not see the page's own pushState calls anyway.
 */
const ROUTE_POLL_MS = 700;
let lastHref = location.href;
window.setInterval(() => {
  if (location.href === lastHref) return;
  lastHref = location.href;
  lastFormKey = ""; // a new screen always deserves a fresh answer
  pushIfChanged(currentReading());
  pushFormStatus(true);
  // A new screen is a new page load as far as the adapter is concerned, so it
  // gets its own health checks — this is what makes "it broke after they
  // pressed Next" visible in /admin.
  scheduleSelfTest();
}, ROUTE_POLL_MS);

/* ─── panel requests (relayed by background) ───────────────────────────── */

chrome.runtime.onMessage.addListener((message: BgToContentRequest, _sender, sendResponse) => {
  // Only CONTENT_* messages (sent via chrome.tabs.sendMessage to this one tab)
  // are handled here. Panel → background messages also reach this listener but
  // use different type names, so they fall through and we never respond to them.
  switch (message.type) {
    case "CONTENT_REREAD": {
      const reading = currentReading();
      pushIfChanged(reading);
      sendResponse({ shipping: reading });
      return; // sync
    }

    case "CONTENT_APPLY": {
      void applyImage(message.dataUrl, message.fileName)
        .then((ok) => sendResponse({ ok }))
        .catch((err) => sendResponse({ ok: false, error: String(err) }));
      return true; // async
    }

    case "CONTENT_QUOTE": {
      void quote(
        message.dataUrl,
        message.fileName,
        message.mode,
        message.sscatId,
        message.manual,
        message.expectSignature,
      ).then(sendResponse);
      return true; // async
    }

    case "CONTENT_PANEL_CONTEXT": {
      sendResponse({ context: pricingContext() });
      return; // sync
    }

    case "CONTENT_SEARCH_CATEGORIES": {
      void searchCategories(message.query)
        .then((categories): CategorySearchResponse => ({ ok: true, categories }))
        .catch((err): CategorySearchResponse => ({ ok: false, ...describe(err) }))
        .then(sendResponse);
      return true; // async
    }

    /* ─── Part 2: autofill ─── */

    case "CONTENT_FORM_STATUS": {
      sendResponse({ status: safeFormStatus() });
      return; // sync
    }

    case "CONTENT_CAPTURE_FORM": {
      sendResponse(captureForm(message.includeEmpty));
      return; // sync
    }

    case "CONTENT_SCAN_FIELDS": {
      sendResponse(scanFields(message.profileFields));
      return; // sync
    }

    case "CONTENT_FILL": {
      void fill(message.fields, message.overwrite).then(sendResponse);
      return true; // async
    }

    case "CONTENT_FILL_CANCEL": {
      cancelFill();
      sendResponse({ ok: true });
      return; // sync
    }

    case "CONTENT_HIGHLIGHT": {
      sendResponse({ ok: highlightField(message.key, message.tone) });
      return; // sync
    }
  }
});

/* ─── kill switches, enforced on the page side ─────────────────────────── */

/**
 * A feature the admin has paused does NOTHING on this page.
 *
 * The side panel already hides a paused feature's controls, so reaching these
 * guards means something unusual happened: a panel that was open before the
 * switch was thrown, a stale message in flight, or a tampered build. All three
 * must stop here, because a switch is thrown when the adapter is getting
 * something WRONG — and a wrong answer that is merely hidden from the UI is still
 * a wrong answer computed against a seller's live listing, and in the autofill
 * case still a write into their form.
 *
 * Fail-open on a storage error (see lib/kill-switches.ts): losing a seller's
 * whole toolkit because chrome.storage hiccuped is the worse failure.
 */
const PAUSED_MESSAGE =
  "TarakkiHub has paused this feature for everyone while we fix something. Reopen the side panel for details.";

async function paused(feature: Parameters<typeof readFeature>[0]): Promise<boolean> {
  return !(await readFeature(feature)).enabled;
}

/* ─── Part 1 handlers ──────────────────────────────────────────────────── */

async function quote(
  dataUrl: string | null,
  fileName: string,
  mode: QuoteMode,
  sscatId: number,
  manual: ManualPricing | null,
  expectSignature: string | null,
): Promise<QuoteResponse> {
  if (await paused("image_generator")) {
    return { ok: false, error: PAUSED_MESSAGE, code: "unreachable" };
  }
  try {
    // "mirror" carries no image — it re-posts the panel's own body untouched.
    const blob = dataUrl ? await dataUrlToBlob(dataUrl) : null;
    return {
      ok: true,
      quote: await quoteImage(blob, fileName, sscatId, manual, expectSignature, mode),
    };
  } catch (err) {
    return { ok: false, ...describe(err) };
  }
}

function describe(err: unknown): { error: string; code?: MeeshoApiError["code"] } {
  if (err instanceof MeeshoApiError) return { error: err.message, code: err.code };
  return { error: "Couldn't reach Meesho. Check your connection and try again." };
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}

async function applyImage(dataUrl: string, fileName: string): Promise<boolean> {
  if (await paused("image_generator")) return false;
  const blob = await dataUrlToBlob(dataUrl);
  const file = new File([blob], fileName, {
    type: blob.type || "image/png",
  });
  const ok = applyImageToListing(file);
  void reportImageApply(ok, pageKey());
  // Meesho recomputes shipping after the image changes; nudge a re-read shortly
  // after so the panel's live value reflects the applied image.
  if (ok) {
    window.setTimeout(() => pushIfChanged(currentReading()), 800);
    window.setTimeout(() => pushIfChanged(currentReading()), 2000);
  }
  return ok;
}

/* ─── Part 2 handlers ──────────────────────────────────────────────────── */

const NO_FORM_MESSAGE = "Open a product listing form to save a profile.";

/**
 * Feature D — serialise the form the seller has filled.
 *
 * Blank controls are left out unless they ask for them: a profile full of empty
 * fields is noise, and "fill only empty fields" would have nothing to write.
 * File inputs, hidden inputs and password fields are never captured at all (see
 * SKIP_INPUT_TYPES) — images are Part 1's job.
 */
function captureForm(includeEmpty: boolean): CaptureResponse {
  try {
    const root = formRoot();
    if (!root) return { ok: false, error: NO_FORM_MESSAGE, code: "no_form" };

    const live = discoverFields(root);
    const fields: CapturedField[] = live
      .filter((f) => includeEmpty || !f.empty)
      .map(toCaptured);

    if (!fields.length) {
      return {
        ok: false,
        error: includeEmpty
          ? NO_FORM_MESSAGE
          : "This form has no filled fields yet. Fill it in first, then save.",
        code: "no_form",
      };
    }
    return { ok: true, fields, categoryPath: categoryPath(root, live) };
  } catch (err) {
    return { ok: false, error: `Couldn't read this form (${String(err)}).` };
  }
}

/**
 * The developer field scan. Lists every control the adapter can see, with the
 * label, section, type and value it resolved — and, when a profile is selected,
 * how confidently each control matches it. This is the tuning instrument: run it
 * against the real Meesho form before trusting anything else.
 */
function scanFields(profileFields: CapturedField[] | null): ScanResponse {
  try {
    const root = formRoot();
    if (!root) {
      return { ok: false, error: "No catalog form detected on this screen.", code: "no_form" };
    }
    const live = discoverFields(root);
    const fields = live.map((field) => {
      const scanned = toScanned(field);
      if (profileFields?.length) scanned.confidence = confidenceFor(field, profileFields);
      return scanned;
    });
    return {
      ok: true,
      fields,
      categoryPath: categoryPath(root, live),
      url: location.href,
    };
  } catch (err) {
    return { ok: false, error: `Couldn't scan this form (${String(err)}).` };
  }
}

/** Feature F — one-click autofill. User-initiated, verified, never submitted. */
async function fill(fields: CapturedField[], overwrite: boolean): Promise<FillResponse> {
  if (await paused("autofill")) {
    return { ok: false, error: PAUSED_MESSAGE, code: "unreachable" };
  }
  if (fillRunning()) {
    return { ok: false, error: "A fill is already running on this tab.", code: "busy" };
  }
  if (!formRoot()) {
    return { ok: false, error: "No catalog form is open on this tab.", code: "no_form" };
  }
  try {
    const result = await runFill(
      { fields, overwrite },
      {
        onProgress: (progress) =>
          pushToBackground({ type: "FILL_PROGRESS_UPDATE", progress }),
      },
    );
    // The form has changed underneath us; tell the panel what it looks like now.
    pushFormStatus(true);
    void reportFillOutcome(result, pageKey());
    return { ok: true, result };
  } catch (err) {
    pushFormStatus(true);
    return { ok: false, error: `The fill stopped unexpectedly (${String(err)}).` };
  }
}
