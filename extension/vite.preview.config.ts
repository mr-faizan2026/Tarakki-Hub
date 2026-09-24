import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Isolated dev server for the DESIGN PREVIEW only (preview/). It renders the
 * panel's presentational components with mock data so the visual design can be
 * eyeballed in a browser — it does NOT build the extension. `publicDir` points
 * at the extension's real assets so bundled fonts/stickers resolve.
 */
export default defineConfig({
  root: fileURLToPath(new URL("./preview", import.meta.url)),
  publicDir: fileURLToPath(new URL("./public", import.meta.url)),
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  plugins: [react()],
  server: { port: 5199, strictPort: true },
});
