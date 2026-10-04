import { useEffect, useRef } from "react";
import type { Box } from "@/lib/image/bounding-box";
import { renderVariant, type StickerArt } from "@/lib/image/compositor";
import { describeSpec, type VariantSpec } from "@/lib/image/variants";
import type { LiveQuote } from "@/lib/messages";
import { Icon } from "../ui/Icon";

const PREVIEW_PX = 200; // rendered resolution; CSS shows it at 92px (crisp)

/** Where one image is in Meesho's live quoting. */
export type QuoteState =
  | { status: "queued" }
  | { status: "quoting" }
  | { status: "done"; shipping: number; quote: LiveQuote }
  | { status: "error"; error: string };

/**
 * Re-quoting the EXACT bytes we'd hand the seller, to confirm Meesho says the
 * same thing twice. Meesho derives the charge from which catalog product it
 * matches the photo to, and a match that doesn't reproduce is a number we have
 * no business presenting as fact. A quote is verified before it can be used.
 */
export type VerifyState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "match" }
  | { status: "differs"; shipping: number }
  | { status: "failed"; error: string };

export function formatRupees(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

/**
 * The saving, against the seller's own photo. "₹710 cheaper" / "Same" /
 * "₹20 more".
 *
 * It used to read "₹710 less than your photo", which wrapped to two lines in a
 * card this narrow — on every variation. The comparison is already obvious from
 * the row above being labelled "Your photo", so the extra words were paying
 * rent for nothing.
 */
export function deltaText(shipping: number, baseline: number | null): {
  text: string;
  tone: "good" | "same" | "bad";
} | null {
  if (baseline == null) return null;
  const diff = baseline - shipping;
  if (diff > 0) return { text: `${formatRupees(diff)} cheaper`, tone: "good" };
  if (diff === 0) return { text: "Same as yours", tone: "same" };
  return { text: `${formatRupees(-diff)} more`, tone: "bad" };
}

/**
 * What this figure is actually an answer to.
 *
 * ── WHY THIS IS A TOOLTIP NOW AND NOT A VISIBLE LINE ──────────────────────
 * It was rendered under every single quote, and it is the same sentence every
 * time — "matched to an existing product · your panel's request" repeated down
 * a column of nine cards: nine lines of text carrying one fact. The fact still
 * matters (a charge priced against a different listing than the seller's is the
 * one way this feature can be confidently wrong), so it moves onto the figure's
 * own tooltip, and the case worth interrupting for — Meesho matching nothing —
 * stays visible as its own short caveat.
 */
export function basisNote(quote: LiveQuote): string {
  // The mirror probe is never a card, but label it honestly if it ever renders:
  // it is the panel's own figure, and the image played no part in it.
  if (quote.basis === "panel-mirror") return "Your panel's own figure · photo not used";
  // `duplicatePid` is what Meesho matched THIS image to, and — in match mode —
  // what the figure was priced with. The two agreeing is the point.
  const matched =
    quote.duplicatePid != null ? "Matched to an existing product" : "No catalog match";
  if (quote.basis === "manual" && quote.price != null) {
    return `${matched} · your panel's request at ${formatRupees(quote.price)}`;
  }
  return `${matched} · your panel's request`;
}

/** A caveat worth interrupting for, or null when the figure is clean. */
export function quoteCaveat(quote: LiveQuote): string | null {
  if (quote.basis === "panel-mirror") {
    return "Your panel's figure, not this image's.";
  }
  if (quote.duplicatePid == null) {
    // Meesho matched nothing, so this figure is the listing's un-matched price.
    // Real, and comparable with the others (they were all asked the same way),
    // but worth flagging: a no-match image is the one Meesho understands least.
    return "Meesho matched no product to this image.";
  }
  return null;
}

export function LivePrice({
  quote,
  baseline,
  verify,
}: {
  quote: QuoteState;
  baseline: number | null;
  verify?: VerifyState;
}) {
  if (quote.status === "queued") return <div className="vprice muted">Queued</div>;
  if (quote.status === "quoting") {
    return (
      <div className="vprice muted">
        <Icon name="refresh" size={14} className="spin" /> Checking…
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
  const caveat = quoteCaveat(quote.quote);
  return (
    <div>
      {/* The basis rides on the figure as a tooltip rather than as a line of
          its own — see basisNote. */}
      <div className="vprice" title={basisNote(quote.quote)}>
        <b>{formatRupees(quote.shipping)}</b>
        {verify?.status === "match" ? (
          <span className="live-tag" title="Meesho quoted this twice for these exact bytes">
            <Icon name="check" size={11} />
            verified
          </span>
        ) : verify?.status === "checking" ? (
          <span className="live-tag">
            <Icon name="refresh" size={11} className="spin" />
            checking
          </span>
        ) : (
          <span className="live-tag">
            <span className="live-dot" />
            live
          </span>
        )}
      </div>
      {delta ? <div className={`delta ${delta.tone}`}>{delta.text}</div> : null}
      {caveat ? <div className="delta bad">{caveat}</div> : null}
      {verify?.status === "differs" ? (
        <div className="delta bad">
          Re-checked: {formatRupees(verify.shipping)}. Showing that.
        </div>
      ) : null}
      {verify?.status === "failed" ? (
        <div className="delta bad" title={verify.error}>
          Couldn't re-check
        </div>
      ) : null}
    </div>
  );
}

export function VariationCard({
  bitmap,
  bbox,
  spec,
  stickers,
  quote,
  verify,
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
  verify: VerifyState;
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
          <LivePrice quote={quote} baseline={baseline} verify={verify} />
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
            "Apply"
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
            "Checking…"
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
