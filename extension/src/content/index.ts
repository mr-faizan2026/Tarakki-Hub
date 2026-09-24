import {
  pushToBackground,
  type BgToContentRequest,
  type CategorySearchResponse,
  type QuoteResponse,
  type ShippingReading,
} from "@/lib/messages";
import { applyImageToListing, readShipping } from "./meesho-adapter";
import { MeeshoApiError, quoteImage, searchCategories } from "./meesho-api";

/**
 * Content script on supplier.meesho.com. Read-only with respect to the page,
 * except for the user-initiated "apply image" action. It:
 *   • announces itself to the background (the handshake behind "Session
 *     connected"),
 *   • reads the live shipping charge and re-reads on any DOM mutation (the panel
 *     is a React SPA that updates asynchronously),
 *   • gets Meesho's live shipping quote for each generated image (meesho-api.ts),
 *   • answers panel requests relayed by the background.
 */

const EMPTY: ShippingReading = { value: null, raw: null };

function currentReading(): ShippingReading {
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

/* ─── boot ─────────────────────────────────────────────────────────────── */

pushToBackground({ type: "CONTENT_READY" });
pushIfChanged(currentReading());

/* ─── live re-read via MutationObserver (debounced) ────────────────────── */

let debounce: number | undefined;
const observer = new MutationObserver(() => {
  window.clearTimeout(debounce);
  debounce = window.setTimeout(() => pushIfChanged(currentReading()), 350);
});
observer.observe(document.body, {
  subtree: true,
  childList: true,
  characterData: true,
});

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
      void quote(message.dataUrl, message.fileName, message.sscatId).then(sendResponse);
      return true; // async
    }

    case "CONTENT_SEARCH_CATEGORIES": {
      void searchCategories(message.query)
        .then((categories): CategorySearchResponse => ({ ok: true, categories }))
        .catch((err): CategorySearchResponse => ({ ok: false, ...describe(err) }))
        .then(sendResponse);
      return true; // async
    }
  }
});

async function quote(
  dataUrl: string,
  fileName: string,
  sscatId: number,
): Promise<QuoteResponse> {
  try {
    const blob = await dataUrlToBlob(dataUrl);
    return { ok: true, quote: await quoteImage(blob, fileName, sscatId) };
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
  const blob = await dataUrlToBlob(dataUrl);
  const file = new File([blob], fileName, {
    type: blob.type || "image/png",
  });
  const ok = applyImageToListing(file);
  // Meesho recomputes shipping after the image changes; nudge a re-read shortly
  // after so the panel's live value reflects the applied image.
  if (ok) {
    window.setTimeout(() => pushIfChanged(currentReading()), 800);
    window.setTimeout(() => pushIfChanged(currentReading()), 2000);
  }
  return ok;
}
