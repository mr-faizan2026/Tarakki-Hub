/**
 * Variation recipes — WHAT each generated image looks like, never what it costs.
 *
 * ── WHY VARIETY IS THE PRODUCT ─────────────────────────────────────────────
 * Meesho prices shipping from the image itself: it matches the photo against
 * its catalog, and the listing inherits the matched product's shipping. So the
 * lever is the MATCH, and the only way to move a match is to change what the
 * picture looks like. Two variants that differ by a percent of border width
 * match the same product and quote the same rupee — a run of those is twenty
 * requests that prove nothing.
 *
 * This file therefore optimises for SPREAD, not prettiness: each variant should
 * look meaningfully unlike its neighbours, so the run lands on genuinely
 * different matches and the ranking has something to rank. Five axes move
 * together — crop, product size, position, framing and stickers — and each is
 * stratified across the run so a 20-image batch covers the whole space instead
 * of clustering around the middle.
 *
 * There is no price in this file, and no rule about which look is cheap. We
 * cannot predict a match, so we don't: the panel quotes every one live and
 * sorts by what Meesho answered.
 *
 * A spec is plain data and rendering is a pure function of it (compositor.ts),
 * so the card preview and the 1000px image Meesho quoted are the same picture.
 */

export type StickerPlacement = {
  stickerId: string;
  /** Centre, as a fraction of the PRODUCT rect (0–1 on each axis). */
  px: number;
  py: number;
  /** Width as a fraction of the product's longest side. */
  scale: number;
  /** Degrees. */
  rotation: number;
};

/** A square frame just inside the canvas edge. */
export type Border = {
  color: string;
  /** Line width, as a fraction of the canvas edge. */
  width: number;
  /** Gap between the canvas edge and the frame, as a fraction of the edge. */
  inset: number;
};

export type VariantSpec = {
  id: string;
  /**
   * How much of the product to show. `zoom` 1 frames the whole product; above
   * that it crops in, with (cx, cy) as the centre of interest in bbox space.
   *
   * Capped well below a tight crop on purpose: Meesho's QC rejects catalog
   * images that cut the product, and an image that gets a beautiful quote and
   * then fails review is worth nothing to the seller.
   */
  crop: { zoom: number; cx: number; cy: number };
  /** Longest product side ÷ canvas edge. */
  footprint: number;
  /** Nudge within the free margin, −1…1 per axis (0 = centred). */
  offset: { x: number; y: number };
  /** Canvas fill behind the product. */
  background: string;
  /** The outer frame, or null for none. */
  border: Border | null;
  /** A second hairline just inside the outer frame (the double-frame look). */
  innerBorder: Border | null;
  stickers: StickerPlacement[];
};

/**
 * Frame colours. Deliberately saturated and far apart in hue — near-identical
 * colours produce near-identical matches, which is the one thing a run cannot
 * afford. Dark and light are both represented because the matcher reacts to
 * overall lightness as much as to hue.
 */
export const BORDER_COLORS = [
  "#111111",
  "#3A0A45",
  "#6B1E6B",
  "#B01B6A",
  "#E6399B",
  "#FF2D95",
  "#9C1B1B",
  "#EF4444",
  "#F97316",
  "#C79A16",
  "#FACC15",
  "#8BD346",
  "#1E7F5C",
  "#3CCFCF",
  "#22D3EE",
  "#3B82F6",
  "#1E3A8A",
  "#B06AD9",
] as const;

/** Canvas fills. Off-whites only — Meesho wants a plain background. */
const BACKGROUNDS = ["#FFFFFF", "#FFFFFF", "#FDFBF7", "#F7F7F9", "#FBF6F2"] as const;

/** Product sizes explored. Meesho's QC rejects "shrunk" products, so the floor
 *  keeps the product clearly readable; the live quotes decide what's cheap. */
const MIN_FOOTPRINT = 0.34;
const MAX_FOOTPRINT = 0.97;

/** Crop range. 1 = the whole product; the ceiling trims edges, never the body. */
const MIN_ZOOM = 1.0;
const MAX_ZOOM = 1.28;

/** Outer frame thickness, as a fraction of the canvas edge. */
const MIN_BORDER_W = 0.006;
const MAX_BORDER_W = 0.042;

/** Where stickers sit on the product: chest (upper band) or a lower corner. */
const STICKER_SPOTS = [
  { px: [0.2, 0.42], py: [0.18, 0.34] }, // left chest
  { px: [0.58, 0.8], py: [0.18, 0.34] }, // right chest
  { px: [0.35, 0.65], py: [0.38, 0.55] }, // centre
  { px: [0.62, 0.82], py: [0.7, 0.86] }, // lower right
  { px: [0.18, 0.38], py: [0.68, 0.86] }, // lower left
] as const;

/** Small, deterministic PRNG so a run can be re-rendered identically. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (rand: () => number, [lo, hi]: readonly [number, number]) =>
  lo + (hi - lo) * rand();

/**
 * One stratified sample per variant: split [lo, hi] into `count` bands and take
 * band `i`, jittered within it. Guarantees the extremes are both tested however
 * small the run is, which random sampling does not.
 */
const stratum = (i: number, count: number, rand: () => number, lo: number, hi: number) =>
  lo + ((hi - lo) * (i + rand())) / count;

/** A shuffled 0…count−1, so two axes don't move in lockstep across the run. */
function shuffledIndices(count: number, rand: () => number): number[] {
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/**
 * Build `count` distinct looks.
 *
 * Footprint, crop and border width each get their own stratified pass, and the
 * passes are independently shuffled so variant #3 isn't "small, tight, thin" —
 * the combinations are what produce different matches, not the individual
 * values. Colour, background and stickers are then drawn per variant.
 */
export function buildVariantSpecs(opts: {
  count: number;
  seed: number;
  stickerIds: string[];
  withStickers: boolean;
}): VariantSpec[] {
  const rand = mulberry32(opts.seed);
  const count = Math.max(1, Math.round(opts.count));
  const pickSticker = () => opts.stickerIds[Math.floor(rand() * opts.stickerIds.length)];

  // Independent orderings, so the three stratified axes cross rather than
  // correlate. Without this a run walks one diagonal of the space and half the
  // interesting combinations are never tried.
  const zoomOrder = shuffledIndices(count, rand);
  const widthOrder = shuffledIndices(count, rand);
  // Colours are dealt from a shuffled deck so a short run can't draw the same
  // hue twice while leaving fifteen others untried.
  const colorDeck = shuffledIndices(BORDER_COLORS.length, rand);

  const specs: VariantSpec[] = [];
  for (let i = 0; i < count; i++) {
    const footprint = stratum(i, count, rand, MIN_FOOTPRINT, MAX_FOOTPRINT);
    const zoom = stratum(zoomOrder[i], count, rand, MIN_ZOOM, MAX_ZOOM);

    // Almost always framed — an unframed variant is mostly useful as a control,
    // showing the seller what the plain image is worth.
    const framed = rand() < 0.9;
    const color = BORDER_COLORS[colorDeck[i % colorDeck.length]];
    const border: Border | null = framed
      ? {
          color,
          width: stratum(widthOrder[i], count, rand, MIN_BORDER_W, MAX_BORDER_W),
          inset: 0.004 + rand() * 0.03,
        }
      : null;

    // A thin second line inside a thick frame — a common supplier-tool look,
    // and a real change to the image's edge structure rather than a tweak.
    const innerBorder: Border | null =
      border && border.width > 0.018 && rand() < 0.45
        ? {
            color:
              rand() < 0.5 ? "#FFFFFF" : BORDER_COLORS[colorDeck[(i + 7) % colorDeck.length]],
            width: 0.003 + rand() * 0.004,
            inset: border.inset + border.width + 0.006 + rand() * 0.012,
          }
        : null;

    const stickers: StickerPlacement[] = [];
    if (opts.withStickers && opts.stickerIds.length) {
      const roll = rand();
      const n = roll < 0.25 ? 0 : roll < 0.7 ? 1 : 2;
      const spots = [...STICKER_SPOTS].sort(() => rand() - 0.5).slice(0, n);
      for (const spot of spots) {
        stickers.push({
          stickerId: pickSticker(),
          px: between(rand, spot.px),
          py: between(rand, spot.py),
          scale: 0.15 + rand() * 0.14,
          rotation: (rand() - 0.5) * 18,
        });
      }
    }

    specs.push({
      id: `${opts.seed.toString(36)}-${i}`,
      crop: {
        zoom,
        // Bias the crop centre upward: on apparel the top half carries the
        // detail Meesho's matcher keys on, and trimming the hem loses less.
        cx: 0.5 + (rand() - 0.5) * 0.16,
        cy: 0.46 + (rand() - 0.5) * 0.18,
      },
      footprint,
      offset: { x: (rand() - 0.5) * 0.44, y: (rand() - 0.5) * 0.44 },
      background: BACKGROUNDS[Math.floor(rand() * BACKGROUNDS.length)],
      border,
      innerBorder,
      stickers,
    });
  }

  // Shuffle so quoting order doesn't correlate with size (results stream in
  // mixed, and a stopped run still covers the whole range).
  for (let i = specs.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [specs[i], specs[j]] = [specs[j], specs[i]];
  }
  return specs;
}

/** Short human description for a card, e.g. "42% size · frame · 1 sticker". */
export function describeSpec(spec: VariantSpec): string {
  const parts = [`${Math.round(spec.footprint * 100)}% size`];
  if (spec.crop.zoom > 1.04) parts.push(`${Math.round(spec.crop.zoom * 100)}% crop`);
  parts.push(spec.border ? (spec.innerBorder ? "double frame" : "frame") : "no frame");
  if (spec.stickers.length) {
    parts.push(`${spec.stickers.length} sticker${spec.stickers.length > 1 ? "s" : ""}`);
  }
  return parts.join(" · ");
}
