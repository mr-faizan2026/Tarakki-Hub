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
// import.meta.env isn't inlined here. The Supabase ORIGIN is not a secret, so we
// state it directly for host_permissions. If you point the extension at a
// different Supabase project, update this to match VITE_SUPABASE_URL.
const SUPABASE_URL = "https://evidenfjuwerbmzwvyys.supabase.co";
const supabaseOrigin = new URL(SUPABASE_URL).origin;

export default defineManifest({
  manifest_version: 3,
  name: "TarakkiHub — Low-shipping tools for Meesho sellers",
  short_name: "TarakkiHub",
  version: pkg.version,
  description:
    "Read the live shipping charge on your supplier panel and generate low-shipping product images — right where you list.",

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

  permissions: ["sidePanel", "storage", "activeTab", "scripting"],

  host_permissions: [
    "https://supplier.meesho.com/*",
    `${supabaseOrigin}/*`,
  ],

  // Strict: only bundled scripts run. connect-src is left to the default so the
  // Supabase auth/REST fetches work; no inline or remote script is ever allowed.
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self';",
  },
});
