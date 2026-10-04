/**
 * ════════════════════════════════════════════════════════════════════════════
 *  PANEL PROBE — runs in the PAGE's own JavaScript world ("MAIN").
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  WHY THIS EXISTS
 *  ───────────────
 *  A shipping quote is only true if it is the number the supplier panel itself
 *  would show. Meesho computes that number from a request with many fields —
 *  the seller's selling price, their GST %, their registration type, which
 *  catalog product it matched the photo to, and whatever else Meesho adds over
 *  time. Rebuilding that request from guesses produces a real Meesho response to
 *  the WRONG question: a believable rupee figure for a listing the seller isn't
 *  making. That is exactly how a seller came to be shown ₹288 for the same photo
 *  their panel was pricing at ₹110.
 *
 *  So we stop guessing. This probe passively watches the panel make its OWN
 *  pricing calls and records the exact URL, request body AND response.
 *  meesho-api.ts re-issues that request verbatim, changing only the image being
 *  priced, and the side panel refuses to show any figure it can't reconcile with
 *  the response recorded here (see ImageGenerator's calibration gate).
 *
 *  IDENTIFYING THE CALL
 *  ────────────────────
 *  By PATH when we recognise it, and otherwise BY RESPONSE SHAPE: any JSON body
 *  carrying `shipping_charges` is the pricing call, whatever Meesho calls it
 *  today. A renamed endpoint then degrades into "mirror the call we saw" rather
 *  than "silently fall back to guesses" — which is the failure that hurt.
 *
 *  WHY IT IS A PLAIN .js FILE IN public/
 *  ─────────────────────────────────────
 *  It must run in the page's world to see the page's fetch/XHR. CRXJS wraps
 *  bundled content scripts in a loader that calls chrome.runtime.getURL(), which
 *  does not exist in the MAIN world — so a bundled script cannot be used here.
 *  This file ships verbatim (Vite copies public/ as-is) and the background
 *  registers it with chrome.scripting.registerContentScripts({ world: "MAIN" }).
 *
 *  SCOPE — read this before changing anything
 *  ──────────────────────────────────────────
 *  • It is a PASSIVE TAP. It never blocks, delays, rewrites or retries a call,
 *    and never injects one of its own. Every hook returns the page's own value.
 *  • It reports ONLY same-origin Meesho API calls that are pricing or image-match
 *    calls, and ONLY the three routing headers the panel sets itself. Cookies,
 *    Authorization and every other header are ignored.
 *  • Any failure inside the probe is swallowed: a broken probe must never break
 *    the seller's panel.
 *
 *  ── WHERE TO UPDATE IF MEESHO CHANGES ──────────────────────────────────────
 *    • WATCHED_PATHS  — endpoint paths we recognise by name.
 *    • SHAPE_FIELDS   — response fields that identify a call we didn't recognise.
 *    • SAFE_HEADERS   — the panel's own routing headers.
 *  The receiving side is src/content/panel-context.ts.
 */
(() => {
  "use strict";

  // The isolated content script and this probe agree on these strings only.
  const CHANNEL = "tarakkihub:panel-call";
  /** The content script asks for the buffer once it is listening (see below). */
  const REPLAY = "tarakkihub:replay";
  /** The content script asks whether a probe is installed at all. */
  const PING = "tarakkihub:probe-ping";
  const PONG = "tarakkihub:probe-pong";

  /** Endpoint path fragments we recognise, mapped to the short name we report. */
  const WATCHED_PATHS = {
    getTransferPrice: "getTransferPrice",
    fetchDuplicatePid: "fetchDuplicatePid",
  };

  /**
   * Response fields that identify a call whose path we don't recognise. This is
   * what keeps the mirror working through a Meesho rename: the pricing call is
   * the one that answers with a shipping charge, whatever it is called.
   */
  const SHAPE_FIELDS = {
    shipping_charges: "getTransferPrice",
    duplicate_pid: "fetchDuplicatePid",
  };

  /** The only request headers we forward — the panel's own routing headers. */
  const SAFE_HEADERS = ["client-type", "identifier", "supplier-id"];

  /** Guard against an oversized response blowing up the message channel. */
  const MAX_BODY_CHARS = 20000;

  if (window.__tarakkihubPanelProbe) return;
  window.__tarakkihubPanelProbe = true;

  function sameOriginApi(url) {
    try {
      const u = new URL(url, location.origin);
      return u.origin === location.origin && u.pathname.includes("/api/");
    } catch {
      return false;
    }
  }

  /** Short name for a path we recognise, or null. */
  function endpointOfPath(url) {
    try {
      const path = new URL(url, location.origin).pathname;
      for (const name in WATCHED_PATHS) {
        if (path.includes(WATCHED_PATHS[name])) return name;
      }
    } catch {
      /* not a URL we can parse — not ours */
    }
    return null;
  }

  /** Short name inferred from what Meesho answered, or null. */
  function endpointOfShape(response) {
    if (!response) return null;
    const scopes = [response, response.data, response.result];
    for (const scope of scopes) {
      if (!scope || typeof scope !== "object") continue;
      for (const field in SHAPE_FIELDS) {
        if (field in scope) return SHAPE_FIELDS[field];
      }
    }
    return null;
  }

  function parseJson(text) {
    if (typeof text !== "string" || !text || text.length > MAX_BODY_CHARS) return null;
    try {
      const value = JSON.parse(text);
      return value && typeof value === "object" ? value : null;
    } catch {
      return null;
    }
  }

  /** Pick only SAFE_HEADERS out of any of the shapes fetch accepts. */
  function safeHeaders(source) {
    const out = {};
    if (!source) return out;
    try {
      const get =
        typeof source.get === "function"
          ? (name) => source.get(name)
          : Array.isArray(source)
            ? (name) => (source.find((p) => String(p[0]).toLowerCase() === name) ?? [])[1]
            : (name) => {
                for (const key in source) {
                  if (key.toLowerCase() === name) return source[key];
                }
                return undefined;
              };
      for (const name of SAFE_HEADERS) {
        const value = get(name);
        if (typeof value === "string" && value) out[name] = value;
      }
    } catch {
      /* exotic header container — report what we have */
    }
    return out;
  }

  /**
   * The latest call per endpoint, kept so nothing is lost to a race: this probe
   * runs at document_start but the content script that listens attaches at
   * document_idle, so a panel call in between would otherwise vanish. The
   * content script asks for this buffer as soon as it is ready.
   */
  const buffer = new Map();

  function send(message) {
    try {
      window.postMessage(message, location.origin);
    } catch {
      /* channel unavailable — the side panel reports the mirror as missing */
    }
  }

  /** Hand one observed call to the isolated content script. Never throws. */
  function report(endpoint, url, method, request, headers, response) {
    const call = { endpoint, url, method, at: Date.now(), request, headers, response };
    buffer.set(endpoint, call);
    send({ __tarakkihub: CHANNEL, call });
  }

  /**
   * Classify a finished call from its RAW response text and report it if it is
   * ours. The panel is a busy SPA, so the cheap checks come first: a recognised
   * path, else a substring scan for the fields that identify a pricing or match
   * call. Only then is anything parsed.
   */
  function consider(url, method, request, headers, text) {
    try {
      if (!sameOriginApi(url)) return;
      const path = new URL(url, location.origin).pathname;
      const byPath = endpointOfPath(url);
      if (!byPath && !mentionsShapeField(text)) return;
      const response = parseJson(text);
      const endpoint = byPath ?? endpointOfShape(response);
      if (!endpoint) return;
      report(endpoint, path, method, request, headers ?? {}, response);
    } catch {
      /* classification is best-effort — never break the page */
    }
  }

  /** Does this response text even mention a field we'd recognise? */
  function mentionsShapeField(text) {
    if (typeof text !== "string" || text.length > MAX_BODY_CHARS) return false;
    for (const field in SHAPE_FIELDS) {
      if (text.includes(field)) return true;
    }
    return false;
  }

  window.addEventListener("message", (event) => {
    try {
      if (event.source !== window) return;
      const tag = event.data?.__tarakkihub;
      if (tag === REPLAY) {
        for (const call of buffer.values()) send({ __tarakkihub: CHANNEL, call });
      } else if (tag === PING) {
        send({ __tarakkihub: PONG });
      }
    } catch {
      /* a replay we can't serve just means the seller re-prices in the panel */
    }
  });

  // Announce ourselves: the content script attaches later and needs to know a
  // probe is installed even before the panel prices anything.
  send({ __tarakkihub: PONG });

  /* ─── fetch ──────────────────────────────────────────────────────────── */

  const nativeFetch = window.fetch;
  if (typeof nativeFetch === "function") {
    window.fetch = function fetch(input, init) {
      const promise = nativeFetch.apply(this, arguments);
      let url = null;
      try {
        url = typeof input === "string" ? input : input?.url;
      } catch {
        url = null;
      }
      if (!url || !sameOriginApi(url)) return promise; // the common path, untouched

      const method = String(init?.method ?? (typeof input === "object" ? input?.method : "") ?? "GET");
      const request = parseJson(typeof init?.body === "string" ? init.body : null);
      const headers = safeHeaders(
        init?.headers ?? (typeof input === "object" ? input?.headers : null),
      );
      // Reading a body costs something, and the panel makes a lot of GETs; the
      // calls we mirror are posts. Read a CLONE so the panel's own consumption
      // of the body is unaffected.
      if (method.toUpperCase() === "GET") return promise;
      promise
        .then((res) => res.clone().text())
        .then((text) => consider(url, method, request, headers, text))
        .catch(() => {});
      return promise;
    };
  }

  /* ─── XMLHttpRequest ─────────────────────────────────────────────────── */

  const XHR = window.XMLHttpRequest;
  if (XHR?.prototype) {
    const nativeOpen = XHR.prototype.open;
    const nativeSend = XHR.prototype.send;
    const nativeSetHeader = XHR.prototype.setRequestHeader;

    XHR.prototype.open = function open(method, url) {
      try {
        this.__tkUrl = sameOriginApi(url) ? url : null;
        this.__tkMethod = String(method ?? "GET");
        this.__tkHeaders = {};
      } catch {
        this.__tkUrl = null;
      }
      return nativeOpen.apply(this, arguments);
    };

    XHR.prototype.setRequestHeader = function setRequestHeader(name, value) {
      try {
        if (this.__tkUrl && SAFE_HEADERS.includes(String(name).toLowerCase())) {
          this.__tkHeaders[String(name).toLowerCase()] = value;
        }
      } catch {
        /* keep going — header capture is best-effort */
      }
      return nativeSetHeader.apply(this, arguments);
    };

    XHR.prototype.send = function send(body) {
      try {
        if (this.__tkUrl && String(this.__tkMethod).toUpperCase() !== "GET") {
          const url = this.__tkUrl;
          const method = this.__tkMethod;
          const request = parseJson(typeof body === "string" ? body : null);
          const headers = this.__tkHeaders ?? {};
          this.addEventListener("load", () => {
            let text = null;
            try {
              text =
                this.responseType === "" || this.responseType === "text"
                  ? this.responseText
                  : this.responseType === "json"
                    ? JSON.stringify(this.response)
                    : null;
            } catch {
              text = null;
            }
            consider(url, method, request, headers, text);
          });
        }
      } catch {
        /* never let the probe break a real request */
      }
      return nativeSend.apply(this, arguments);
    };
  }
})();
