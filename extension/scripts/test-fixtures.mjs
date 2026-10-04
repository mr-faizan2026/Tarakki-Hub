/**
 * ════════════════════════════════════════════════════════════════════════════
 *  ADAPTER FIXTURE TESTS — does the adapter still find what it needs?
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Run: npm run test:fixtures
 *
 *  Runs the REAL discovery and shipping-read code against HTML snapshots of the
 *  Meesho screens (test/fixtures/). These exist because every other test we have
 *  would have passed on the day Meesho changed its form and the adapter stopped
 *  finding half of it: a selector test needs markup to be a test at all.
 *
 *  ── READ test/fixtures/README.md ──────────────────────────────────────────
 *  The committed fixtures are RECONSTRUCTIONS from the structure documented in
 *  config.ts, not captures from a live account. A green run here means "the
 *  adapter still behaves the way we designed it", not "the adapter still works on
 *  Meesho today". Replace them with a real sanitised capture at the first
 *  opportunity; the README says how.
 *
 *  ── THE jsdom LAYOUT SHIM, AND WHAT IT COSTS ──────────────────────────────
 *  jsdom has no layout engine: getClientRects() is always empty and offsetParent
 *  is undefined, so `isVisible` would reject every element and discovery would
 *  find nothing. The shim below supplies the one layout fact these tests need —
 *  "an element is laid out unless it or an ancestor is display:none" — and nothing
 *  else.
 *
 *  What that means honestly: these tests cover SELECTORS, LABELS, SECTIONS,
 *  CONTROL TYPING and COVERAGE. They do not and cannot cover anything that
 *  depends on real geometry (scroll-into-view, an element hidden by zero height, a
 *  dropdown that renders off-screen). Those belong to the autofill lab against
 *  real markup, and the header of fixture-entry.ts says the same about the fill
 *  engine.
 */

import { readFileSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

const root = fileURLToPath(new URL("..", import.meta.url));
const fixtureDir = path.join(root, "test", "fixtures");
const outDir = path.join(root, "node_modules", ".cache", "tk-fixtures");

/* ─── tiny test harness (same shape as test-accuracy.mjs) ──────────────── */

let passed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (err) {
    failures.push({ name, err });
    console.log(`  \x1b[31m✗\x1b[0m ${name}`);
    console.log(`      ${err.message.split("\n").join("\n      ")}`);
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function equal(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message}\n  expected: ${e}\n  actual:   ${a}`);
}

/* ─── the DOM harness ──────────────────────────────────────────────────── */

/**
 * Load one fixture into a jsdom window and install it as the globals the adapter
 * expects. The adapter reads `document`, `window`, `NodeFilter` and the element
 * constructors off the global scope exactly as it does in a content script.
 */
function loadFixture(file, pathname = "/panel/v3/new/catalog/DUMMY/single") {
  const html = readFileSync(path.join(fixtureDir, file), "utf8");
  const dom = new JSDOM(html, {
    url: `https://supplier.meesho.com${pathname}`,
    pretendToBeVisual: true,
  });
  const { window } = dom;

  installLayoutShim(window);

  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.location = window.location;
  globalThis.NodeFilter = window.NodeFilter;
  globalThis.Node = window.Node;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.HTMLInputElement = window.HTMLInputElement;
  globalThis.HTMLTextAreaElement = window.HTMLTextAreaElement;
  globalThis.HTMLSelectElement = window.HTMLSelectElement;
  globalThis.Element = window.Element;
  globalThis.getComputedStyle = window.getComputedStyle.bind(window);

  return window;
}

/**
 * The single layout fact these tests need. See the header for what this does and
 * does not buy us.
 *
 * `offsetParent` normally returns the nearest positioned ancestor and is null for
 * anything not rendered. Here it returns the parent element unless something in
 * the chain is display:none — which is enough for `isVisible` to behave sensibly,
 * and keeps the hidden size menu in the fixture correctly excluded.
 */
function installLayoutShim(window) {
  const { HTMLElement } = window;
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get() {
      let node = this;
      while (node && node !== window.document.documentElement) {
        const display = node.style?.display ?? "";
        if (display === "none") return null;
        node = node.parentElement;
      }
      return this.parentElement ?? window.document.body;
    },
  });
}

/* ─── expectations per fixture ─────────────────────────────────────────── */

/**
 * Deliberately NOT exact counts for everything.
 *
 * An exact "32 controls" assertion is a test that fails every time someone adds a
 * field to the fixture, which trains people to update the number without reading
 * why it moved — the opposite of what a regression net is for. So the counts below
 * are floors on the things that must not silently disappear, plus exact assertions
 * on the specific cases that have actually broken before.
 */

async function main() {
  console.log("\n\x1b[1mAdapter fixture tests\x1b[0m");
  console.log(
    "\x1b[2m  fixtures are reconstructions, not captures — see test/fixtures/README.md\x1b[0m\n",
  );

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const bundle = path.join(outDir, "adapter.mjs");

  await build({
    entryPoints: [path.join(root, "test", "fixture-entry.ts")],
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    outfile: bundle,
    alias: { "@": path.join(root, "src") },
    // import.meta.env is Vite's; the adapter only reads it for DEV_TOOLS.
    define: { "import.meta.env.DEV": "false", "import.meta.env.VITE_DEV_TOOLS": '""' },
    logLevel: "silent",
  });

  const adapter = await import(`file://${bundle.replace(/\\/g, "/")}`);

  /* ─── the catalog form ───────────────────────────────────────────────── */

  console.log("\n  catalog-form.html — Add Single Catalog");

  await test("finds the form root, and it is not <body>", async () => {
    loadFixture("catalog-form.html");
    const root = adapter.formRoot();
    assert(root != null, "formRoot() returned null on a real catalog form");
    assert(
      root.tagName.toLowerCase() !== "body",
      `the root widened all the way to <body> (coverage rule is ${JSON.stringify(adapter.FORM_COVERAGE)})`,
    );
  });

  await test("covers BOTH sections, not just the bigger one", async () => {
    loadFixture("catalog-form.html");
    const fields = adapter.discoverFields(adapter.formRoot());
    const labels = fields.map((f) => f.normalizedLabel);
    // This is the 0.9-coverage bug, as a test: "Product Details" alone holds most
    // of the controls, so a simple-majority rule picked that half and Product Name
    // and Size were never captured at all.
    assert(labels.includes("product name"), `Product Name missing — got ${labels.join(", ")}`);
    assert(labels.includes("size"), `Size missing — got ${labels.join(", ")}`);
    assert(labels.includes("fabric"), `Fabric missing — got ${labels.join(", ")}`);
    assert(labels.includes("hsn code"), `HSN Code missing — got ${labels.join(", ")}`);
  });

  await test("detects enough controls to be a form at all", async () => {
    loadFixture("catalog-form.html");
    const fields = adapter.discoverFields(adapter.formRoot());
    assert(
      fields.length >= 18,
      `only ${fields.length} controls detected; the fixture has well over 20`,
    );
  });

  await test("never captures the file input, the search box or page chrome", async () => {
    loadFixture("catalog-form.html");
    const fields = adapter.discoverFields(adapter.formRoot());
    const keys = fields.map((f) => `${f.normalizedLabel}|${f.attrs?.id ?? ""}`);
    assert(
      !keys.some((k) => k.includes("changeFrontImage")),
      "the front-image file input was captured — images are Part 1's job",
    );
    assert(
      !fields.some((f) => /search/i.test(f.normalizedLabel)),
      "a search box was captured as a listing field",
    );
    assert(
      !fields.some((f) => f.attrs?.name === "manufacturer_address" && f.type === "checkbox"),
      "a control was mistyped",
    );
  });

  await test("types a readonly Meesho dropdown as a dropdown, not as text", async () => {
    loadFixture("catalog-form.html");
    const fields = adapter.discoverFields(adapter.formRoot());
    const fabric = fields.find((f) => f.normalizedLabel === "fabric");
    assert(fabric != null, "Fabric not found");
    // The whole reason DROPDOWN_HINTS carries the readonly+placeholder rule: these
    // controls have no aria at all, and typing them as "text" makes every write
    // bounce off React — a form full of honest failures instead of a filled one.
    assert(
      fabric.type === "dropdown" || fabric.type === "combobox",
      `Fabric typed as "${fabric.type}"; a readonly input with a Select placeholder is a dropdown`,
    );
  });

  await test("reads a real <select> as select, with its chosen option text", async () => {
    loadFixture("catalog-form.html");
    const fields = adapter.discoverFields(adapter.formRoot());
    const pattern = fields.find((f) => f.normalizedLabel === "pattern");
    assert(pattern != null, "Pattern not found");
    equal(pattern.type, "select", "Pattern should be a native select");
    equal(pattern.value, "Printed", "a select stores the visible option text");
  });

  await test("never reads the word Select as a chosen value", async () => {
    loadFixture("catalog-form.html");
    const fields = adapter.discoverFields(adapter.formRoot());
    const noise = fields.filter((f) => /^select$/i.test(String(f.value)));
    equal(
      noise.map((f) => f.normalizedLabel),
      [],
      "PLACEHOLDER_NOISE let a placeholder through as a value",
    );
  });

  await test("marks the asterisk-labelled fields required", async () => {
    loadFixture("catalog-form.html");
    const fields = adapter.discoverFields(adapter.formRoot()).map(adapter.toScanned);
    const required = fields.filter((f) => f.required).map((f) => f.normalizedLabel);
    // Meesho supplies `required` only sometimes; the rendered asterisk is the
    // reliable signal, which is why REQUIRED_MARK is tested against the RAW label.
    assert(required.includes("product name"), "Product Name * not marked required");
    assert(required.includes("net weight"), "Net Weight * not marked required");
    assert(
      !required.includes("sku id"),
      "SKU ID has no asterisk and must not be marked required",
    );
  });

  await test("tells the three Name fields apart by section and occurrence", async () => {
    loadFixture("catalog-form.html");
    const fields = adapter.discoverFields(adapter.formRoot());
    const names = fields.filter((f) => f.normalizedLabel === "name");
    assert(names.length === 3, `expected 3 "Name" fields, found ${names.length}`);
    // Either the section disambiguates them (legend text) or the occurrence index
    // does. One of the two must, or a profile fills the packer's name into the
    // manufacturer's box.
    const identities = new Set(names.map((f) => `${f.section}|${f.occurrence}`));
    equal(
      identities.size,
      3,
      "two Name fields share one identity — a fill would write into the wrong box",
    );
  });

  await test("matches a saved field back to its own control", async () => {
    loadFixture("catalog-form.html");
    const live = adapter.discoverFields(adapter.formRoot());
    const saved = live.map(adapter.toCaptured);
    const used = new Set();
    let exact = 0;
    for (const record of saved) {
      const match = adapter.matchField(record, live, used);
      if (match) {
        used.add(match.field);
        if (match.confidence === "exact") exact++;
      }
    }
    // Round-tripping its own capture is the floor: anything less means the saved
    // identity does not describe the control it came from.
    equal(exact, saved.length, "not every field matched its own control exactly");
  });

  await test("reads the category breadcrumb, and not the page heading", async () => {
    loadFixture("catalog-form.html");
    const root = adapter.formRoot();
    const path = adapter.categoryPath(root, adapter.discoverFields(root));
    assert(path != null, "no category path read from the breadcrumb");
    assert(
      /kurtis/i.test(path),
      `expected the breadcrumb leaf, got "${path}"`,
    );
    // "Add Single Catalog" is a page title, not a category. It used to be reported
    // as one, and saved into a profile's category_path.
    assert(
      !/add single catalog/i.test(path),
      `the page heading leaked in as a category: "${path}"`,
    );
  });

  /* ─── the shipping read ──────────────────────────────────────────────── */

  console.log("\n  price-breakdown.html — the live shipping read");

  await test("reads the shipping charge from the sibling cell", async () => {
    loadFixture("price-breakdown.html", "/panel/v3/new/catalog/DUMMY/pricing");
    const hit = adapter.readShipping();
    assert(hit != null, "no shipping figure found");
    equal(hit.value, 61, "wrong figure read");
  });

  await test("rejects 'free shipping above ₹499' and 'shipping address'", async () => {
    loadFixture("price-breakdown.html", "/panel/v3/new/catalog/DUMMY/pricing");
    const hit = adapter.readShipping();
    assert(hit != null, "no shipping figure found");
    assert(
      hit.value !== 499,
      "matched the 'free shipping above' banner — SHIPPING_NEGATIVE is not holding",
    );
  });

  await test("finds no form on a pricing screen", async () => {
    loadFixture("price-breakdown.html", "/panel/v3/new/catalog/DUMMY/pricing");
    equal(adapter.formRoot(), null, "a price breakdown is not a catalog form");
  });

  /* ─── the negative case ──────────────────────────────────────────────── */

  console.log("\n  orders-list.html — must NOT look like a catalog form");

  await test("finds no catalog form on the orders list", async () => {
    loadFixture("orders-list.html", "/panel/v3/new/orders");
    const root = adapter.formRoot();
    equal(
      root,
      null,
      "the orders list was mistaken for a catalog form — the panel would offer to autofill order filters",
    );
  });

  await test("reports no form in formStatus() either", async () => {
    loadFixture("orders-list.html", "/panel/v3/new/orders");
    const status = adapter.formStatus();
    equal(status.present, false, "formStatus() claimed a form on the orders list");
  });

  /* ─── label normalisation ────────────────────────────────────────────── */

  console.log("\n  label normalisation");

  await test("strips the required asterisk, units and trailing punctuation", async () => {
    // The identity a profile is saved under is `section|normalizedLabel|occurrence`,
    // so every one of these must collapse to the SAME string or a profile saved
    // last week stops matching the form it came from after a Meesho copy tweak.
    const same = [
      "Chest Size* (INCH)",
      "Chest Size *(inch)",
      "chest size (INCH)",
      "Chest Size:",
      "  Chest   Size  ",
    ];
    const normalised = same.map((s) => adapter.normalizeLabel(s));
    equal(
      new Set(normalised).size,
      1,
      `these should all normalise alike, got ${JSON.stringify(normalised)}`,
    );
    equal(normalised[0], "chest size", "unexpected normal form");
  });

  await test("keeps the characters that distinguish real Meesho labels", async () => {
    // %, / and - carry meaning on this form. Stripping them merges "GST %" into
    // "GST" and "L/XL" into "LXL".
    equal(adapter.normalizeLabel("GST %"), "gst %", "percent is meaningful");
    equal(adapter.normalizeLabel("Net Weight - GM"), "net weight - gm", "hyphen kept");
    equal(adapter.normalizeLabel("Size L/XL"), "size l/xl", "slash kept");
  });

  await test("does not collapse two genuinely different labels", async () => {
    // The fuzzy matcher is the last resort and only fires on a single clear
    // candidate; normalisation must not do its job badly first.
    const packer = adapter.normalizeLabel("Packer Name *");
    const importer = adapter.normalizeLabel("Importer Name *");
    assert(packer !== importer, "Packer Name and Importer Name must stay distinct");
    assert(
      adapter.similarity(packer, importer) < 1,
      "similarity() should not call them identical either",
    );
  });

  /* ─── remote config: merge, reset, and refusal ───────────────────────── */

  console.log("\n  remote adapter config");

  await test("a remote config overrides a bundled default", async () => {
    loadFixture("price-breakdown.html", "/panel/v3/new/catalog/DUMMY/pricing");
    adapter.applyAdapterConfig(
      { version: 7, shipping: { labels: ["courier fee"] } },
      7,
    );
    equal(adapter.adapterConfigVersion(), 7, "the active version was not recorded");
    equal(
      adapter.SHIPPING_LABELS,
      ["courier fee"],
      "the remote labels did not take effect",
    );
    // And with those labels the fixture's own wording no longer matches, which is
    // the proof that the override is really being used rather than merged beside
    // the bundled list.
    equal(adapter.readShipping(), null, "the bundled labels were still in play");
    adapter.applyAdapterConfig(null);
  });

  await test("applying null restores the bundled defaults", async () => {
    loadFixture("price-breakdown.html", "/panel/v3/new/catalog/DUMMY/pricing");
    adapter.applyAdapterConfig({ version: 7, shipping: { labels: ["courier fee"] } }, 7);
    adapter.applyAdapterConfig(null);
    equal(adapter.adapterConfigVersion(), 0, "the version should drop back to 0");
    const hit = adapter.readShipping();
    assert(hit != null && hit.value === 61, "the bundled shipping labels did not come back");
  });

  await test("a key REMOVED from the config stops overriding", async () => {
    loadFixture("price-breakdown.html", "/panel/v3/new/catalog/DUMMY/pricing");
    adapter.applyAdapterConfig({ version: 1, shipping: { maxClimb: 9 } }, 1);
    adapter.applyAdapterConfig({ version: 2, form: { minControls: 4 } }, 2);
    // Without the reset-first rule in applyAdapterConfig, maxClimb would still be
    // 9 here and an admin would watch their deletion do nothing until a browser
    // restart — the worst kind of config bug.
    const hit = adapter.readShipping();
    assert(hit != null && hit.value === 61, "a stale override survived a second apply");
    adapter.applyAdapterConfig(null);
  });

  await test("an empty selector list is refused, not obeyed", async () => {
    loadFixture("price-breakdown.html", "/panel/v3/new/catalog/DUMMY/pricing");
    adapter.applyAdapterConfig({ version: 3, shipping: { labels: [] } }, 3);
    // "The admin cleared every selector" must not be an executable instruction.
    const hit = adapter.readShipping();
    assert(hit != null && hit.value === 61, "an empty label list disabled the read");
    adapter.applyAdapterConfig(null);
  });

  await test("timing overrides land, and engine mechanics stay bundled", async () => {
    adapter.applyAdapterConfig({ version: 4, timing: { settleQuietMs: 900 } }, 4);
    equal(adapter.TIMING.settleQuietMs, 900, "settleQuietMs was not overridden");
    equal(
      adapter.TIMING.retryBackoffMs,
      [120, 320, 640],
      "retryBackoffMs is engine mechanics and must not be remotely settable",
    );
    adapter.applyAdapterConfig(null);
    equal(adapter.TIMING.settleQuietMs, 350, "the bundled timing did not come back");
  });

  /* ─── schema validation ──────────────────────────────────────────────── */

  console.log("\n  config schema validation");

  await test("accepts a well-formed config", async () => {
    const result = adapter.validateAdapterConfig({
      version: 12,
      form: { anchorText: ["product name"], coverage: { preferred: 0.9 } },
      labels: { placeholderNoise: "^(select|choose)$" },
      timing: { settleQuietMs: 400 },
      fuzzyThreshold: 0.85,
    });
    assert(result.ok, `rejected a valid config: ${result.ok ? "" : result.reason}`);
  });

  await test("strips unknown keys rather than rejecting the payload", async () => {
    // Forward compatibility: a server that has learned a new adapter key must not
    // brick every extension that predates it.
    const result = adapter.validateAdapterConfig({
      version: 3,
      somethingNewer: { nested: true },
      shipping: { labels: ["shipping"] },
    });
    assert(result.ok, "a newer server key broke an older extension");
    assert(
      !("somethingNewer" in result.config),
      "the unknown key was kept instead of stripped",
    );
  });

  await test("rejects wrong types, out-of-range numbers and bad regexes", async () => {
    const cases = [
      [{ shipping: { labels: "shipping" } }, "a string where a list belongs"],
      [{ shipping: { labels: [""] } }, "a blank selector"],
      [{ form: { coverage: { preferred: 4 } } }, "a coverage above 1"],
      [{ timing: { settleQuietMs: 10_000_000 } }, "a settle window of hours"],
      [{ fuzzyThreshold: 0.1 }, "a fuzzy threshold that matches anything"],
      [{ labels: { placeholderNoise: "([unclosed" } }, "an invalid regular expression"],
    ];
    for (const [payload, why] of cases) {
      const result = adapter.validateAdapterConfig(payload);
      assert(!result.ok, `accepted ${why}`);
      assert(typeof result.reason === "string" && result.reason.length > 0, "no reason given");
    }
  });

  await test("an unparseable kill-switch map means nothing is switched off", async () => {
    // The opposite default would take a paying seller's whole toolkit away because
    // one field arrived malformed.
    equal(adapter.validateKillSwitches("nonsense"), {}, "should fall back to empty");
    equal(
      adapter.featureState(adapter.validateKillSwitches(null), "autofill").enabled,
      true,
      "a missing map must leave features enabled",
    );
    equal(
      adapter.featureState({ autofill: { enabled: false } }, "autofill").enabled,
      false,
      "an explicit false must disable",
    );
    assert(
      adapter.featureState({ autofill: { enabled: false } }, "autofill").message.length > 0,
      "a disabled feature must always carry a message to show",
    );
  });

  /* ─── version gating ─────────────────────────────────────────────────── */

  console.log("\n  version gating");

  await test("compares versions numerically, not as strings", async () => {
    equal(adapter.compareVersions("0.10.0", "0.9.0"), 1, "0.10.0 is newer than 0.9.0");
    equal(adapter.compareVersions("1.2", "1.2.0"), 0, "missing parts are zero");
    equal(adapter.compareVersions("1.2.3", "1.2.4"), -1, "patch comparison");
    equal(adapter.isBelow("0.9.9", "1.0.0"), true, "below the floor");
    equal(adapter.isBelow("1.0.0", "1.0.0"), false, "exactly at the floor is allowed");
  });

  await test("an unparseable version counts as old", async () => {
    // Safe direction: the alternative is treating a mangled build as current.
    equal(adapter.isBelow("not-a-version", "1.0.0"), true, "garbage must be gated");
  });

  /* ─── health privacy ─────────────────────────────────────────────────── */

  console.log("\n  health events carry no personal data");

  await test("strips the seller's shop code and every id from a path", async () => {
    equal(
      adapter.sanitisePath("https://supplier.meesho.com/panel/v3/new/catalog/MYSHOP123/single"),
      "/panel/:id/new/catalog/:id/single",
      "a shop code identifies a business and must not be reported",
    );
  });

  await test("drops the query string and the fragment entirely", async () => {
    // Ids hide in query strings, and so do search terms a seller typed.
    equal(
      adapter.sanitisePath("/panel/orders?q=dummy+product&sellerId=99#row-3"),
      "/panel/orders",
      "the query string survived",
    );
  });

  await test("replaces an over-long opaque segment", async () => {
    equal(
      adapter.sanitisePath("/panel/" + "a".repeat(40) + "/edit"),
      "/panel/:id/edit",
      "a long opaque segment is an id by any other name",
    );
  });

  /* ─── report ─────────────────────────────────────────────────────────── */

  console.log("");
  if (failures.length) {
    console.log(`\x1b[31m${failures.length} failed\x1b[0m, ${passed} passed\n`);
    process.exit(1);
  }
  console.log(`\x1b[32mAll ${passed} passed\x1b[0m\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
