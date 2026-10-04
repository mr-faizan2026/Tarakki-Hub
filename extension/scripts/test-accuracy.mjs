/**
 * ════════════════════════════════════════════════════════════════════════════
 *  ACCURACY TESTS — does a quote answer the seller's actual listing?
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Run: npm test
 *
 *  These guard the one property the whole feature rests on: the rupee figure we
 *  show must be the figure the supplier panel shows. Not close to it, not
 *  derived from the same inputs — the same number.
 *
 *  ── WHAT THESE TESTS ARE FOR ───────────────────────────────────────────────
 *  A previous version of this suite encoded a MODEL of Meesho's pricing
 *  ("the charge follows duplicate_pid and gst_type; price is irrelevant") and
 *  then asserted the code implemented that model faithfully. It did, and the
 *  result shipped ₹288 to a seller whose own panel was showing ₹110 for the
 *  same photo, with a ₹149 variant advertised as "₹139 less than your photo"
 *  when it was in truth ₹39 more.
 *
 *  So these tests assert nothing about how Meesho prices. They assert that we
 *  ASK THE PANEL'S OWN QUESTION and refuse when we can't:
 *
 *    • no captured panel request → no quote, and no traffic on the seller's
 *      account at all;
 *    • with one → its URL, its body, its unknown fields, changed in exactly one
 *      place and only when the panel itself carries that field;
 *    • nothing invented: no filler price, no filler GST, no match flags;
 *    • the panel's own answer is carried back so the side panel can refuse to
 *      display a figure that contradicts it (lib/calibration.ts).
 *
 *  The fake Meesho below returns plausible numbers so the assertions have
 *  something to compare, but no test depends on its pricing rule being right —
 *  only on our request being the panel's request.
 *
 *  The real src/content modules are bundled and exercised directly — nothing is
 *  reimplemented here, so these tests fail if the shipped code regresses.
 */

import { readFileSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { build } from "esbuild";

const root = fileURLToPath(new URL("..", import.meta.url));
const outDir = path.join(root, "node_modules", ".cache", "tk-accuracy");

/* ─── tiny test harness ────────────────────────────────────────────────── */

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

async function throws(fn, message) {
  try {
    await fn();
  } catch (err) {
    return err;
  }
  throw new Error(message);
}

/* ─── the stubbed supplier-panel tab ───────────────────────────────────── */

const SUPPLIER_ID = "4462539";
const ORIGIN = "https://supplier.meesho.com";
const PRICE_PATH = "/api/cataloging/singleCatalogUpload/getTransferPrice";
const MATCH_PATH = "/api/cataloging/priceRecommendation/fetchDuplicatePid";

/**
 * A stand-in for Meesho, shaped like the behaviour observed on a live account:
 * a matched product dominates the charge and the GST registration shifts it.
 *
 * NOTHING here is a claim about how Meesho really prices, and no assertion in
 * this file depends on it. It exists so that "our figure is the figure for the
 * body we sent" and "we sent the panel's body" can both be checked.
 */
const shippingFor = (body) =>
  (body?.duplicate_pid != null ? 288 : 110) + (body?.gst_type === "GSTIN" ? 10 : 0);

/** Minimal window: message events (for the probe) + a swappable fetch. */
function makeWindow() {
  const listeners = [];
  const win = {
    addEventListener: (type, fn) => type === "message" && listeners.push(fn),
    postMessage(data, targetOrigin) {
      const event = { data, source: win, origin: targetOrigin };
      for (const fn of listeners) fn(event);
    },
  };
  return win;
}

function makeMeesho() {
  const calls = [];

  const json = (value) =>
    new Response(JSON.stringify(value), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  const broken = { pricing: false };
  const matching = { pid: 777 };

  const fetch = async (url, init = {}) => {
    const p = new URL(url).pathname;
    const body = typeof init.body === "string" ? JSON.parse(init.body) : (init.body ?? null);
    calls.push({ path: p, body });

    if (p.endsWith("/uploadSingleCatalogImages")) return json({ image: `${ORIGIN}/i/up.jpg` });
    if (p.includes("fetchDuplicatePid")) {
      // The real match step answers ₹10 above the pricing step's figure: it is
      // the GSTIN number, while the panel's own line renders shipping_charges.
      return json({
        data: {
          duplicate_pid: matching.pid,
          wu_shipping_charge: shippingFor({ duplicate_pid: matching.pid }) + 10,
        },
      });
    }
    if (p.includes("getTransferPrice") || p.includes("priceThing")) {
      return json(broken.pricing ? {} : { shipping_charges: shippingFor(body) });
    }
    return json({});
  };

  const lastBody = (fragment) =>
    [...calls].reverse().find((c) => c.path.includes(fragment))?.body ?? null;
  const lastPath = (fragment) =>
    [...calls].reverse().find((c) => c.path.includes(fragment))?.path ?? null;

  return {
    fetch,
    calls,
    lastBody,
    lastPath,
    breakPricing: () => (broken.pricing = true),
    /** Meesho recognises nothing in the image — a real and common answer. */
    matchNothing: () => (matching.pid = undefined),
    reset: () => (calls.length = 0),
  };
}

/** Fresh module state per test — the capture cache is module-level by design. */
async function loadModules(bundlePath, meesho) {
  globalThis.window = makeWindow();
  globalThis.document = { cookie: `s_id=${SUPPLIER_ID}; other=1` };
  globalThis.location = {
    origin: ORIGIN,
    pathname: "/panel/v3/new/catalog/TESTSELLER/single",
  };
  globalThis.fetch = meesho.fetch;
  // Cache-bust so each test gets a clean module registry.
  const mod = await import(`${bundlePath}?v=${Math.random()}`);
  mod.watchPanelCalls();
  return mod;
}

/** Pretend the panel itself made a call; the probe reports it. */
function panelCalled(request, options = {}) {
  const {
    endpoint = "getTransferPrice",
    url = endpoint === "getTransferPrice" ? PRICE_PATH : MATCH_PATH,
    response = endpoint === "getTransferPrice"
      ? { shipping_charges: shippingFor(request) }
      : { data: { duplicate_pid: 777 } },
  } = options;
  globalThis.window.postMessage(
    {
      __tarakkihub: "tarakkihub:panel-call",
      call: { endpoint, url, method: "POST", at: Date.now(), request, headers: {}, response },
    },
    ORIGIN,
  );
}

const IMAGE = () => new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });

/* ─── build + run ──────────────────────────────────────────────────────── */

async function main() {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const outfile = path.join(outDir, "entry.mjs");

  await build({
    entryPoints: [path.join(root, "test", "entry.ts")],
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    outfile,
    alias: { "@": path.join(root, "src") },
    logLevel: "silent",
  });
  const bundle = `file://${outfile.split(path.sep).join("/")}`;
  const probeSource = readFileSync(path.join(root, "public", "panel-probe.js"), "utf8");

  /* The listing the seller is actually making, as the panel's own pricing
   * request describes it — including a field we have never heard of and the
   * matched product the panel forwards. */
  const PANEL_SSCAT = 1234;
  const panelBody = () => ({
    sscat_id: PANEL_SSCAT,
    price: 499,
    gst_percentage: 5,
    gst_type: "GSTIN",
    supplier_id: Number(SUPPLIER_ID),
    duplicate_pid: 55,
    a_field_meesho_added_later: "keep-me",
  });

  console.log("\n\x1b[1mNothing is quoted that cannot be mirrored\x1b[0m\n");

  await test("refuses to quote at all with no captured panel request", async () => {
    const meesho = makeMeesho();
    const { quoteImage, MeeshoApiError } = await loadModules(bundle, meesho);

    const err = await throws(
      () => quoteImage(IMAGE(), "v1.jpg", PANEL_SSCAT, null),
      "quoting without a panel capture must fail, not guess",
    );
    assert(err instanceof MeeshoApiError, "should raise a typed API error");
    equal(err.code, "no_panel_capture", "the refusal must name its reason");
    equal(meesho.calls.length, 0, "and must not touch the seller's account at all");
  });

  await test("a missing probe is reported as a reload, not as a price to type", async () => {
    const meesho = makeMeesho();
    const { quoteImage } = await loadModules(bundle, meesho);
    const err = await throws(
      () => quoteImage(IMAGE(), "v1.jpg", PANEL_SSCAT, null),
      "should refuse",
    );
    assert(/reload/i.test(err.message), `unhelpful message: ${err.message}`);
  });

  console.log("\n\x1b[1mThe request IS the panel's request\x1b[0m\n");

  await test("posts the panel's own body, to the panel's own URL", async () => {
    const meesho = makeMeesho();
    const { quoteImage } = await loadModules(bundle, meesho);
    // Meesho renamed the endpoint and added a field: both must ride along.
    panelCalled(panelBody(), { url: "/api/cataloging/v9/priceThing" });

    await quoteImage(IMAGE(), "v1.jpg", PANEL_SSCAT, null);

    equal(meesho.lastPath("priceThing"), "/api/cataloging/v9/priceThing", "mirror the URL too");
    const sent = meesho.lastBody("priceThing");
    equal(sent.price, 499, "the seller's price, not a filler");
    equal(sent.gst_percentage, 5, "the seller's GST, not a filler");
    equal(sent.gst_type, "GSTIN", "the seller's registration, never re-derived");
    equal(sent.a_field_meesho_added_later, "keep-me", "unmodelled fields must survive");
  });

  await test("changes the matched product and nothing else", async () => {
    const meesho = makeMeesho();
    const { quoteImage } = await loadModules(bundle, meesho);
    panelCalled(panelBody());

    await quoteImage(IMAGE(), "v1.jpg", PANEL_SSCAT, null);
    const { duplicate_pid, ...rest } = meesho.lastBody("getTransferPrice");
    const { duplicate_pid: _panelPid, ...panelRest } = panelBody();

    equal(duplicate_pid, 777, "the image's matched pid is the one variable");
    equal(rest, panelRest, "every other field must equal the panel's own request");
  });

  console.log("\n\x1b[1mMirror mode — the calibration probe touches nothing\x1b[0m\n");

  await test("mirror mode posts the panel's body byte-for-byte", async () => {
    // The ₹288 guard, in its correct form. This quote's ONLY job is to come
    // back equal to the figure the panel is displaying, which it can only do if
    // the body is the panel's own, entirely unmodified.
    const meesho = makeMeesho();
    const { quoteImage } = await loadModules(bundle, meesho);
    const body = panelBody();
    panelCalled(body);

    const quote = await quoteImage(null, "calibration", PANEL_SSCAT, null, null, "mirror");

    equal(meesho.lastBody("getTransferPrice"), body, "not one field may differ");
    equal(quote.shipping, shippingFor(body), "so the figure is the panel's own figure");
    equal(quote.basis, "panel-mirror", "and it is labelled as the probe, never as a quote");
  });

  await test("mirror mode uploads nothing and matches nothing", async () => {
    // An upload here would put traffic on the seller's account to compute a
    // number the image cannot influence — the body doesn't reference it.
    const meesho = makeMeesho();
    const { quoteImage } = await loadModules(bundle, meesho);
    panelCalled(panelBody());

    await quoteImage(null, "calibration", PANEL_SSCAT, null, null, "mirror");

    equal(meesho.lastPath("uploadSingleCatalogImages"), null, "no upload");
    equal(meesho.lastPath("fetchDuplicatePid"), null, "no match call");
    equal(meesho.calls.length, 1, "exactly one request: the panel's own");
  });

  await test("mirror mode ignores a price the seller typed here", async () => {
    // Otherwise calibration compares a figure priced at ₹799 against a panel
    // displaying its own ₹499 figure, calls the difference a mismatch, and
    // stops the run over a disagreement we manufactured ourselves. A seller
    // sanity-checking a price they haven't typed into Meesho yet is exactly
    // who the manual mode is for.
    const meesho = makeMeesho();
    const { quoteImage } = await loadModules(bundle, meesho);
    const body = panelBody();
    panelCalled(body);

    const quote = await quoteImage(
      null,
      "calibration",
      PANEL_SSCAT,
      { price: 799, gstPercent: 12 },
      null,
      "mirror",
    );

    equal(meesho.lastBody("getTransferPrice"), body, "the panel's price, not the typed one");
    equal(quote.shipping, shippingFor(body), "so it still reproduces the panel's figure");
  });

  await test("mirror mode keeps a null duplicate_pid null", async () => {
    // The real panel sends `duplicate_pid: null` constantly. In mirror mode
    // that null IS the answer and must survive — replacing it would destroy the
    // one check that can catch us pricing a different listing.
    const meesho = makeMeesho();
    const { quoteImage } = await loadModules(bundle, meesho);
    const nullMatchBody = { ...panelBody(), duplicate_pid: null };
    panelCalled(nullMatchBody);

    const quote = await quoteImage(null, "calibration", PANEL_SSCAT, null, null, "mirror");

    equal(meesho.lastBody("getTransferPrice"), nullMatchBody, "verbatim, null included");
    equal(quote.shipping, shippingFor(nullMatchBody), "the panel's own figure");
  });

  console.log("\n\x1b[1mMatch mode — the image's own match, and nothing else\x1b[0m\n");

  await test("sets duplicate_pid even when the panel's own body sends null", async () => {
    // The over-correction this replaces. Refusing here is why sellers were told
    // "no image can change this figure" on listings that demonstrably move: the
    // panel sends null whenever it re-prices without re-matching, which is most
    // of the time. The question the seller is asking is "what if THIS photo
    // were the front image", and that question has a matched product in it.
    const meesho = makeMeesho();
    const { quoteImage } = await loadModules(bundle, meesho);
    const nullMatchBody = { ...panelBody(), duplicate_pid: null };
    panelCalled(nullMatchBody);

    const quote = await quoteImage(IMAGE(), "v1.jpg", PANEL_SSCAT, null);
    const sent = meesho.lastBody("getTransferPrice");
    const { duplicate_pid, ...rest } = sent;
    const { duplicate_pid: _null, ...restOfPanel } = nullMatchBody;

    equal(duplicate_pid, 777, "the image's own match is what we ask about");
    equal(rest, restOfPanel, "and it is the ONLY field that moves");
    equal(quote.basis, "photo-match", "labelled as an answer about the photo");
    equal(quote.debug.templateDuplicatePid, null, "the diagnostic says what the panel had");
  });

  await test("adds duplicate_pid when the panel's body omits the key entirely", async () => {
    const meesho = makeMeesho();
    const { quoteImage } = await loadModules(bundle, meesho);
    const { duplicate_pid: _drop, ...noMatchBody } = panelBody();
    panelCalled(noMatchBody);

    await quoteImage(IMAGE(), "v1.jpg", PANEL_SSCAT, null);
    const { duplicate_pid, ...rest } = meesho.lastBody("getTransferPrice");

    equal(duplicate_pid, 777, "a missing key is not a reason to refuse the question");
    equal(rest, noMatchBody, "everything else stays the panel's");
  });

  await test("removes duplicate_pid rather than asserting a match of null", async () => {
    // Meesho found nothing for this image. "Priced with no match" is the honest
    // body; `duplicate_pid: null` would be us claiming a fact we don't have.
    const meesho = makeMeesho();
    const { quoteImage } = await loadModules(bundle, meesho);
    panelCalled(panelBody());
    meesho.matchNothing();

    const quote = await quoteImage(IMAGE(), "v1.jpg", PANEL_SSCAT, null);
    const sent = meesho.lastBody("getTransferPrice");

    assert(!("duplicate_pid" in sent), "the key is dropped, not nulled");
    equal(quote.duplicatePid, null, "and the quote reports that nothing matched");
  });

  await test("the panel's own photo and a variant are asked the SAME question", async () => {
    // THE invariant the ₹288 incident broke. Both figures were real; they
    // answered different questions, and the UI subtracted them anyway. Every
    // ranked figure in a run — baseline included — must be match mode, so the
    // only difference between two bodies is the pid Meesho chose.
    const meesho = makeMeesho();
    const { quoteImage } = await loadModules(bundle, meesho);
    panelCalled(panelBody());

    const baseline = await quoteImage(IMAGE(), "your-photo.jpg", PANEL_SSCAT, null);
    const baselineBody = meesho.lastBody("getTransferPrice");
    const variant = await quoteImage(IMAGE(), "v1.jpg", PANEL_SSCAT, null);
    const variantBody = meesho.lastBody("getTransferPrice");

    equal(baseline.basis, variant.basis, "same basis, or the two cannot be subtracted");
    const { duplicate_pid: _a, ...baseRest } = baselineBody;
    const { duplicate_pid: _b, ...varRest } = variantBody;
    equal(baseRest, varRest, "and the bodies differ in the matched product alone");
  });

  await test("reports whether the panel prices by match at all", async () => {
    const meesho = makeMeesho();
    const { pricingContext } = await loadModules(bundle, meesho);

    panelCalled({ ...panelBody(), duplicate_pid: null });
    equal(pricingContext().pricesByMatch, false, "a null match is not a match");
    equal(pricingContext().panelDuplicatePid, null, "and there is no pid to report");

    panelCalled(panelBody()); // duplicate_pid: 55
    equal(pricingContext().pricesByMatch, true, "a real pid means the photo is in play");
    equal(pricingContext().panelDuplicatePid, 55, "and the side panel can see which");
  });

  await test("never invents match flags", async () => {
    // `is_old_image_match_enabled: true` was invented here once. It widened
    // Meesho's matching until every photo matched something heavy.
    const meesho = makeMeesho();
    const { quoteImage } = await loadModules(bundle, meesho);
    panelCalled(panelBody()); // pricing captured, but no match call seen

    await quoteImage(IMAGE(), "v1.jpg", PANEL_SSCAT, null);
    const sent = meesho.lastBody("fetchDuplicatePid");

    equal(
      Object.keys(sent).sort(),
      ["image_url", "sscat_id"],
      "with nothing to mirror, send only what identifies the image",
    );
  });

  await test("mirrors the panel's own match request when there is one", async () => {
    const meesho = makeMeesho();
    const { quoteImage } = await loadModules(bundle, meesho);
    panelCalled(panelBody());
    panelCalled(
      { sscat_id: PANEL_SSCAT, image_url: "old.jpg", is_old_image_match_enabled: false, extra: 7 },
      { endpoint: "fetchDuplicatePid", url: "/api/cataloging/v9/matchThing" },
    );

    await quoteImage(IMAGE(), "v1.jpg", PANEL_SSCAT, null);
    const sent = meesho.lastBody("matchThing");

    equal(sent.is_old_image_match_enabled, false, "must match the way the panel matches");
    equal(sent.extra, 7, "unmodelled match fields must survive");
    equal(sent.image_url, `${ORIGIN}/i/up.jpg`, "but the image under test is ours");
  });

  await test("quotes the panel's category, not the one picked in our side panel", async () => {
    const meesho = makeMeesho();
    const { quoteImage } = await loadModules(bundle, meesho);
    panelCalled(panelBody()); // the listing is in 1234…

    const quote = await quoteImage(IMAGE(), "v1.jpg", 9999, null); // …whatever was picked
    equal(meesho.lastBody("getTransferPrice").sscat_id, PANEL_SSCAT, "the listing's category wins");
    equal(meesho.lastBody("fetchDuplicatePid").sscat_id, PANEL_SSCAT, "including for the match");
    equal(quote.sscatId, PANEL_SSCAT, "and the quote says which it answered for");
  });

  await test("invents no price and no GST when the panel's request carries none", async () => {
    const meesho = makeMeesho();
    const { quoteImage } = await loadModules(bundle, meesho);
    panelCalled({ sscat_id: PANEL_SSCAT, supplier_id: Number(SUPPLIER_ID) });

    const quote = await quoteImage(IMAGE(), "v1.jpg", PANEL_SSCAT, null);
    const sent = meesho.lastBody("getTransferPrice");

    assert(!("price" in sent), "no filler price");
    assert(!("gst_percentage" in sent), "no filler GST rate");
    assert(!("gst_type" in sent), "no re-derived registration");
    equal(quote.price, null, "and the quote admits it has no price to report");
  });

  await test("the seller's typed price overrides the price and nothing else", async () => {
    const meesho = makeMeesho();
    const { quoteImage } = await loadModules(bundle, meesho);
    panelCalled(panelBody());

    const quote = await quoteImage(IMAGE(), "v1.jpg", PANEL_SSCAT, { price: 799, gstPercent: 12 });
    const sent = meesho.lastBody("getTransferPrice");

    equal(sent.price, 799, "the seller's typed price must be used");
    equal(sent.gst_percentage, 12, "the seller's typed GST must be used");
    equal(sent.gst_type, "GSTIN", "their registration is still the panel's");
    equal(quote.basis, "manual", "a typed price is labelled");
    equal(quote.shipping, shippingFor(sent), "the figure must be that request's figure");
  });

  await test("the newest panel reading wins", async () => {
    const meesho = makeMeesho();
    const { quoteImage } = await loadModules(bundle, meesho);
    panelCalled(panelBody());
    panelCalled({ ...panelBody(), price: 650 }); // seller re-typed their price

    const quote = await quoteImage(IMAGE(), "v1.jpg", PANEL_SSCAT, null);
    equal(quote.price, 650, "a stale price must not outlive the seller's edit");
  });

  await test("a run pinned to one capture refuses to mix in another", async () => {
    // The seller retypes their price mid-run. Quoting the rest against the new
    // listing would rank images that were never compared on equal terms.
    const meesho = makeMeesho();
    const { quoteImage, pricingContext, MeeshoApiError } = await loadModules(bundle, meesho);
    panelCalled(panelBody());
    const pinned = pricingContext().signature;
    assert(pinned, "a capture must have a signature to pin to");

    await quoteImage(IMAGE(), "a.jpg", PANEL_SSCAT, null, pinned); // fine so far
    panelCalled({ ...panelBody(), price: 650 }); // …and now they retype

    const err = await throws(
      () => quoteImage(IMAGE(), "b.jpg", PANEL_SSCAT, null, pinned),
      "a re-priced panel must stop the run, not quietly change the question",
    );
    equal(err.code, "panel_changed", "and say so");
    assert(err instanceof MeeshoApiError, "as a typed error");
  });

  await test("an identical re-read of the same request is not a change", async () => {
    const meesho = makeMeesho();
    const { quoteImage, pricingContext } = await loadModules(bundle, meesho);
    panelCalled(panelBody());
    const pinned = pricingContext().signature;
    panelCalled(panelBody()); // the panel re-issued the very same request

    const quote = await quoteImage(IMAGE(), "a.jpg", PANEL_SSCAT, null, pinned);
    assert(quote.shipping > 0, "the same question asked twice must not abort a run");
  });

  await test("carries the panel's own figure back for calibration", async () => {
    const meesho = makeMeesho();
    const { quoteImage } = await loadModules(bundle, meesho);
    const body = panelBody();
    panelCalled(body, { response: { shipping_charges: 110 } });

    const quote = await quoteImage(IMAGE(), "v1.jpg", PANEL_SSCAT, null);
    equal(quote.debug.panelShipping, 110, "the side panel must be able to check us");
    equal(quote.debug.panelDuplicatePid, null, "and see what the panel matched, when known");
  });

  await test("fails loudly rather than reporting the match step's figure", async () => {
    const meesho = makeMeesho();
    const { quoteImage, MeeshoApiError } = await loadModules(bundle, meesho);
    panelCalled(panelBody());
    // wu_shipping_charge is shipping_charges + ₹10. If pricing returns nothing,
    // reporting it would overstate every image.
    meesho.breakPricing();

    const err = await throws(
      () => quoteImage(IMAGE(), "v1.jpg", PANEL_SSCAT, null),
      "a missing shipping charge must not be papered over",
    );
    assert(err instanceof MeeshoApiError, "should raise a typed API error");
    assert(
      !/\b(298|308)\b/.test(String(err.message)),
      "must not leak the match step's figure as a price",
    );
  });

  console.log("\n\x1b[1mCalibration — our figure must be the panel's figure\x1b[0m\n");

  await test("agreement passes, disagreement is not a warning but a stop", async () => {
    const { calibrate, isCalibrated } = await loadModules(bundle, makeMeesho());

    equal(calibrate(110, 110), { status: "ok", panel: 110, ours: 110 }, "agreement");
    equal(calibrate(288, 110), { status: "mismatch", panel: 110, ours: 288 }, "the shipped bug");
    assert(!isCalibrated(calibrate(288, 110)), "a mismatch may never show prices");
    assert(!isCalibrated(calibrate(111, 110)), "not even by ₹1");
    assert(isCalibrated(calibrate(110, 110)), "agreement may");
  });

  await test("no reference figure is treated exactly like a mismatch", async () => {
    const { calibrate, isCalibrated } = await loadModules(bundle, makeMeesho());
    equal(calibrate(288, null), { status: "no-reference", ours: 288 }, "nothing to check against");
    assert(!isCalibrated(calibrate(288, null)), "unverifiable is not the same as fine");
    equal(calibrate(null, 110), { status: "pending" }, "no figure of ours yet");
  });

  await test("prefers the response to the request we mirrored", async () => {
    const { panelFigure } = await loadModules(bundle, makeMeesho());
    equal(panelFigure(110, 288, 999), 110, "the mirrored call's own answer wins");
    equal(panelFigure(null, undefined, 288), 288, "falling back in order");
    equal(panelFigure(null, null), null, "and admitting when there is none");
  });

  console.log("\n\x1b[1mComparability — a saving is not just subtraction\x1b[0m\n");

  await test("refuses to subtract two figures that answered different questions", async () => {
    // The arithmetic the ₹288 incident actually got wrong. Both numbers were
    // real Meesho responses; one was priced against a match and one wasn't, and
    // the difference between them was presented as money saved.
    const { savingBetween, comparableBasis } = await loadModules(bundle, makeMeesho());

    const mirror = { shipping: 110, basis: "panel-mirror" };
    const matched = { shipping: 149, basis: "photo-match" };

    equal(savingBetween(mirror, matched), null, "mirror minus match is not a saving");
    assert(!comparableBasis("panel-mirror", "photo-match"), "and the two are not comparable");
    assert(!comparableBasis("photo-match", "manual"), "nor a typed price and a panel one");
  });

  await test("subtracts freely when both answered the same question", async () => {
    const { savingBetween } = await loadModules(bundle, makeMeesho());
    const base = { shipping: 68, basis: "photo-match" };

    equal(savingBetween(base, { shipping: 58, basis: "photo-match" }), 10, "₹10 cheaper");
    equal(savingBetween(base, { shipping: 68, basis: "photo-match" }), 0, "no change");
    equal(savingBetween(base, { shipping: 74, basis: "photo-match" }), -6, "and ₹6 worse");
    equal(savingBetween(null, { shipping: 58, basis: "photo-match" }), null, "no baseline");
  });

  console.log("\n\x1b[1mVariations — a run has to actually vary\x1b[0m\n");

  const specsFor = (buildVariantSpecs, count, seed) =>
    buildVariantSpecs({ count, seed, stickerIds: ["a", "b", "c"], withStickers: true });

  await test("every variant in a run is a different picture", async () => {
    // Twenty near-identical images match the same catalog product and quote the
    // same rupee — twenty uploads on the seller's account that prove nothing.
    // Spread IS the feature.
    const { buildVariantSpecs } = await loadModules(bundle, makeMeesho());
    const specs = specsFor(buildVariantSpecs, 20, 42);

    equal(specs.length, 20, "the run is the size asked for");
    const looks = new Set(
      specs.map((s) =>
        JSON.stringify([
          s.footprint.toFixed(3),
          s.crop.zoom.toFixed(3),
          s.border?.color ?? null,
          s.border?.width.toFixed(4) ?? null,
        ]),
      ),
    );
    equal(looks.size, 20, "no two variants may be the same look");
  });

  await test("covers the whole size and crop range, not just the middle", async () => {
    const { buildVariantSpecs } = await loadModules(bundle, makeMeesho());
    const specs = specsFor(buildVariantSpecs, 12, 7);

    const foots = specs.map((s) => s.footprint);
    const zooms = specs.map((s) => s.crop.zoom);
    assert(Math.min(...foots) < 0.45, `smallest framing too timid: ${Math.min(...foots)}`);
    assert(Math.max(...foots) > 0.85, `largest framing too timid: ${Math.max(...foots)}`);
    assert(Math.max(...zooms) > 1.15, `never crops in: ${Math.max(...zooms)}`);
    assert(Math.min(...zooms) < 1.05, `never shows the whole product: ${Math.min(...zooms)}`);
  });

  await test("does not walk one diagonal — size and crop are independent", async () => {
    // If both axes were stratified in the same order, variant #3 would always be
    // "small and tight" and half the combinations would never be tried. The
    // combinations are what produce different matches.
    const { buildVariantSpecs } = await loadModules(bundle, makeMeesho());
    const specs = specsFor(buildVariantSpecs, 16, 99);

    const n = specs.length;
    const rank = (key) =>
      specs
        .map((s, i) => ({ v: key(s), i }))
        .sort((a, b) => a.v - b.v)
        .map((x, r) => ({ i: x.i, r }))
        .sort((a, b) => a.i - b.i)
        .map((x) => x.r);
    const rf = rank((s) => s.footprint);
    const rz = rank((s) => s.crop.zoom);
    const mean = (n - 1) / 2;
    let num = 0;
    let df = 0;
    let dz = 0;
    for (let i = 0; i < n; i++) {
      num += (rf[i] - mean) * (rz[i] - mean);
      df += (rf[i] - mean) ** 2;
      dz += (rz[i] - mean) ** 2;
    }
    const corr = num / Math.sqrt(df * dz);
    assert(Math.abs(corr) < 0.6, `size and crop move together (r=${corr.toFixed(2)})`);
  });

  await test("uses many frame colours rather than re-drawing the same one", async () => {
    const { buildVariantSpecs } = await loadModules(bundle, makeMeesho());
    const specs = specsFor(buildVariantSpecs, 12, 5);
    const colors = new Set(specs.map((s) => s.border?.color).filter(Boolean));
    assert(colors.size >= 8, `only ${colors.size} distinct frame colours in 12 variants`);
  });

  await test("keeps every crop inside the product, never sampling past its edge", async () => {
    // A crop window that runs off the bounding box samples background, which is
    // a cut-off garment and a QC rejection however cheap it quotes.
    const { buildVariantSpecs, sourceRectFor } = await loadModules(bundle, makeMeesho());
    const bbox = { x: 40, y: 10, width: 600, height: 900 };

    for (const spec of specsFor(buildVariantSpecs, 30, 3)) {
      const r = sourceRectFor(bbox, spec);
      assert(r.x >= bbox.x - 1e-6, `crop starts left of the product: ${r.x}`);
      assert(r.y >= bbox.y - 1e-6, `crop starts above the product: ${r.y}`);
      assert(
        r.x + r.width <= bbox.x + bbox.width + 1e-6,
        `crop runs past the right edge: ${r.x + r.width}`,
      );
      assert(
        r.y + r.height <= bbox.y + bbox.height + 1e-6,
        `crop runs past the bottom edge: ${r.y + r.height}`,
      );
    }
  });

  await test("places the product at the footprint it promises, undistorted", async () => {
    // The footprint is the LONGEST side as a fraction of the canvas edge, and the
    // aspect must come from the CROPPED source — not the raw bounding box, or a
    // cropped variant arrives stretched. A distorted garment is both an obviously
    // worse listing and a match nobody can reason about.
    const { buildVariantSpecs, productRectFor, sourceRectFor } = await loadModules(
      bundle,
      makeMeesho(),
    );
    const size = 1000;

    for (const bbox of [
      { x: 0, y: 0, width: 600, height: 900 }, // portrait, the usual case
      { x: 20, y: 30, width: 900, height: 400 }, // landscape
      { x: 5, y: 5, width: 500, height: 500 }, // square
    ]) {
      for (const spec of specsFor(buildVariantSpecs, 20, 7)) {
        const rect = productRectFor(size, bbox, spec);
        const src = sourceRectFor(bbox, spec);

        const longest = Math.max(rect.width, rect.height);
        assert(
          Math.abs(longest - spec.footprint * size) < 0.5,
          `longest side ${longest.toFixed(1)} should be footprint ${spec.footprint.toFixed(3)} × ${size}`,
        );

        const srcAspect = src.width / src.height;
        const dstAspect = rect.width / rect.height;
        assert(
          Math.abs(srcAspect - dstAspect) < 1e-6,
          `aspect distorted: source ${srcAspect.toFixed(4)} vs drawn ${dstAspect.toFixed(4)}`,
        );
      }
    }
  });

  await test("never pushes the product off the canvas, whatever the offset", async () => {
    // `offset` nudges within the FREE margin, so a 97%-footprint variant has
    // almost no room and a 34% one has plenty. Both must stay on the canvas: a
    // product clipped by the edge is a QC rejection no matter what it quotes.
    const { buildVariantSpecs, productRectFor } = await loadModules(bundle, makeMeesho());
    const size = 1000;
    const bbox = { x: 0, y: 0, width: 600, height: 900 };

    for (const spec of specsFor(buildVariantSpecs, 30, 11)) {
      const rect = productRectFor(size, bbox, spec);
      assert(rect.x >= -0.5, `product starts off the left edge: ${rect.x.toFixed(2)}`);
      assert(rect.y >= -0.5, `product starts off the top edge: ${rect.y.toFixed(2)}`);
      assert(
        rect.x + rect.width <= size + 0.5,
        `product runs past the right edge: ${(rect.x + rect.width).toFixed(2)}`,
      );
      assert(
        rect.y + rect.height <= size + 0.5,
        `product runs past the bottom edge: ${(rect.y + rect.height).toFixed(2)}`,
      );
    }
  });

  await test("keeps every sticker on the product, not on the background", async () => {
    // A sticker is a promo badge printed ON the garment. One that spills onto the
    // backdrop reads as a slapped-on watermark — a worse listing, and the kind of
    // thing Meesho QC rejects. It still QUOTES fine, which is what made this easy
    // to miss until this test existed.
    //
    // The specific failure: `scale` is a fraction of the product's LONGEST side,
    // and a garment photo is portrait. At footprint 0.97 on a 600×900 product the
    // longest side is the ~970px height while the product is only ~647px wide, so
    // a 0.29-scale badge at the lower-right spot (px 0.82) hung ~80px off the side
    // of the garment. stickerRectFor clamps it; this asserts the clamp holds.
    const { buildVariantSpecs, productRectFor, stickerRectFor } = await loadModules(
      bundle,
      makeMeesho(),
    );
    const size = 1000;

    let stickersChecked = 0;
    for (const bbox of [
      { x: 0, y: 0, width: 600, height: 900 }, // portrait — the case that broke
      { x: 0, y: 0, width: 900, height: 400 }, // landscape
      { x: 0, y: 0, width: 500, height: 500 }, // square
    ]) {
      for (const spec of specsFor(buildVariantSpecs, 40, 23)) {
        const rect = productRectFor(size, bbox, spec);

        for (const sticker of spec.stickers) {
          // Both extremes of the art we ship: a wide badge and a square one. The
          // square is the harsher case, since it is taller for the same width.
          for (const aspect of [2.4, 1]) {
            stickersChecked++;
            const placed = stickerRectFor(rect, sticker, aspect);

            // The badge is drawn rotated about its centre, so what has to fit is
            // the rotated bounding box, not the plain one.
            const radians = (sticker.rotation * Math.PI) / 180;
            const cos = Math.abs(Math.cos(radians));
            const sin = Math.abs(Math.sin(radians));
            const spanX = placed.width * cos + placed.height * sin;
            const spanY = placed.width * sin + placed.height * cos;
            const cx = placed.x + placed.width / 2;
            const cy = placed.y + placed.height / 2;

            assert(
              cx - spanX / 2 >= rect.x - 1,
              `sticker spills off the product's left edge (${(cx - spanX / 2).toFixed(1)} < ${rect.x.toFixed(1)})`,
            );
            assert(
              cx + spanX / 2 <= rect.x + rect.width + 1,
              `sticker spills off the product's right edge (${(cx + spanX / 2).toFixed(1)} > ${(rect.x + rect.width).toFixed(1)})`,
            );
            assert(
              cy - spanY / 2 >= rect.y - 1,
              "sticker spills off the product's top edge",
            );
            assert(
              cy + spanY / 2 <= rect.y + rect.height + 1,
              "sticker spills off the product's bottom edge",
            );
            assert(
              placed.width <= rect.width + 1 && placed.height <= rect.height + 1,
              "sticker is larger than the product it sits on",
            );
          }
        }
      }
    }
    assert(stickersChecked > 0, "no stickers were generated, so nothing was checked");
  });

  await test("a clamped sticker is shrunk, never squashed", async () => {
    // Clamping must preserve the art's aspect: a stretched promo badge looks like
    // a rendering bug, which is worse than a slightly smaller one.
    const { stickerRectFor } = await loadModules(bundle, makeMeesho());
    const product = { x: 100, y: 50, width: 200, height: 900 };
    const placed = stickerRectFor(
      // Deliberately absurd: a badge asking for 90% of the long side on a narrow
      // product, pinned hard into the corner.
      product,
      { px: 0.95, py: 0.95, scale: 0.9, rotation: 0 },
      2.4,
    );
    assert(
      Math.abs(placed.width / placed.height - 2.4) < 1e-6,
      `aspect changed: ${(placed.width / placed.height).toFixed(3)} instead of 2.4`,
    );
    assert(placed.width <= product.width + 1e-6, "clamped sticker is still too wide");
    assert(
      placed.x >= product.x - 1e-6 &&
        placed.x + placed.width <= product.x + product.width + 1e-6,
      "clamped sticker still sits outside the product",
    );
  });

  await test("a run with stickers off produces none at all", async () => {
    const { buildVariantSpecs } = await loadModules(bundle, makeMeesho());
    const specs = buildVariantSpecs({
      count: 20,
      seed: 5,
      stickerIds: ["a", "b"],
      withStickers: false,
    });
    equal(
      specs.flatMap((s) => s.stickers),
      [],
      "withStickers: false must mean no stickers",
    );
  });

  await test("a seed reproduces a run exactly", async () => {
    // The card preview and the bytes Meesho quoted must be the same picture.
    const { buildVariantSpecs } = await loadModules(bundle, makeMeesho());
    equal(
      specsFor(buildVariantSpecs, 8, 1234),
      specsFor(buildVariantSpecs, 8, 1234),
      "same seed, same run",
    );
  });

  console.log("\n\x1b[1mPage probe — captures the panel's own call, changes nothing\x1b[0m\n");

  await test("captures a panel fetch and hands it over intact", async () => {
    const meesho = makeMeesho();
    const { pricingContext, probeInstalled, pingProbe } = await loadModules(bundle, meesho);

    // Install the probe over the page's fetch, exactly as the background does.
    globalThis.window.fetch = meesho.fetch;
    new Function(probeSource)();
    pingProbe();
    assert(probeInstalled(), "an installed probe must answer a ping");

    const res = await globalThis.window.fetch(`${ORIGIN}${PRICE_PATH}`, {
      method: "POST",
      body: JSON.stringify(panelBody()),
      headers: { "client-type": "d-web" },
    });
    // The panel's own read of the response must still work.
    const seen = await res.json();
    assert(typeof seen.shipping_charges === "number", "the page's response must be intact");

    await new Promise((r) => setTimeout(r, 10)); // the probe reports after the body resolves
    const ctx = pricingContext();
    equal(ctx.captured, true, "the probe should have reported the call");
    equal(ctx.price, 499, "with the panel's real price");
    equal(ctx.shipping, seen.shipping_charges, "and the figure the panel then displayed");
    equal(ctx.pricesByMatch, true, "and whether the panel prices against a matched product");
  });

  await test("recognises a renamed pricing endpoint by its answer", async () => {
    const meesho = makeMeesho();
    const { pricingContext } = await loadModules(bundle, meesho);
    globalThis.window.fetch = meesho.fetch;
    new Function(probeSource)();

    // A path we have never seen, answering with a shipping charge.
    await globalThis.window.fetch(`${ORIGIN}/api/cataloging/v9/priceThing`, {
      method: "POST",
      body: JSON.stringify(panelBody()),
    });
    await new Promise((r) => setTimeout(r, 10));

    equal(pricingContext().captured, true, "a rename must not silently disable the mirror");
  });

  await test("a probe that never answers is reported as missing", async () => {
    const { probeInstalled } = await loadModules(bundle, makeMeesho());
    equal(probeInstalled(), false, "no probe, no mirror — and the seller is told to reload");
  });

  await test("replays a call made before the content script was listening", async () => {
    const meesho = makeMeesho();
    // Stand the probe up FIRST and let the panel price something, exactly as
    // happens between document_start and document_idle.
    globalThis.window = makeWindow();
    globalThis.window.fetch = meesho.fetch;
    globalThis.location = { origin: ORIGIN, pathname: "/panel/v3/new/c/T/single" };
    new Function(probeSource)();

    await globalThis.window.fetch(`${ORIGIN}${PRICE_PATH}`, {
      method: "POST",
      body: JSON.stringify(panelBody()),
    });
    await new Promise((r) => setTimeout(r, 10));

    // Only now does the content script attach — it must still learn the price.
    globalThis.document = { cookie: `s_id=${SUPPLIER_ID}` };
    globalThis.fetch = meesho.fetch;
    const { watchPanelCalls, pricingContext } = await import(`${bundle}?v=${Math.random()}`);
    watchPanelCalls();
    await new Promise((r) => setTimeout(r, 10));

    equal(pricingContext().price, 499, "the missed call must be replayed");
  });

  await test("ignores traffic that is neither a price nor a match", async () => {
    const meesho = makeMeesho();
    const { pricingContext } = await loadModules(bundle, meesho);
    globalThis.window.fetch = meesho.fetch;
    new Function(probeSource)();

    await globalThis.window.fetch(`${ORIGIN}/api/container/supplier/prefetch-supply-data`, {
      method: "POST",
      body: JSON.stringify({ secret: "not ours" }),
    });
    await new Promise((r) => setTimeout(r, 10));
    equal(pricingContext().captured, false, "unrelated traffic must never be captured");
  });

  await test("ignores page messages that aren't the probe's", async () => {
    const { pricingContext } = await loadModules(bundle, makeMeesho());
    globalThis.window.postMessage({ __tarakkihub: "someone-else", call: {} }, ORIGIN);
    globalThis.window.postMessage({ hello: "world" }, ORIGIN);
    globalThis.window.postMessage(
      { __tarakkihub: "tarakkihub:panel-call", call: { endpoint: "somethingElse", request: {} } },
      ORIGIN,
    );
    equal(pricingContext().captured, false, "only the probe's own reports may be mirrored");
  });

  /* ─── Part 2: which option a saved value is allowed to answer ─────────── */

  console.log("\n\x1b[1mOption matching — a near miss must not become a wrong value\x1b[0m\n");

  await test("a one-letter size never answers a word that merely contains it", async () => {
    // The bug this locks down. A run left Fabric's list open next to the Size
    // widget; Size went looking for "M", and bare substring containment scored
    // "Bamboo" (b-a-M-b-o-o) as the only candidate. The engine ticked Bamboo and
    // reported the field filled — a value the seller never chose, in their
    // catalog, under a green tally.
    const { bestOption } = await loadModules(bundle, makeMeesho());
    const fabrics = ["Acrylic", "Art Silk", "Bamboo", "Chiffon", "Corduroy"];
    equal(bestOption(fabrics, (o) => o, "M"), null, "no fabric answers the size M");
    equal(
      bestOption(["Cotton", "Chiffon", "Jute"], (o) => o, "L"),
      null,
      "nor does the l buried in a fabric name answer the size L",
    );
    // "Medium" for a saved "M" is the prefix rung and stays allowed on purpose:
    // it is the same leniency that lets "1 N" answer "1". What is refused above
    // is the letter appearing in the MIDDLE of an unrelated word.
    equal(bestOption(["Medium"], (o) => o, "M"), "Medium", "an option that extends M is fine");
  });

  await test("still answers the wordings Meesho actually writes", async () => {
    const { bestOption, optionMatches } = await loadModules(bundle, makeMeesho());
    // Exact, and the two loosenings that exist for real Meesho option text.
    equal(bestOption(["XS", "S", "M", "L"], (o) => o, "M"), "M", "the size itself still matches");
    equal(
      bestOption(["Cotton Blend (Mixed)"], (o) => o, "Cotton Blend"),
      "Cotton Blend (Mixed)",
      "an option that extends the saved value",
    );
    equal(bestOption(["1 N"], (o) => o, "1"), "1 N", "a unit appended to a number");
    equal(
      bestOption(["Dark Blue"], (o) => o, "Blue"),
      "Dark Blue",
      "a whole word inside a longer option",
    );
    equal(optionMatches("M", "M"), true, "keyboard verification still accepts an exact option");
    equal(optionMatches("Bamboo", "M"), false, "and still refuses the coincidence");
  });

  await test("prefers the exact option over a merely plausible one", async () => {
    const { bestOption } = await loadModules(bundle, makeMeesho());
    equal(
      bestOption(["Blue", "Dark Blue"], (o) => o, "Blue"),
      "Blue",
      "an exact option outranks one that contains it",
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
