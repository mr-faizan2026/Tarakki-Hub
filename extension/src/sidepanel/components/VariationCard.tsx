import { useEffect, useRef } from "react";
import type { Box } from "@/lib/image/bounding-box";
import { renderVariant, type StickerArt } from "@/lib/image/compositor";
import { describeSpec, type VariantSpec } from "@/lib/image/variants";
import { Icon } from "../ui/Icon";

const PREVIEW_PX = 200; // rendered resolution; CSS shows it at 92px (crisp)

/** Where one image is in Meesho's live quoting. */
export type QuoteState =
  | { status: "queued" }
  | { status: "quoting" }
  | { status: "done"; shipping: number }
  | { status: "error"; error: string };

export function formatRupees(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

/** "₹710 less than your photo" / "Same as your photo" / "₹20 more than …". */
export function deltaText(shipping: number, baseline: number | null): {
  text: string;
  tone: "good" | "same" | "bad";
} | null {
  if (baseline == null) return null;
  const diff = baseline - shipping;
  if (diff > 0) return { text: `${formatRupees(diff)} less than your photo`, tone: "good" };
  if (diff === 0) return { text: "Same as your photo", tone: "same" };
  return { text: `${formatRupees(-diff)} more than your photo`, tone: "bad" };
}

export function LivePrice({ quote, baseline }: { quote: QuoteState; baseline: number | null }) {
  if (quote.status === "queued") return <div className="vprice muted">Queued</div>;
  if (quote.status === "quoting") {
    return (
      <div className="vprice muted">
        <Icon name="refresh" size={14} className="spin" /> Checking live…
      </div>
    );
  }
  if (quote.status === "error") {
    return (
      <div>
        <div className="vprice vprice--error">Couldn't read</div>
        <div className="vcard__foot">{quote.error}</div>
      </div>
    );
  }
  const delta = deltaText(quote.shipping, baseline);
  return (
    <div>
      <div className="vprice">
        <b>{formatRupees(quote.shipping)}</b>
        <span className="live-tag">
          <span className="live-dot" />
          live
        </span>
      </div>
      {delta ? <div className={`delta ${delta.tone}`}>{delta.text}</div> : null}
    </div>
  );
}

export function VariationCard({
  bitmap,
  bbox,
  spec,
  stickers,
  quote,
  baseline,
  isLowest,
  needsCredit,
  canApply,
  busy,
  applied,
  onApply,
  onDownload,
}: {
  bitmap: ImageBitmap;
  bbox: Box;
  spec: VariantSpec;
  stickers: StickerArt;
  quote: QuoteState;
  /** The seller's own photo's live shipping, when known. */
  baseline: number | null;
  isLowest: boolean;
  /** Using this image spends this run's one credit. */
  needsCredit: boolean;
  canApply: boolean;
  busy: "apply" | "download" | null;
  applied: boolean;
  onApply: (id: string) => void;
  onDownload: (id: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    renderVariant(ctx, bitmap, bbox, spec, PREVIEW_PX, stickers);
  }, [bitmap, bbox, spec, stickers]);

  const ready = quote.status === "done";
  const costNote = needsCredit ? " (uses 1 credit)" : " (free)";

  return (
    <div className={isLowest ? "vcard lowest" : "vcard"}>
      <div className="vcard__top">
        <canvas
          ref={canvasRef}
          width={PREVIEW_PX}
          height={PREVIEW_PX}
          className="vcard__canvas"
        />
        <div className="vcard__info">
          {isLowest ? (
            <div className="vcard__chips">
              <span className="tag lowest">Lowest</span>
            </div>
          ) : null}
          <LivePrice quote={quote} baseline={baseline} />
          <div className="vcard__foot">{describeSpec(spec)}</div>
        </div>
      </div>
      <div className="vcard__actions">
        <button
          type="button"
          className="btn btn-secondary btn--sm"
          onClick={() => onApply(spec.id)}
          disabled={!ready || busy != null || !canApply}
          title={
            canApply
              ? `Put this exact image in your listing as the front image${costNote}`
              : "Open the Add Catalog screen in your supplier panel to apply"
          }
        >
          {busy === "apply" ? (
            "Applying…"
          ) : applied ? (
            <>
              <Icon name="check" size={14} /> Applied
            </>
          ) : (
            "Apply to listing"
          )}
        </button>
        <button
          type="button"
          className="btn btn-primary btn--sm"
          onClick={() => onDownload(spec.id)}
          disabled={!ready || busy != null}
          title={`Download the exact 1000×1000 image Meesho quoted${costNote}`}
        >
          {busy === "download" ? (
            "Saving…"
          ) : (
            <>
              <Icon name="download" size={14} /> Download
            </>
          )}
        </button>
      </div>
    </div>
  );
}
