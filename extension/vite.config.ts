import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./src/manifest.config";

/**
 * Vite + CRXJS build for the TarakkiHub MV3 extension.
 *
 * CRXJS reads `manifest.config.ts`, discovers the HTML/TS entry points it
 * references (sidepanel.html, the background service worker, the content
 * script) and wires them into the Rollup build — emitting a Chrome-Web-Store
 * ready `dist/` with a rewritten manifest. No remote code, everything bundled.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  plugins: [react(), crx({ manifest })],
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173,
    },
  },
  build: {
    // Modern Chrome only — the extension runs in an evergreen browser.
    target: "esnext",
    // Keep the sourcemaps out of the shipped zip; flip on while debugging.
    sourcemap: false,
  },
});
