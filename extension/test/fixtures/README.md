# Adapter regression fixtures

HTML snapshots of the Meesho supplier-panel screens the adapter has to read, plus
the tests that run **the real discovery and shipping-read code** against them
(`npm run test:fixtures`).

They exist because every other kind of test we have would have passed on the day
Meesho's form changed and the adapter stopped finding half of it. A fixture is the
only thing that can fail when a selector stops matching real markup.

---

## ⚠️ Read this before trusting a green run

**The fixtures in this folder are RECONSTRUCTIONS, not captures.** They were
authored from the structure documented in
`src/content/meesho/config.ts` — readonly `<input placeholder="Select">`
dropdowns, the `ul[role="menu"]` size list whose rows are bare
`<div><svg/><p>M</p></div>`, the two-section split, the asterisk-marked required
labels, the repeated "Name" under Manufacturer / Packer / Importer.

That makes them a real regression net for **our own code**: if someone changes
`FORM_COVERAGE`, breaks label resolution or loses the option fallback, these tests
go red. It does **not** make them evidence about today's Meesho. Only a captured
snapshot can do that.

**So: capture a real one at the first opportunity and replace these.** Until then,
a green fixture run means "the adapter still behaves the way we designed it", not
"the adapter still works on Meesho".

---

## Capturing a real snapshot

1. Run a dev build (`npm run dev`) and sign in. The **Field scan** view appears in
   the autofill card — it is dev-only and stripped from release builds.
2. Open the real screen in the supplier panel: *Add Single Catalog* for the form,
   or a listing with a price breakdown for the shipping read.
3. In the page's DevTools console, capture the markup:

   ```js
   copy(document.documentElement.outerHTML)
   ```

4. Paste into a new file here and **sanitise it** — this is not optional, these
   files are committed:

   - Replace every **value** with dummy text: `value=""` attributes, the text
     inside selected-option spans and chips, textarea contents.
   - Replace the **seller's shop name and code** everywhere, including inside
     `data-*` attributes and any inline JSON.
   - Replace **prices, MRPs, SKUs, HSN codes, GST numbers** and the
     manufacturer / packer / importer addresses.
   - Delete every `<script>` and inline `on*` handler.
   - Delete `<img src>` values and any base64 blobs (they bloat the file and can
     contain the seller's product photos).
   - Keep **structure, classes, roles, labels, placeholders and section
     headings** exactly as they are. Those are the things under test.

5. Add it to `FIXTURES` in `scripts/test-fixtures.mjs` with the counts you expect,
   and run `npm run test:fixtures`.

A quick way to check your sanitising: search the file for your own shop name, your
GST number and a price you recognise. If any of them is still there, keep going.

---

## When Meesho changes its UI

The loop this folder is built for:

1. **/admin → Extension → Adapter health** shows a check dropping (for example
   `form / form_root` going from ~98% found to near zero on one path).
2. Capture a fresh snapshot as above and add it alongside the old one — keep the
   old file. A fixture that no longer matches reality is still the record of what
   used to work, and the adapter is expected to handle both while sellers are on
   mixed versions.
3. Edit `adapter_config` in **/admin → Extension** until the new fixture passes.
   That config is data, so this fixes every installed extension within about
   fifteen minutes — no release, no Web Store review.
4. Only if a *bundled default* needs to change does this become a release.

Step 3 is the whole point of the remote config, and these fixtures are how you
know the new selectors work before you publish them to every seller.

---

## Files

| File | Screen | What it exercises |
| --- | --- | --- |
| `catalog-form.html` | Add Single Catalog | form discovery, coverage, labels, sections, control typing, required marks, duplicate-label occurrences, the category breadcrumb |
| `price-breakdown.html` | Listing price breakdown | the live shipping read: label anchoring and the ancestor climb |
| `orders-list.html` | Orders list | the **negative** case — a busy supplier page that must NOT be mistaken for a catalog form |
