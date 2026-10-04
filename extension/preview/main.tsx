import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "../src/sidepanel/styles.css";
import type { User } from "@supabase/supabase-js";
import type { Account } from "@/lib/account";
import type { LiveQuote, PanelPricingContext, TabState } from "@/lib/messages";
import { detectBoundingBox, type Box } from "@/lib/image/bounding-box";
import type { StickerArt } from "@/lib/image/compositor";
import { buildVariantSpecs } from "@/lib/image/variants";
import { Header } from "@/sidepanel/components/Header";
import { StatusPill } from "@/sidepanel/components/StatusPill";
import { LiveShipping } from "@/sidepanel/components/LiveShipping";
import type { CapturedField, FieldValue, FillItem, FillResult } from "@/lib/autofill-types";
import { LockedAutofill } from "@/sidepanel/components/autofill/LockedAutofill";
import { QuickOverrides } from "@/sidepanel/components/autofill/QuickOverrides";
import { FillReport } from "@/sidepanel/components/autofill/FillReport";
import { CapturePreview } from "@/sidepanel/components/autofill/CapturePreview";
import { PricingBasis, type PricingMode } from "@/sidepanel/components/PricingBasis";
import {
  LivePrice,
  VariationCard,
  type QuoteState,
  type VerifyState,
} from "@/sidepanel/components/VariationCard";
import { Icon } from "@/sidepanel/ui/Icon";
import { Explain } from "@/sidepanel/ui/Explain";

// A stand-in "shirt" so the compositor, bbox trim and stickers show.
function makeSampleBitmap(): Promise<ImageBitmap> {
  const c = document.createElement("canvas");
  c.width = 720;
  c.height = 820;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#1c1c1c";
  ctx.beginPath();
  ctx.moveTo(210, 210);
  ctx.lineTo(300, 150);
  ctx.lineTo(420, 150);
  ctx.lineTo(510, 210);
  ctx.lineTo(590, 300);
  ctx.lineTo(520, 360);
  ctx.lineTo(510, 320);
  ctx.lineTo(510, 700);
  ctx.lineTo(210, 700);
  ctx.lineTo(210, 320);
  ctx.lineTo(200, 360);
  ctx.lineTo(130, 300);
  ctx.closePath();
  ctx.fill();
  return createImageBitmap(c);
}

const STICKER_IDS = ["best-seller", "sale", "lowest-price", "new"];

async function loadStickers(): Promise<StickerArt> {
  const art: StickerArt = new Map();
  await Promise.all(
    STICKER_IDS.map(
      (id) =>
        new Promise<void>((res) => {
          const img = new Image();
          img.onload = () => {
            art.set(id, img);
            res();
          };
          img.onerror = () => res();
          img.src = `/stickers/${id}.svg`;
        }),
    ),
  );
  return art;
}

const account: Account = {
  user: { email: "seller@example.com" } as User,
  profile: {
    id: "x",
    full_name: "Demo Seller",
    role: "user",
    plan: "pro",
    status: "active",
    created_at: new Date().toISOString(),
  },
  usage: {
    id: "u",
    user_id: "x",
    credits_remaining: 42,
    images_used: 8,
    period_start: "",
    period_end: "",
  },
  blocked: false,
};

const tab: TabState = {
  meeshoTabId: 1,
  contentReady: true,
  shipping: { value: 100, raw: "₹100" },
  form: {
    present: true,
    fieldCount: 27,
    filledCount: 24,
    categoryPath: "Women Western › Kurtis",
    url: "https://supplier.meesho.com/panel/catalog/add",
  },
};

/* ─── Part 2 mocks: a saved autofill profile and a finished run ─────────── */

const profileFields: CapturedField[] = [
  {
    key: "Product Details|product name|0",
    label: "Product Name",
    normalizedLabel: "product name",
    section: "Product Details",
    type: "text",
    value: "Rayon Printed Straight Kurti",
    occurrence: 0,
  },
  {
    key: "Product Details|meesho price|0",
    label: "Meesho Price",
    normalizedLabel: "meesho price",
    section: "Product Details",
    type: "number",
    value: "449",
    occurrence: 0,
  },
  {
    key: "Product Details|mrp|0",
    label: "MRP",
    normalizedLabel: "mrp",
    section: "Product Details",
    type: "number",
    value: "1299",
    occurrence: 0,
  },
  {
    key: "Product Details|size|0",
    label: "Size",
    normalizedLabel: "size",
    section: "Product Details",
    type: "multiselect",
    value: ["M", "L", "XL"],
    occurrence: 0,
  },
  {
    key: "Product Details|colour|0",
    label: "Colour",
    normalizedLabel: "colour",
    section: "Product Details",
    type: "dropdown",
    value: "Maroon",
    occurrence: 0,
  },
  {
    key: "Product Details|fabric|0",
    label: "Fabric",
    normalizedLabel: "fabric",
    section: "Product Details",
    type: "dropdown",
    value: "Rayon",
    occurrence: 0,
  },
  {
    key: "Manufacturing Details|name|0",
    label: "Name",
    normalizedLabel: "name",
    section: "Manufacturing Details",
    type: "text",
    value: "Tarakki Garments",
    occurrence: 0,
  },
  {
    key: "Manufacturing Details|hsn code|0",
    label: "HSN Code",
    normalizedLabel: "hsn code",
    section: "Manufacturing Details",
    type: "text",
    value: "6211",
    occurrence: 0,
  },
];

const fillResult: FillResult = {
  filled: 6,
  skipped: 1,
  failed: 1,
  cancelled: false,
  passes: 2,
  // The case worth looking at in the harness: a run that filled everything it
  // knew about, over a form Meesho still won't accept.
  stillRequired: [
    {
      key: "Product, Size and Inventory|inventory|0",
      label: "Inventory*",
      section: "Product, Size and Inventory",
      outsideProfile: true,
    },
    {
      key: "Product, Size and Inventory|mrp|0",
      label: "MRP*",
      section: "Product, Size and Inventory",
      outsideProfile: true,
    },
  ],
  items: [
    ...profileFields.slice(0, 6).map(
      (f): FillItem => ({
        key: f.key,
        label: f.label,
        section: f.section,
        outcome: "filled",
        reason: "Filled",
        confidence: "exact",
      }),
    ),
    {
      key: profileFields[6].key,
      label: profileFields[6].label,
      section: profileFields[6].section,
      outcome: "skipped",
      reason: "Already had a value — turn on overwrite to replace it.",
      confidence: "exact",
    },
    {
      key: profileFields[7].key,
      label: profileFields[7].label,
      section: profileFields[7].section,
      outcome: "failed",
      reason: "This dropdown did not open — pick it by hand.",
      confidence: "label",
    },
  ],
};

// Mock quotes in the shape Meesho returns (the numbers seen in a live test).
const BASELINE = 761;

/** A quote carries WHAT IT IS AN ANSWER TO, so the card can show it. */
const quoteFor = (shipping: number, over: Partial<LiveQuote> = {}): LiveQuote => ({
  shipping,
  duplicatePid: 8821,
  imageUrl: "https://images.meesho.com/x.jpg",
  source: "price",
  // Every ranked figure is a "photo-match": the panel's own pricing body with
  // this image's matched product swapped in. "panel-mirror" is the calibration
  // probe and never reaches a card.
  basis: "photo-match",
  price: 499,
  gstPercent: 5,
  sscatId: 1234,
  debug: {
    url: "/api/cataloging/singleCatalogUpload/getTransferPrice",
    body: { sscat_id: 1234, price: 499, gst_percentage: 5, duplicate_pid: 8821 },
    mode: "match",
    templateDuplicatePid: null,
    matchUrl: "/api/cataloging/priceRecommendation/fetchDuplicatePid",
    matchBody: { sscat_id: 1234, image_url: "https://images.meesho.com/x.jpg" },
    mirrored: true,
    panelShipping: BASELINE,
    panelDuplicatePid: null,
    panelRequestAgeMs: 42_000,
  },
  ...over,
});

const QUOTES: QuoteState[] = [
  { status: "done", shipping: 51, quote: quoteFor(51) },
  // A corrected quote: verification moved it, so the card shows the RE-CHECKED
  // figure as the headline — never the one that didn't reproduce.
  {
    status: "done",
    shipping: 118,
    quote: quoteFor(118, { basis: "manual", price: 799, gstPercent: 12 }),
  },
  // Meesho recognised nothing in this image — a real answer, and one the card
  // flags, because a no-match image is the one Meesho understands least.
  { status: "done", shipping: 761, quote: quoteFor(761, { duplicatePid: null }) },
  { status: "quoting" },
  { status: "error", error: "Meesho returned 500." },
];

/** Every verification outcome, so each badge can be eyeballed. */
const VERIFY: VerifyState[] = [
  { status: "match" },
  { status: "differs", shipping: 118 },
  { status: "checking" },
  { status: "idle" },
  { status: "idle" },
];

const PANEL_CONTEXT: PanelPricingContext = {
  probeInstalled: true,
  captured: true,
  stale: false,
  ageMs: 42_000,
  sscatId: 1234,
  price: 499,
  gstPercent: 5,
  gstType: "GSTIN",
  shipping: 100,
  pricesByMatch: true,
  panelDuplicatePid: 987_654,
  signature: "preview-signature",
};

function Preview() {
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [bbox, setBbox] = useState<Box | null>(null);
  const [stickers, setStickers] = useState<StickerArt>(() => new Map());
  const [mode, setMode] = useState<PricingMode>("panel");
  const [price, setPrice] = useState("499");
  const [gst, setGst] = useState("5");

  useEffect(() => {
    makeSampleBitmap().then((bmp) => {
      setBitmap(bmp);
      setBbox(detectBoundingBox(bmp));
    });
    loadStickers().then(setStickers);
  }, []);

  const specs = buildVariantSpecs({
    count: QUOTES.length,
    seed: 7,
    stickerIds: STICKER_IDS,
    withStickers: true,
  });

  return (
    <div className="app">
      <Header account={account} onSignOut={() => {}} />
      <div className="app__body">
        <StatusPill tab={tab} panel={PANEL_CONTEXT} />
        <LiveShipping tab={tab} panel={PANEL_CONTEXT} onReread={async () => {}} />

        <section className="section">
          <div className="section__title">
            <Icon name="image" size={18} />
            Low-shipping images
          </div>
          <Explain label="How this works">
            We make variations of your photo and Meesho prices each one live — by
            re-asking your own panel&apos;s pricing question with nothing changed but the
            image. Cheapest first. 1 credit only when you use an image that beats your
            own photo.
          </Explain>

          <div className="stack" style={{ marginTop: 14 }}>
            <div className="opt-group">
              <span className="opt-label">Meesho category</span>
              <div className="cat-chosen">
                <div style={{ minWidth: 0 }}>
                  <div className="cat-chosen__name">Tshirts</div>
                  <div className="cat-chain">Men Fashion › Mens Clothing › Men Top Wear › Tshirts</div>
                </div>
                <button type="button" className="btn btn-ghost btn--sm">
                  Change
                </button>
              </div>
            </div>
            <PricingBasis
              context={PANEL_CONTEXT}
              refreshing={false}
              onRefresh={() => {}}
              mode={mode}
              onMode={setMode}
              price={price}
              onPrice={setPrice}
              gst={gst}
              onGst={setGst}
              disabled={false}
            />

            <div className="opt-group">
              <span className="opt-label row spread">
                <span>Variations</span>
                <b className="count-value">20</b>
              </span>
              <input
                type="range"
                className="range"
                min={5}
                max={50}
                defaultValue={20}
                style={{ "--fill": "33%" } as React.CSSProperties}
              />
            </div>
            <label className="switch-row">
              <span>
                <span className="opt-label" style={{ display: "block" }}>
                  Add stickers
                </span>
                <span className="hint">Meesho QC may reject text on a front image.</span>
              </span>
              <input type="checkbox" className="switch" defaultChecked />
            </label>
            <button type="button" className="btn btn-secondary btn--block">
              Stop
            </button>
          </div>

          <div style={{ marginTop: 14 }} className="stack">
            <div className="progress">
              <div className="row spread">
                <span className="hint">Checking with Meesho… 4/6</span>
                <b className="hint">Best ₹51</b>
              </div>
              <div className="progress__track">
                <div className="progress__bar" style={{ width: "66%" }} />
              </div>
            </div>
            <div className="baseline">
              <div className="preview-thumb" />
              <div style={{ flex: 1 }}>
                <div className="opt-label">Your photo</div>
                <LivePrice
                  quote={{ status: "done", shipping: BASELINE, quote: quoteFor(BASELINE) }}
                  baseline={null}
                />
              </div>
            </div>
            <div className="variations">
              {bitmap && bbox
                ? specs.map((spec, i) => (
                    <VariationCard
                      key={spec.id}
                      bitmap={bitmap}
                      bbox={bbox}
                      spec={spec}
                      stickers={stickers}
                      quote={QUOTES[i]}
                      verify={VERIFY[i]}
                      baseline={BASELINE}
                      isLowest={i === 0}
                      needsCredit={i < 2}
                      canApply
                      busy={null}
                      applied={false}
                      onApply={() => {}}
                      onDownload={() => {}}
                    />
                  ))
                : null}
            </div>
          </div>
        </section>

        <AutofillPreview />
      </div>
    </div>
  );
}

/**
 * Part 2's presentational pieces, with mock data. The real AutofillSection talks
 * to chrome.* and Supabase, so the preview renders its parts instead: the locked
 * state a free plan sees, the profile picker, the quick-overrides strip, a
 * finished report, and the capture preview.
 */
function AutofillPreview() {
  const [overrides, setOverrides] = useState<Record<string, FieldValue>>({});
  const [alsoSave, setAlsoSave] = useState(false);
  const [showCapture, setShowCapture] = useState(false);

  return (
    <>
      <LockedAutofill />

      <section className="section">
        <div className="section__title">
          <Icon name="sliders" size={18} />
          Listing autofill
        </div>
        <p className="hint" style={{ marginTop: 8 }}>
          {tab.form.fieldCount} fields on this form · {tab.form.filledCount} filled ·{" "}
          {tab.form.categoryPath}
        </p>

        <Explain label="What autofill does">
          Saves a filled Meesho form once, then types it into your next listing. It never
          submits, never changes the category, and never overwrites something you typed
          unless you turn that on. Uses no credits.
        </Explain>

        <div className="af-pick" style={{ marginTop: 12 }}>
          <select className="select af-pick__select" defaultValue="kurti">
            <option value="kurti">Cotton Kurti · {profileFields.length}</option>
            <option value="tshirt">Men Tshirt · 22</option>
          </select>
          <button type="button" className="btn btn-primary">
            <Icon name="spark" size={15} />
            Autofill
          </button>
        </div>

        <div className="af-warn">
          <Icon name="alert" size={15} />
          <div>
            Saved for <b>Kurtis</b> · this listing is <b>Tshirts</b>.
          </div>
        </div>

        <QuickOverrides
          fields={profileFields}
          overrides={overrides}
          onChange={(key, value) => setOverrides((prev) => ({ ...prev, [key]: value }))}
          alsoSave={alsoSave}
          onAlsoSaveChange={setAlsoSave}
          disabled={false}
        />

        <label className="switch-row" style={{ marginTop: 10 }}>
          <span className="hint">Overwrite filled fields</span>
          <input type="checkbox" className="switch" />
        </label>

        <div className="progress" style={{ marginTop: 12 }}>
          <div className="row spread">
            <span className="hint">Filling 12 / 27 · Fabric</span>
            <button type="button" className="btn btn-ghost btn--sm">
              Cancel
            </button>
          </div>
          <div className="progress__track">
            <div className="progress__bar" style={{ width: "44%" }} />
          </div>
        </div>

        <FillReport result={fillResult} tabId={null} onDismiss={() => {}} />

        <div className="af-save">
          <label className="opt-label" htmlFor="af-preview-name">
            New profile
          </label>
          <input id="af-preview-name" className="input" placeholder="e.g. kurti" />
          <button
            type="button"
            className="btn btn-secondary btn--block"
            style={{ marginTop: 8 }}
            onClick={() => setShowCapture((v) => !v)}
          >
            <Icon name="plus" size={15} /> Save current form
          </button>
        </div>
      </section>

      {showCapture ? (
        <section className="section">
          <CapturePreview
            name="Cotton Kurti"
            categoryPath={tab.form.categoryPath}
            fields={profileFields}
            saving={false}
            showStorageNotice
            onCancel={() => setShowCapture(false)}
            onSave={() => setShowCapture(false)}
          />
        </section>
      ) : null}
    </>
  );
}

createRoot(document.getElementById("root")!).render(<Preview />);
