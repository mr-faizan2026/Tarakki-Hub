# Chrome Web Store listing — TarakkiHub

Everything the store asks for, written out so a submission is copy-and-paste
rather than improvisation. Keep it in lockstep with `src/manifest.config.ts`: if a
permission changes there, its justification changes here, and
`scripts/build-zip.mjs` fails the release if the two lists disagree.

> ### The privacy policy exists — keep it in step
>
> The store requires a reachable privacy-policy URL, and it requires the answers in
> its own form to **match** that page. The page is `src/app/privacy/page.tsx` →
> `https://tarakkihub.com/privacy`, linked from the site footer.
>
> **It is the canonical text; the data-use section below is filled in from it.** If
> you change what the extension collects, change both together and bump
> `LAST_UPDATED` on the page. The two disagreeing is how a listing gets taken down
> months later.
>
> Before submitting: load the URL in a private window and confirm it renders. A
> policy behind auth, or 404ing because the deploy did not include it, is the same
> as not having one.

---

## Single purpose

Chrome requires one narrow purpose, and judges everything else against it.

> **TarakkiHub helps a Meesho seller list products faster: it reads the shipping
> charge Meesho is already showing on the seller's own supplier panel, prepares
> product images for that listing, and fills a new listing form from a form the
> seller saved earlier.**

Everything in the extension serves that sentence. The live shipping read, the
image preparation and the listing autofill are three steps of one job — preparing
a Meesho listing — all performed on `supplier.meesho.com`, all on the seller's own
account, all on their click.

---

## Store description (draft)

> **Listing on Meesho, faster.**
>
> TarakkiHub sits beside your Meesho supplier panel and helps with the slow parts
> of putting a product up.
>
> **See your shipping charge as you work.** TarakkiHub reads the shipping figure
> your supplier panel is already showing and keeps it in view in the side panel,
> so you are not scrolling back to the price breakdown every time you change
> something.
>
> **Prepare your listing images.** Drop in your product photo and TarakkiHub
> produces a set of catalog-ready versions — different framing, sizing and
> optional promo stickers, all at Meesho's 1000×1000 catalog size. Each one is
> priced by Meesho itself, live, and they are sorted by what Meesho quoted. We
> never estimate or guess a shipping charge: every figure you see is a figure
> Meesho gave for that exact image, and if we cannot reproduce the number your own
> panel is showing, we show you nothing rather than a number we cannot stand
> behind.
>
> **Fill the next listing from the last one.** Save a listing form you have filled
> in as a profile, then reuse it on your next product and change only the fields
> that differ. TarakkiHub fills the boxes and reads them back to confirm what
> landed. It never presses Next, Save, Submit or Publish — you review and submit
> your own catalog, every time.
>
> **What you need:** a TarakkiHub account. The image tool uses credits; listing
> autofill is on paid plans. Your Meesho login stays entirely between you and
> Meesho — TarakkiHub never asks for it and never sees it.
>
> ---
>
> **TarakkiHub is an independent tool and is not affiliated with, endorsed by or
> connected to Meesho in any way.** "Meesho" is used only to say which website
> this extension works with. We are not a Meesho product, we do not speak for
> Meesho, and we have no special access to Meesho's systems — the extension reads
> the same page you are looking at.

### Why that disclaimer is in the description and not only the footer

Chrome review rejects extensions that could be mistaken for a first-party tool of
the site they operate on, and a seller who thinks this is a Meesho feature will
hold Meesho responsible for it. The sentence goes in the description, in the
listing's own "additional information", and in the extension's own onboarding.
The manifest name is **TarakkiHub** alone for the same reason.

---

## Permission justifications

Paste each into the matching field at submission. Each one says what it is for,
not what it technically grants.

| Permission | Justification |
| --- | --- |
| `sidePanel` | The entire user interface is a Chrome side panel next to the seller's supplier panel. Without it the extension has nowhere to render. |
| `storage` | Stores the seller's signed-in session, their saved listing profiles, the extension's own settings, and the cached selector configuration that keeps it working when Meesho changes its page. All in `chrome.storage.local`, on the seller's own machine. |
| `activeTab` | Reads the supplier-panel page the seller is currently looking at — the shipping figure and the listing form — and writes a prepared image or a saved profile into that same page when the seller clicks a button in the side panel. Only the tab they are on, only on their action. |
| `scripting` | Two uses. It injects a small script that observes the supplier panel's own pricing request, so the shipping figure we show is the panel's own figure rather than an estimate. And it injects the extension into a supplier-panel tab that was already open when the extension was installed or updated, which otherwise would not work until the seller reloaded. |
| `alarms` | Checks roughly every fifteen minutes whether the account is still active and whether we have published a corrected page-selector configuration. Chrome stops a service worker after about thirty seconds of inactivity, so a timer cannot do this; `alarms` is the only mechanism that survives. |
| `https://supplier.meesho.com/*` | The one website the extension works on. Everything it reads or writes is on the seller's own supplier panel. |
| `https://tarakkihub.com/*` | Our own backend: sign-in, the seller's plan and credits, their saved profiles, and the selector configuration above. |
| `https://<project>.supabase.co/*` | Our database and authentication provider, which the above runs on. |

**Not requested, deliberately:** `tabs` (`activeTab` plus the host permission is
enough), `<all_urls>`, `webRequest`, `cookies`, `downloads`, `identity`,
`history`, `notifications`, `management`, `nativeMessaging`.

### Remote code

**No.** Answer "No, I am not using remote code" and be ready to say why:

- Every script in the package is bundled. The CSP is `script-src 'self'`.
- The extension does fetch a **configuration** of CSS selectors, label words and
  numeric timings from our backend, so a Meesho page change can be fixed without a
  new release. That configuration is **data**: it is validated against a schema and
  used as arguments to `querySelectorAll` and as numeric thresholds. It is never
  evaluated, never passed to `Function()`, never inserted into a script tag, and
  never used to build a URL that gets fetched. The only string it compiles is one
  regular expression used to recognise a placeholder like "Select", and that
  compilation falls back to a bundled pattern if the string is invalid.
- Reviewers can verify this: `src/lib/adapter-schema.ts` is the schema, and
  `applyAdapterConfig` at the bottom of `src/content/meesho/config.ts` is the only
  place a fetched value is applied.

---

## Data use disclosure

Answers for the "Privacy practices" form. **These must match the published privacy
policy exactly.**

### What is collected

| Category | Collected? | What, and why |
| --- | --- | --- |
| Personally identifiable information | **Yes** | Email address, for the TarakkiHub account the seller creates. Nothing else — no name required, no phone, no address. |
| Health information | No | |
| Financial and payment information | No | Payments happen on the website through a payment provider; the extension never sees card or bank details and has no payment UI. |
| Authentication information | **Yes** | The seller's TarakkiHub password at sign-in, sent to our authentication provider and never stored by the extension. **The seller's Meesho credentials are never requested, never read and never transmitted** — the extension works inside a session Meesho has already established. |
| Personal communications | No | |
| Location | No | No geolocation, no IP-based location. |
| Web history | No | We do not read browsing history and do not record the pages a seller visits. The health reports described below carry a URL *path* with every identifier removed, from the supplier panel only. |
| User activity | **Yes, limited** | Whether a feature succeeded or failed on a given supplier-panel screen, so we can tell when Meesho has changed its page. See below for exactly what that contains. |
| Website content | **Yes** | Listing field values the seller **explicitly chooses to save** as a reusable profile (for example product description, fabric, manufacturer details), plus a product image they upload. |

### What "user activity" actually contains

This is the answer to give if review asks, and it is worth being precise because
"user activity" sounds much broader than what we send:

> A health report is five fields: a feature name (`form`), a check name
> (`field_detect`), an outcome (`ok` / `not_found` / `error`), the extension
> version, and the supplier-panel URL **path with every identifier replaced by
> `:id`** — for example `/panel/:id/new/catalog/:id/single`. A bucketed count may
> be attached (`n=20-29` controls found).
>
> It never contains a field label, a field value, a product name, a price, an SKU,
> the seller's shop name or code, an image, or a query string. The extension
> filters it, the API filters it again, and the database function that writes it
> filters it a third time.

### How it is used and shared

- **Not sold.** Not transferred to third parties for any purpose unrelated to the
  extension's single purpose. Not used for advertising, creditworthiness or lending.
- Used only to run the features the seller is using: their account and plan, their
  saved profiles, their credit balance, and keeping the page selectors working.
- Processors: our hosting provider and our database/authentication provider
  (Supabase), and our payment provider for website payments. Named in the privacy
  policy.
- Stored for as long as the account exists. Deleting a profile deletes its fields;
  deleting the account deletes the rows.

### Certifications

Tick all three:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

---

## Privacy policy — what the published page must say

Live at `https://tarakkihub.com/privacy` (`src/app/privacy/page.tsx`). This list is
the checklist it is written against — re-check it whenever either side changes. A
Hindi translation is still to do.

It must state:

1. **Who we are** and how to contact us.
2. **The Meesho credential sentence, explicitly:** TarakkiHub never asks for,
   reads, stores or transmits a seller's Meesho username or password. It operates
   inside the Meesho session already open in the seller's own browser.
3. **What is collected**, matching the table above — email, listing field values
   the seller chooses to save, uploaded product images, and the health reports
   with their exact five fields spelled out.
4. **What is never collected:** browsing history, pages outside
   `supplier.meesho.com`, Meesho credentials, payment details in the extension,
   location.
5. **Who processes it** (hosting, database/auth, payments), by name.
6. **How long it is kept**, and how to delete a profile or the whole account.
7. **The independence statement**: not affiliated with Meesho.
8. A last-updated date.

---

## Store assets

### Screenshots — 1280×800, PNG, up to five

Chrome shows the first one largest; it has to carry the whole pitch on its own.

- [ ] **1 — Live shipping beside the supplier panel.** The side panel open with a
      real shipping figure, the supplier panel's own price breakdown visible
      alongside showing the same number. This is the product in one image.
- [ ] **2 — Generated variants, sorted by Meesho's own quote.** The variant grid
      with rupee figures and the cheapest marked. Show the "live" label.
- [ ] **3 — The verification step.** The re-check notice, or a variant card
      showing the saving against the seller's own photo. This is what makes us
      trustworthy rather than clever.
- [ ] **4 — Autofill result.** The fill report: filled / skipped / needs attention,
      with the "still required" list. Show that it reports honestly.
- [ ] **5 — Saved profiles.** The profile list with a category, to show reuse.

Rules for every screenshot:

- [ ] **Dummy data only.** No real shop name, shop code, GST number, HSN, SKU,
      MRP, address or phone number. Replace them in the DOM before capturing, or
      capture on a test account.
- [ ] **No Meesho logo, wordmark or brand colour** anywhere in the frame,
      including in a browser tab title or favicon. Crop or blur it.
- [ ] 1280×800 exactly, PNG, no alpha, no rounded corners, no drop shadow added.
- [ ] No text overlays that make a claim we cannot keep ("Save 50% on shipping"
      is not something we can promise — Meesho decides the charge).

### Promo tile — 440×280, PNG

- [ ] The TarakkiHub mark (the teal rounded square with the rising arrow, same
      source as `public/icons/`) plus the wordmark.
- [ ] One short line, no claim about amounts: *"Listing tools for Meesho sellers"*.
- [ ] Teal `#17B8A1` on an off-white `#FBFBF9`, matching the panel.
- [ ] **No Meesho logo, wordmark, product photography or brand colour.** This is
      the asset most likely to be read as implying a partnership, and the one most
      likely to get the listing pulled.
- [ ] No screenshot inside the tile — at 440×280 a shrunk screenshot is mud.
- [ ] Safe margin of at least 20px; the store crops edges on some surfaces.

### Icons

Already generated from the logo mark by `npm run gen:assets` →
`public/icons/icon{16,32,48,128}.png`. The 128px one is the store icon. Do not
hand-edit them; edit `scripts/gen-icons.mjs` so every size stays consistent.

---

## Category and listing fields

| Field | Value |
| --- | --- |
| Category | Workflow & Planning |
| Language | English (add Hindi once the panel copy is translated) |
| Short description | Independent tool for Meesho sellers: read your live shipping charge and prepare low-shipping listing images where you list. |
| Website | `https://tarakkihub.com` |
| Support URL | `https://tarakkihub.com/dashboard` (or a dedicated support page) |
| Privacy policy | `https://tarakkihub.com/privacy` |

---

## Pre-submission checklist

- [ ] `npm run release` passes and produces `release/tarakkihub-<version>.zip`.
      It refuses to build if a source map, the dev field-scan view, a localhost
      permission or an unjustified permission is present.
- [ ] `/privacy` loads in a private window on the deployed site and matches the
      data-use answers above.
- [ ] The zip installs clean in a fresh Chrome profile, and the full path works:
      sign in → live shipping → generate and download (one credit charged, once)
      → save a profile → autofill.
- [ ] Screenshots and the promo tile have no Meesho branding and no real seller
      data.
- [ ] Permission justifications pasted, remote code answered **No** with the
      explanation above to hand.
- [ ] `min_version` in /admin → Extension is **not** raised to this version yet.
      Raising it before the store approves and rolls out the build would block
      every seller on the previous one.
