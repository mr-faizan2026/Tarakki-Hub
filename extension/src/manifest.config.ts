import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "../package.json";

/**
 * MV3 manifest for the TarakkiHub extension.
 *
 * Design goals baked in here:
 *  - MINIMAL permissions (Chrome Web Store review friendly): sidePanel + storage
 *    + activeTab + scripting only. No "tabs", no "<all_urls>", no webRequest.
 *  - host_permissions limited to the Meesho supplier panel and our own Supabase
 *    project. Nothing else.
 *  - Strict CSP, no remote code — fonts, stickers and all JS are bundled.
 *  - The side panel is the whole UI; the background worker orchestrates.
 *
 * The Supabase origin is templated from an env var at build time so the same
 * source works across projects (see `.env` / `vite`'s `import.meta.env`).
 */

// The manifest is evaluated in Vite's Node config context (not the browser), so
// import.meta.env isn't inlined here. Neither origin below is a secret, so both
// are stated directly for host_permissions. If you point the extension at a
// different project, update these to match VITE_SUPABASE_URL / VITE_WEB_APP_URL.
const SUPABASE_URL = "https://evidenfjuwerbmzwvyys.supabase.co";
const supabaseOrigin = new URL(SUPABASE_URL).origin;

/**
 * The TarakkiHub web app — home of /api/extension/* (device registration, the
 * heartbeat, the remote adapter config, health events, and the idempotent credit
 * endpoint). A real environment variable still overrides it; a `.env` file does
 * not reach this file, because Vite only inlines those into client code.
 */
const WEB_APP_URL = process.env.VITE_WEB_APP_URL ?? "https://tarakkihub.com";
const webAppOrigin = new URL(WEB_APP_URL).origin;

/**
 * In a dev build the backend is usually `next dev` on localhost, which needs its
 * own host permission. It is excluded from a production build so the Web Store
 * listing never has to justify a localhost permission it does not use.
 */
const isDev = process.env.NODE_ENV !== "production";
const devOrigins = isDev ? ["http://localhost:3000/*", "http://127.0.0.1:3000/*"] : [];

export default defineManifest({
  manifest_version: 3,
  /**
   * The Web Store listing name. Kept to the plain product name: the store shows
   * it under the icon at small sizes, where a tagline truncates to nonsense, and
   * the single-purpose statement in docs/store-listing.md is where the "what it
   * does" belongs.
   *
   * It must not read as a Meesho product. TarakkiHub is an independent tool; the
   * description says so, the listing says so, and the name stays out of it.
   */
  name: "TarakkiHub",
  short_name: "TarakkiHub",
  version: pkg.version,
  /** 132 characters max in the store; this is well inside it. */
  description:
    "Independent tool for Meesho sellers: read your live shipping charge and prepare low-shipping listing images where you list.",
  homepage_url: WEB_APP_URL,

  minimum_chrome_version: "116", // Side Panel API landed in Chrome 114–116.

  action: {
    default_title: "Open TarakkiHub",
    default_icon: {
      "16": "icons/icon16.png",
      "32": "icons/icon32.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png",
    },
  },

  icons: {
    "16": "icons/icon16.png",
    "32": "icons/icon32.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png",
  },

  side_panel: {
    default_path: "sidepanel.html",
  },

  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },

  content_scripts: [
    {
      matches: ["https://supplier.meesho.com/*"],
      js: ["src/content/index.ts"],
      run_at: "document_idle",
      all_frames: false,
    },
  ],

  /**
   * panel-probe.js is injected into the PAGE's JS world by the background
   * (chrome.scripting.registerContentScripts with world: "MAIN") so it can see
   * the panel's own pricing requests — the ones every quote mirrors. It ships
   * verbatim from public/ because CRXJS's content-script loader calls
   * chrome.runtime.getURL(), which the MAIN world doesn't have. Exposed to the
   * supplier panel only.
   */
  web_accessible_resources: [
    {
      matches: ["https://supplier.meesho.com/*"],
      resources: ["panel-probe.js"],
    },
  ],

  /**
   * MINIMUM PERMISSIONS. Each one is load-bearing; `docs/store-listing.md` carries
   * the justification sent to Chrome Web Store review, and the two lists must say
   * the same thing.
   *
   *   sidePanel  — the entire UI is a side panel.
   *   storage    — the session, the licence state, the remote adapter config, the
   *                autofill profiles cache and the health queue. MV3 kills the
   *                service worker, so storage is the only durable state there is.
   *   activeTab  — read the supplier panel the seller is looking at, on their click.
   *   scripting  — inject the page-world pricing probe, and inject the content
   *                script into a supplier tab that was already open at install.
   *   alarms     — the ~15-minute licence heartbeat and the health flush. A
   *                setInterval cannot survive the worker being stopped.
   *
   * Deliberately NOT requested: "tabs" (activeTab plus host permissions is
   * enough), "<all_urls>", webRequest, cookies, downloads, identity, history,
   * notifications, management.
   */
  permissions: ["sidePanel", "storage", "activeTab", "scripting", "alarms"],

  host_permissions: [
    "https://supplier.meesho.com/*",
    `${supabaseOrigin}/*`,
    `${webAppOrigin}/*`,
    ...devOrigins,
  ],

  // Strict: only bundled scripts run. connect-src is left to the default so the
  // Supabase auth/REST fetches work; no inline or remote script is ever allowed.
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self';",
  },
});
