import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "../src/sidepanel/styles.css";
import type { User } from "@supabase/supabase-js";
import type { Account } from "@/lib/account";
import type { TabState } from "@/lib/messages";
import { detectBoundingBox, type Box } from "@/lib/image/bounding-box";
import type { StickerArt } from "@/lib/image/compositor";
import { buildVariantSpecs } from "@/lib/image/variants";
import { Header } from "@/sidepanel/components/Header";
import { StatusPill } from "@/sidepanel/components/StatusPill";
import { LiveShipping } from "@/sidepanel/components/LiveShipping";
import { AutofillPlaceholder } from "@/sidepanel/components/AutofillPlaceholder";
import {
  LivePrice,
  VariationCard,
  type QuoteState,
} from "@/sidepanel/components/VariationCard";
import { Icon } from "@/sidepanel/ui/Icon";

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
};

// Mock quotes in the shape Meesho returns (the numbers seen in a live test).
const BASELINE = 761;
const QUOTES: QuoteState[] = [
  { status: "done", shipping: 51 },
  { status: "done", shipping: 100 },
  { status: "done", shipping: 761 },
  { status: "quoting" },
  { status: "error", error: "Meesho returned 500." },
];

function Preview() {
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [bbox, setBbox] = useState<Box | null>(null);
  const [stickers, setStickers] = useState<StickerArt>(() => new Map());

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
        <StatusPill tab={tab} />
        <LiveShipping tab={tab} onReread={async () => {}} />

        <section className="section">
          <div className="section__title">
            <Icon name="image" size={18} />
            Low-shipping images
          </div>
          <p className="hint" style={{ marginTop: 4 }}>
            Upload one product photo. We make variations of it and Meesho quotes
            the real shipping for each one, live from your account. Cheapest first.
          </p>

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
                <span className="hint">Promo stickers on the product</span>
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
                <span className="hint">Checking live shipping on Meesho… 4/6</span>
                <b className="hint">Best so far ₹51</b>
              </div>
              <div className="progress__track">
                <div className="progress__bar" style={{ width: "66%" }} />
              </div>
            </div>
            <div className="baseline">
              <div className="preview-thumb" />
              <div style={{ flex: 1 }}>
                <div className="opt-label">Your photo, as-is</div>
                <LivePrice quote={{ status: "done", shipping: BASELINE }} baseline={null} />
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

        <AutofillPlaceholder />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Preview />);
