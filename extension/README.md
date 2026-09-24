# TarakkiHub — Chrome Extension (MV3)

Low-shipping tools for Meesho sellers, living in the browser **Side Panel** on
`supplier.meesho.com`. Same Supabase backend and design system as the web app.

**This is Part 1** (the core, most technical part):

- **Auth** — sign in with the shared TarakkiHub account; session persists.
- **Feature A — Live shipping read** — the real shipping charge Meesho shows for
  the open product, read live from the page (never fabricated).
- **Feature B — Low-shipping image generator** — turn one product photo into
  5–50 Listify-style variations (size · thin colour frame · promo stickers),
  have **Meesho itself quote the shipping for every one, live from the
  seller's account**, and list them by that real ₹, lowest first. The seller's
  own photo is quoted too, as the baseline. Nothing is estimated.
- **Feature C — Apply to listing** — put the chosen image (the exact bytes
  Meesho quoted) into the Add Single Catalog front-image field.
- **Credits** — 1 credit per run, and only when the seller uses (downloads or
  applies) an image whose live shipping beats their own photo's. Using one
  unlocks the rest of that run. No proven reduction → free.

Listing **Autofill** is a later part — it appears as a locked placeholder.

## Stack

- **Manifest V3**, built with **Vite + [CRXJS](https://crxjs.dev)** + **TypeScript**.
- **React** for the Side Panel UI. Plain **Canvas API** for image compositing
  (kept dependency-light, small bundle).
- **@supabase/supabase-js** for auth + reads + the credit RPC. Only the **public
  anon key** ships. The **service-role key is never in the extension.**

## Setup

```bash
npm install
cp .env.example .env      # fill in Supabase URL + anon key (same as the web app)
npm run gen:assets        # generate icons + default stickers (already committed)
npm run build             # typecheck + build → dist/
```

Then load it in Chrome: `chrome://extensions` → enable **Developer mode** →
**Load unpacked** → select `dist/`. Open `https://supplier.meesho.com`, click the
TarakkiHub toolbar icon to open the side panel.

Dev with HMR: `npm run dev` (CRXJS reloads the extension on change).

> ⚠️ **Load `dist/` from `npm run build`, not `npm run dev`, for anything you
> test as "real" or submit to the store.** In dev mode CRXJS intentionally sets
> `web_accessible_resources` to `**/*` for `<all_urls>` (needed for HMR) and
> leaves that permissive manifest in `dist/` after the dev server stops. The
> **production** build (`npm run build`) scopes `web_accessible_resources` to
> `https://supplier.meesho.com/*` with only the content-script chunks — that's
> the store-ready manifest. When in doubt, re-run `npm run build`.

### Design preview (no Chrome needed)

`preview/` is an isolated harness that renders the panel's presentational
components with mock data, so the visual design can be eyeballed in a browser:

```bash
npx vite --config vite.preview.config.ts   # http://localhost:5199
```

It does **not** build or run the extension (no `chrome.*` / Supabase).

## Architecture

```
src/
  manifest.config.ts      MV3 manifest (minimal perms, strict CSP)
  background/index.ts      service worker — tab tracking + message hub + open-on-click
  content/
    index.ts               content script — handshake, live re-read, quotes, apply
    meesho-adapter.ts       ⭐ the ONLY file coupled to Meesho's DOM
    meesho-api.ts           ⭐ the ONLY file coupled to Meesho's internal API
  sidepanel/               React side panel (auth, live shipping, generator, autofill)
  lib/
    supabase.ts            client with a chrome.storage.local auth adapter
    credits.ts             consume_credit RPC wrapper (the secure spend path)
    account.ts             profile + usage loader (RLS: own rows only)
    messages.ts            typed panel ⇄ background ⇄ content protocol
    image/
      variants.ts          variation recipes (size · frame · stickers) — no prices
      bounding-box.ts      trim whitespace → product footprint
      compositor.ts        recipe → 1000×1000 JPEG (preview == quoted image)
      stickers.ts          sticker registry (folder index)
```

### How a live quote works

Meesho doesn't price shipping from a formula we could copy — it **matches the
image to an existing catalog product** and uses that product's shipping. So
every image is priced by Meesho, through the seller's open supplier-panel tab,
with the same calls the panel makes on Add Single Catalog (all in
`content/meesho-api.ts`):

1. `uploadSingleCatalogImages` — upload the image → hosted URL
2. `fetchDuplicatePid` — match it → the "duplicate pid" Meesho thinks it is
3. `getTransferPrice` (category + duplicate pid + the seller's GST type) →
   `shipping_charges`, the exact **Shipping (added separately)** line

The selling price sent in step 3 doesn't change `shipping_charges` (verified
at ₹150/₹300/₹800); the seller's GST registration does, which is why it's read
from their profile. Quotes run 3 at a time (~3 s each). Nothing is saved or
submitted — the uploads are the same ones the panel makes whenever a seller
picks an image.

**Supabase lives in the side panel, not the background.** The panel is a real
extension page with a full DOM and reliable refresh timers; an MV3 service worker
gets evicted (its refresh `setInterval` won't fire) and two clients sharing one
rotating refresh token would contend. The session persists in
`chrome.storage.local`, so it survives the panel closing and the browser
restarting. The background stays a pure tab/message orchestrator.

**The side panel is enabled on every tab** (not only Meesho) on purpose: that's
the only way the "Open your Meesho supplier panel" empty state — which lives _in_
the panel — can be shown when opened elsewhere. Content adapts to the active tab.

## Maintaining the two things that will drift

- **`content/meesho-adapter.ts`** — Meesho's panel is a React SPA whose markup
  changes over time. This is the single place that reads the shipping value
  (label-anchored, `MutationObserver`-driven) and injects an image into the
  listing's front-image input. The tunables (`SHIPPING_LABELS`, `CURRENCY_RE`,
  `FRONT_IMAGE_INPUT_IDS`, `IMAGE_INPUT_HINTS`) are at the top of the file.
  **Update selectors here.**

- **`content/meesho-api.ts`** — Meesho's internal endpoints (paths, the
  `client-type` / `identifier` / `supplier-id` headers, response field names).
  If quotes start failing, compare against the panel's own requests on Add
  Single Catalog and **update `ENDPOINTS` here.** There is no fallback
  estimate by design: a failed quote shows "Couldn't read", never a guess.

## Credits are cheat-proof

The extension **never** writes the `usage` table (RLS forbids it). Downloading a
final optimised image calls `public.consume_credit(action, amount)` — a
`SECURITY DEFINER` Postgres function granted only to `authenticated` that
verifies the JWT server-side, refuses blocked accounts, decrements atomically and
logs a `credit_events` row the web dashboard displays. A tampered client can only
ask the server to spend a credit it owns. Generating variations and getting their
live quotes is free. A run spends **1 credit** the first time the seller downloads
or applies an image whose live shipping is **lower than their own photo's** —
after that the whole run is unlocked. Images that don't beat the photo (or runs
where the photo couldn't be quoted, so no reduction is proven) are always free.
At zero balance the paid action is blocked with an upgrade prompt linking to the
web dashboard billing page.

## Permissions (minimal, Web-Store-review friendly)

`sidePanel`, `storage`, `activeTab`, `scripting` — plus host access to
`https://supplier.meesho.com/*` and our Supabase origin. No `tabs`, no
`<all_urls>`, no `webRequest`. Strict CSP, no remote code — fonts, stickers and
all JS are bundled locally.

## Assets

- **Fonts** — Clash Display (headings) + Satoshi (everything), bundled as
  `public/fonts/*.woff2`, `@font-face`d locally (no CDN).
- **Stickers** — `public/stickers/*.svg` + `index.json`. Drop new PNG/SVG art
  into the folder and add it to `index.json`; the loader reads the manifest, so
  no code changes are needed. The bundled set is brand-styled default art.
- **Icons** — generated from the logo mark by `scripts/gen-icons.mjs` (pure Node,
  no native deps).
