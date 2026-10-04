# TarakkiHub — Chrome Extension (MV3)

Low-shipping tools for Meesho sellers, living in the browser **Side Panel** on
`supplier.meesho.com`. Same Supabase backend and design system as the web app.

**Part 1 — low-shipping images:**

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

**Part 2 — listing autofill** (replaces Part 1's locked placeholder):

- **Feature D — Save current form as a profile** — the seller fills one Meesho
  catalog form, names it ("kurti"), and the adapter serialises every visible,
  filled field with its label, section heading, type, value and occurrence. A
  preview lists what was found so they can untick anything before saving.
- **Feature E — Profile manager** — pick a profile, rename, duplicate, delete,
  or edit any saved field. Each profile shows its category, field count, times
  used and last used.
- **Feature F — One-click autofill** — fills the open form from the profile.
  Quick overrides let the seller change only what differs (product name, price,
  MRP, size, colour, inventory) before filling; by default only empty fields are
  touched. Progress, a Cancel button, and a per-field report with scroll-to-field.
- **Plan-gated, not credit-gated** — autofill costs no credits and is included in
  every paid plan. The gate lives in the **database** (see below), not the UI.
- It **never** clicks Next, Save, Submit or Publish, and never advances a step.

**Part 3 — hardening, licensing and operability** (details in
[its own section](#part-3--hardening-licensing-and-the-remote-adapter-config)):

- **Device registration + a licence heartbeat** — a random per-install id, a
  server-counted device limit the panel helps the seller prune, and a ~15-minute
  heartbeat that signs a revoked or blocked account out **with a reason**.
- **Idempotent, device-checked credits** — one key per export, so retrying a
  timed-out download replays the first answer instead of charging twice.
- **A remote adapter config** — Meesho's selectors, label words and timings become
  editable in `/admin`, as **data**. A Meesho UI change is fixed in minutes
  without a new build or a Web Store review.
- **Kill switches and a version floor** — pause one feature for everyone with the
  message the panel shows, or block a build that is wrong about something.
- **Adapter health reporting** — a per-page self-test tells `/admin` when Meesho
  has changed its page, carrying no form or personal data at all.
- **A release build** — `npm run release` checks the build and writes a versioned
  zip, refusing to ship a source map or the dev field-scan view.

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

### Autofill lab — `http://localhost:5199/autofill-lab.html`

Same dev server, second page. It renders a **Meesho-shaped React form** —
labels as bare `<div>`s, a pointer-only custom dropdown, a filterable combobox
that renders five options at a time, a chips multiselect, a native select whose
option values are internal ids, a radio group, repeated `Name`/`Address` blocks
in two sections, and a GSTIN field that only appears after the GST answer — and
runs the **real** `src/content/meesho` modules against it. Capture the filled
form, clear it, press Autofill, and every value has to come back through
controlled React inputs with nothing but the isolated-world write (the
MAIN-world fallback needs the extension background, so it is unavailable here —
which makes this the stricter test).

`window.tk` on that page exposes the adapter for poking at one field:

```js
tk.fields().map(f => [f.label, f.type, tk.currentValue(f)])
tk.runFill({ fields: tk.capture(), overwrite: true }, { onProgress: console.log })
```

Use it after touching discovery, matching or any fill handler. It is **not** a
substitute for running the side panel's Field scan against the real Meesho form
— it is what makes that first live run boring.

## Architecture

```
src/
  manifest.config.ts       MV3 manifest (minimal perms, strict CSP)
  background/index.ts      service worker — tab tracking, message hub, open-on-click,
                           and the MAIN-world write the content script can't make
  content/
    index.ts               content script — handshake, live re-read, quotes, apply,
                           form status, capture, fill, field scan
    meesho-api.ts           ⭐ the ONLY file coupled to Meesho's internal API
    meesho/                 ⭐ the ONLY code coupled to Meesho's DOM
      config.ts             ⭐⭐ EVERY Meesho selector, label word and timing
      dom.ts                generic DOM plumbing (shadow roots, waiting, real clicks)
      shipping.ts           Feature A — read the live shipping charge
      images.ts             Feature C — put an image in the front-image input
      discovery.ts          find the catalog form; list its fields (Part 2's foundation)
      match.ts              a saved field → the control on the page in front of us
      highlight.ts          scroll to a field and ring it, for the result list
      fill/                 the engine + one handler per control type
        index.ts            passes, matching, pacing, retries, cancel, the report
        text.ts             text · textarea · number (native setter + input/change/blur)
        native-select.ts    <select>, matched by option TEXT not value
        dropdown.ts         custom dropdown / combobox — click → search → keyboard
        toggle.ts           radio · checkbox (clicked, never assigned)
        multiselect.ts      <select multiple> and chips widgets
        main-world.ts       the page-world write fallback (asks the background)
  sidepanel/               React side panel (auth, live shipping, generator, autofill)
    components/autofill/   picker, quick overrides, capture preview, manager,
                           field editor, result report, field scan (dev)
    hooks/useAutofill.ts   plan check + profile CRUD
    hooks/useFillRun.ts    start / watch / cancel one run
  lib/
    supabase.ts            client with a chrome.storage.local auth adapter
    credits.ts             consume_credit RPC wrapper (the secure spend path)
    account.ts             profile + usage loader (RLS: own rows only)
    autofill-types.ts      the CapturedField contract (content ⇄ panel ⇄ jsonb)
    autofill-store.ts      autofill_profiles CRUD + has_active_plan()
    autofill-overrides.ts  which fields belong in the quick-overrides strip
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

### How an autofill run works

A saved field is identified by what the seller sees — **section heading +
normalised label + which occurrence of that label** — because that is the only
thing about a React SPA that survives a deploy. Element attributes (`name`, `id`,
`data-testid`, `aria-label`) are kept as *secondary* hints, since Meesho supplies
them inconsistently. Matching walks four rungs and stops at the first that gives
exactly one answer: exact → label+occurrence → attributes → a tolerant fuzzy label
comparison, and that last rung is refused when two candidates are plausible.

The run then goes in **passes**. Meesho reveals fields as earlier ones are
answered (pick a GST type and two more boxes appear), so each pass re-discovers
the form, fills whatever now matches, and a new pass starts only if the previous
one filled something. After every write the engine waits for the DOM to go quiet
before the next field — writing into a form that is still re-rendering loses the
write silently, which is the failure mode that makes autofill untrustworthy.

**Nothing is reported as filled unless the value was read back off the page.**
Every handler verifies; a dropdown that opens and closes without selecting is a
failure, not a success. Custom dropdowns get a three-step chain — click the
option, type into the widget's own filter (the only thing that works on long
virtualised lists), then keyboard — each verified the same way. Outcomes are
"filled", "skipped" (with the reason) or "needs attention", and tapping any row
scrolls the Meesho page to that field and rings it.

Default: **only empty fields are touched**. The overwrite toggle is the seller's
to turn on. A field the profile has no value for is never cleared.

**The plan gate is in the database.** `autofill_profiles` has RLS policies that
require `has_active_plan(auth.uid())` on select, insert, update *and* delete, so a
free, expired or blocked account gets an empty list and a rejected write — a
tampered extension gains nothing. The panel's locked state is reporting a decision
already made server-side. See `supabase/migrations/0003_autofill.sql`.

## Maintaining the two things that will drift

### 1. Meesho's DOM → `content/meesho/config.ts` **and now `/admin → Extension`**

Meesho's panel is a React SPA whose markup changes over time. **Every**
Meesho-specific selector, label word, widget hint and timing lives in that one
file as data; the rest of `content/meesho/` is generic DOM walking that should
not need touching. No generated class names, no absolute XPaths — detection
anchors on what the seller sees (labels, section headings) and on ARIA roles.

> **Since Part 3, editing this file is the slow path.** The same values can be
> overridden from `/admin → Extension`, which reaches every installed extension in
> about fifteen minutes with no release. Edit the file when a **bundled default**
> should change (so fresh installs get it, and because the file is the
> documentation); edit the admin config when a seller is broken **right now**. The
> workflow, including the fixture loop, is in the Part 3 section below.

**When something breaks, open the side panel's Field scan first.** It is the
magnifier icon on the Listing autofill section, visible in `npm run dev` builds
(or in a production build with `VITE_DEV_TOOLS=true`). **A release build strips it
entirely** — it lists the seller's own field values, so a release containing it
would be a privacy problem, not merely untidy; `npm run release` fails if it finds
any trace of it. It lists every control the
adapter detects on the current page with its label, section, type, value and —
when a profile is selected — how confidently it matches. Tapping a row rings that
field on the Meesho page. Copy the whole scan as JSON with the copy button.

Then use the symptom table at the top of `config.ts`:

| Symptom | Constant to edit |
| --- | --- |
| The form is not detected at all | `FORM_ANCHOR_TEXT`, `FORM_MIN_ANCHORS`, `EXCLUDE_SELECTORS`, `MIN_FORM_CONTROLS` |
| A page that is NOT a form is detected as one | `FORM_MIN_ANCHORS` (raise it), `EXCLUDE_SELECTORS` |
| A control is missing from the scan | `CONTROL_SELECTOR`, `SKIP_INPUT_TYPES` |
| A label reads wrong or is empty | `LABEL_HINTS`, `PLACEHOLDER_NOISE` |
| A section says "Listing details" | `SECTION_HEADING_SELECTOR`, `SECTION_MAX_LEN` |
| A dropdown is typed `text` | `DROPDOWN_HINTS` |
| A dropdown opens but nothing is picked | `OPTION_SELECTOR`, `LISTBOX_SELECTOR` |
| The category warning never fires | `CATEGORY_HINTS` |
| Cascading fields arrive too late | `TIMING.settleQuietMs`, `TIMING.maxPasses` |
| The shipping charge stops being read | `SHIPPING_LABELS`, `CURRENCY_RE` |
| "Apply to listing" targets the wrong input | `FRONT_IMAGE_INPUT_IDS`, `IMAGE_INPUT_HINTS` |
| The overrides strip shows the wrong fields | `OVERRIDE_LABEL_PATTERNS` |

After editing, re-run the **autofill lab** (above) before testing live.

### 2. Meesho's internal API → `content/meesho-api.ts`

Meesho's internal endpoints (paths, the `client-type` / `identifier` /
`supplier-id` headers, response field names). If quotes start failing, compare
against the panel's own requests on Add Single Catalog and **update `ENDPOINTS`
here.** There is no fallback estimate by design: a failed quote shows
"Couldn't read", never a guess.

## Credits are cheat-proof

The extension **never** writes the `usage` table (RLS forbids it). Downloading a
final optimised image calls `POST /api/extension/credit`, which verifies the
caller's JWT and then runs `public.consume_credit_for(...)` — a `SECURITY DEFINER`
Postgres function that refuses blocked accounts, refuses an install the seller has
signed out elsewhere, decrements atomically, and logs a `credit_events` row the web
dashboard displays. A tampered client can only ask the server to spend a credit it
owns.

It also carries an **idempotency key**, one per export, so retrying a download whose
response was lost cannot charge a second credit — the guarantee is a unique index
on `credit_claims`, not anything the extension remembers. (Part 1 called
`consume_credit` directly; the endpoint wraps the same logic and adds those two
checks, which an RPC authenticated only by a JWT could not express. See the Part 3
section.) Generating variations and getting their
live quotes is free. A run spends **1 credit** the first time the seller downloads
or applies an image whose live shipping is **lower than their own photo's** —
after that the whole run is unlocked. Images that don't beat the photo (or runs
where the photo couldn't be quoted, so no reduction is proven) are always free.
At zero balance the paid action is blocked with an upgrade prompt linking to the
web dashboard billing page.

**Autofill spends no credits.** It is plan-gated instead, in the database — see
"How an autofill run works" above.

## Privacy

- The adapter reads the **catalog form only**. Page chrome (header, nav, search,
  account menus) is excluded by `EXCLUDE_SELECTORS`, and file, hidden and
  password inputs, plus anything named like a bank/UPI/PAN/login field, are never
  captured at all. Account, payment and order screens have no catalog form, so
  there is nothing for autofill to read there.
- Saved profiles live only in the seller's own RLS-protected rows. No analytics
  is collected on form contents, ever.
- The first time a seller saves a profile, the panel says in one line that the
  listing values are stored in their TarakkiHub account so they can reuse them.
- Every action is user-initiated. The extension never submits or advances a
  Meesho form.

## Permissions (minimal, Web-Store-review friendly)

`sidePanel`, `storage`, `activeTab`, `scripting`, `alarms` — plus host access to
`https://supplier.meesho.com/*`, our Supabase origin and our own web app origin
(`/api/extension/*`). No `tabs`, no `<all_urls>`, no `webRequest`, no `cookies`,
no `downloads`, no `identity`. Strict CSP, **no remote code** — fonts, stickers and
all JS are bundled locally.

**Part 2 added no new permission:** `scripting` was already there for the pricing
probe, and autofill reuses it for the MAIN-world write fallback on the same single
host.

**Part 3 added exactly one, `alarms`,** for the licence heartbeat and the health
flush: MV3 stops the service worker after about thirty seconds of inactivity, so a
`setInterval` cannot survive and `chrome.alarms` is the only mechanism that does.
It also added the web app origin, because that is where `/api/extension/*` lives.

The remote adapter config is **not** remote code — it is validated data used as
selector strings and numeric thresholds, never evaluated. See
`docs/store-listing.md`, which carries the justification for each permission in
the words to paste into review, and `scripts/build-zip.mjs`, which fails the
release if the manifest and that document disagree.


## Part 3 — hardening, licensing and the remote adapter config

Parts 1 and 2 are unchanged in behaviour. Part 3 adds the machinery that lets the
extension be operated: licensed per device, fixed without a release, switched off
in an emergency, and shipped to a store.

### Device registration and the licence heartbeat

- On first install the extension generates a random `crypto.randomUUID()` and
  keeps it in `chrome.storage.local`. It is **not** a fingerprint — see the header
  of `src/lib/device.ts` for what that choice costs and buys.
- After sign-in it calls `POST /api/extension/register-device`. At the device
  limit the panel lists the account's active installs and offers to sign one out
  (`revoke-device`), then retries. **There is no bypass**: the limit is counted in
  SQL by the same function that would have to grant the extra slot.
- A `chrome.alarms` tick heartbeats about every fifteen minutes, and the panel
  heartbeats when it opens. Results go to `chrome.storage`, never to a worker
  variable — MV3 stops the worker after ~30s idle.
- `device_ok: false` (signed out elsewhere) or `blocked: true` signs the session
  out locally **with a reason**, which the sign-in screen then shows once. A
  sign-in form reappearing unexplained is the most alarming thing a paid tool can
  do.
- An install that was never registered is **not** treated as revoked — see the
  `unregistered` case in `src/lib/license.ts`. Conflating the two would make every
  first sign-in look like a lockout.

### Credits: device-checked and idempotent

Spending moved from the `consume_credit` RPC to `POST /api/extension/credit`,
which wraps the same logic and adds two things the RPC could not express:

- the install must be **registered and active**, so a computer signed out
  elsewhere cannot keep spending for the hour its token stays valid;
- an **idempotency key**, one per export, reused on every retry of that export.
  The seller clicks Download, the credit is charged, the response is lost to a
  dropped connection, the extension retries — without the key that is two credits
  for one image. The guarantee is the primary key on `credit_claims`, not anything
  in the extension; MV3 can kill the worker mid-request, so "I already charged
  this" cannot be remembered reliably on this side.

The key is random per run, never derived from the run counter — that counter
restarts at 1 when the panel reopens, and a key built from it would replay
yesterday's charge.

### The remote adapter config — fixing Meesho changes without a release

**This is the headline of Part 3.** `content/meesho/config.ts` still holds the
bundled defaults; `/admin → Extension` holds an override that every installed
extension picks up at its next heartbeat.

The loop when Meesho changes its page:

1. **/admin → Extension → Adapter health** shows a check dropping — say
   `form / form_root` going from ~98% found to near zero on one path.
2. Capture a sanitised snapshot of the new screen and add it to
   `test/fixtures/` (that folder's README says how).
3. Edit the config in /admin until `npm run test:fixtures` passes against the new
   fixture.
4. Save. Saving **bumps the version**, which is what makes installs re-fetch.
   Within about fifteen minutes every seller is fixed. No new build, no Web Store
   review.

Only if a *bundled default* has to change does this become a release.

**The config is data, never code.** It is validated against a zod schema
(`src/lib/adapter-schema.ts`), merged over the bundled defaults by
`applyAdapterConfig` at the bottom of `content/meesho/config.ts`, and used as
`querySelectorAll` arguments and numeric thresholds. Nothing in it is evaluated,
injected as script, or used to build a fetched URL. Anything invalid or
unreachable falls back to the bundled defaults, so there is no state in which the
adapter has no configuration. An invalid config is reported as a health event, so
a bad paste is visible in /admin rather than silently ignored on every install.

### Kill switches

`/admin → Extension` can pause **live shipping**, **low-shipping images** or
**listing autofill** for everyone, with the message the panel shows in that
feature's own card. A paused feature's controls are gone, not greyed out, and the
**content script refuses to act on it** too — a switch is thrown when the adapter
is getting something *wrong*, and a wrong answer merely hidden from the UI is
still being computed against a seller's live listing.

They fail **open**: an unreadable switch map means every feature is on. Losing a
paying seller's whole toolkit to a storage hiccup is the worse failure, and the
switches are not a licence check — the licence checks are elsewhere and they fail
closed.

### Version gates

- Below `min_version` the panel shows a **blocking** update screen, *before* the
  sign-in form, with steps. This is why `/api/extension/config` is public: a build
  too old to sign in still has to be able to say so.
- Above the running version, `latest_version` shows a quiet note. No urgency —
  Chrome installs it on its own, and the background applies a ready update as soon
  as nothing is running (`chrome.runtime.onUpdateAvailable` + `lib/busy.ts`).
- `onInstalled` with reason `update` clears the marker that makes the panel show a
  one-time "what's new" note.

Raise `min_version` only for a build that is **wrong** about something — a figure
that contradicts the seller's own panel. It is not a nag mechanism.

### Adapter health reporting

Every adapter check reports `ok` / `not_found` / `error` to
`POST /api/extension/events`, batched, deduplicated per page load and
rate-limited. A lightweight self-test runs on each supplier-panel page load
(`src/content/self-test.ts`).

An event is exactly five fields: feature, check key, outcome, extension version,
and the URL **path with every identifier replaced by `:id`** — plus, for two
checks, a bucketed count like `n=20-29`. **It never contains a field label, a
field value, a product name, a price, an SKU, the seller's shop name or code, an
image, or a query string.** The extension filters it, the API route filters it
again, and the SQL function filters it a third time. Three gates for one promise,
because a health channel that quietly becomes a data channel is the kind of thing
nobody notices until it matters.

The sender lives in `lib/health-flush.ts` and the queue in `lib/health.ts`,
deliberately split: the content script runs beside Meesho's own JavaScript, so the
module it imports has **no code path to the seller's access token**.

### Robustness

| Failure | What happens |
| --- | --- |
| Service worker stopped mid-anything | Nothing lives in worker memory. Alarms, licence state, config, the health queue and the busy flag are all in `chrome.storage` (`lib/storage.ts`). |
| A supplier tab opened before install/update | The first failed message injects the content script and retries once (`forwardToContent`). Previously this surfaced as "try reloading that tab", which was true and useless. |
| Several Meesho tabs | The panel binds to the **active** tab and re-binds on tab switch; a long run keeps talking to the tab it started on. |
| Offline, backend down, token expired mid-action | Retried with backoff, then a plain-English message. Domain answers ("no credits") and transport failures ("offline") are kept apart on purpose — collapsing them turns "sign out one of your devices" into "something went wrong". |
| A stale licence | The panel **says** it is stale and keeps working. The gates that decide anything are server-side, so an offline extension cannot spend a credit or read a profile regardless. Bricking a seller on a café Wi-Fi would be worse product and no more secure. |
| A render error in the panel | A top-level error boundary with **Reload panel** (`components/ErrorBoundary.tsx`). A side panel that goes white has no address bar and no way out, and the seller's reasonable conclusion is that the extension is broken. |
| An unhandled rejection | Logged by a listener in `sidepanel/main.tsx`, not surfaced — by definition nothing is waiting on it. |

**Performance.** The MutationObserver is scoped to the **form** once one is found
(not `<body>`), debounced to one re-read per quiet 350ms, and disconnected during
a fill and when both features that consume it are off. The image compositor and
the autofill editor are lazy chunks, so the panel's first frame — the glance at a
rupee figure a seller makes dozens of times a day — does not pay for them.

**Accessibility.** Full keyboard navigation, a global `:focus-visible` outline,
labels or `aria-label` on every control, `aria-expanded` / `aria-haspopup` on the
menu with Escape and click-outside, and `role="alert"` on the screens that
interrupt.

### First-run onboarding

Three steps on first open: you are signed in → open your supplier panel and enter
a price so the breakdown appears → try the image optimiser (and save a profile on
a paid plan). Dismissible, and reopenable from the panel menu. Step 2 is the only
one that matters — nothing in the panel can do anything until the supplier panel
has priced something, and before that a new seller sees empty cards and reasonably
assumes the extension is broken.

## Tests

```bash
npm test              # both suites
npm run test:accuracy # quoting, calibration, variants, geometry, the page probe
npm run test:fixtures # the adapter against real markup, plus the control plane
```

- **`scripts/test-accuracy.mjs`** — the figure we show is the figure the panel
  shows, and we refuse when we cannot prove it. Plus variant spread, crop
  containment, footprint geometry and sticker containment.
- **`scripts/test-fixtures.mjs`** — runs the **real** discovery and shipping-read
  code against HTML snapshots in `test/fixtures/`, including a **negative**
  fixture (the orders list) that must *not* be mistaken for a catalog form. Also
  covers config-schema validation, the config merge and reset, version gating and
  the health-event path sanitising.

Both bundle the shipped modules with esbuild — nothing is reimplemented for a
test, so a regression in shipped code fails here.

> **Read `test/fixtures/README.md`.** The committed fixtures are reconstructions
> from the documented structure, not captures from a live account. They are a real
> regression net for our own code and **not** evidence about today's Meesho.
> Replace them with a sanitised capture at the first opportunity.

The fill engine is deliberately not fixture-tested: writing into a form needs real
event dispatch, focus and layout that jsdom does not have, and a fill test that
passed against a fake DOM would be worse than none. Use the **autofill lab**
(`npm run dev:preview`) against real markup.

## Releasing

```bash
npm run release
```

Does a clean production build, **checks it**, and writes
`release/tarakkihub-<version>.zip`. It refuses to produce a zip containing a
source map, the dev field-scan view, a localhost host permission, an unjustified
permission, a mismatched version or a missing icon size. Zipping is three lines;
refusing to ship those is the point.

### Release checklist

1. **Bump the version** in `package.json`. The manifest reads it, and the release
   script fails if they disagree.
2. Note what changed for the seller — it goes in the panel's one-time "what's new"
   note (`components/LicenseNotices.tsx`), which is about what they can now do
   differently, not a changelog.
3. `npm run release`. Fix anything it refuses.
4. **Clean-install test** on a fresh Chrome profile, with the real path end to
   end: install → sign in → live shipping reads a figure → generate → download
   (**one credit charged, once** — retry the download and confirm it does not
   charge again) → save a profile → autofill fills and reports.
5. Upload the zip to the Chrome Web Store and submit for review.
6. **After the store approves and rolls out**, set `latest_version` in
   `/admin → Extension`. Not before — pointing sellers at a version that is not
   published yet is worse than silence.
7. Only if the old build is **wrong** about something, raise `min_version` as
   well. That blocks every seller still on it, which is correct for a build that
   shows figures contradicting the seller's own panel and wrong for anything else.
8. Watch **/admin → Extension → Adapter health** for a day. A check dropping after
   a release is a regression in the new build, not a Meesho change.

`docs/store-listing.md` has the single-purpose statement, the store description,
a justification for every permission, the data-use disclosure answers and the
screenshot / promo-tile specs. **It also names the one blocker: the store requires
a published privacy policy URL, and `tarakkihub.com/privacy` does not exist yet.**
## Assets

- **Fonts** — Clash Display (headings) + Satoshi (everything), bundled as
  `public/fonts/*.woff2`, `@font-face`d locally (no CDN).
- **Stickers** — `public/stickers/*.svg` + `index.json`. Drop new PNG/SVG art
  into the folder and add it to `index.json`; the loader reads the manifest, so
  no code changes are needed. The bundled set is brand-styled default art.
- **Icons** — generated from the logo mark by `scripts/gen-icons.mjs` (pure Node,
  no native deps).
