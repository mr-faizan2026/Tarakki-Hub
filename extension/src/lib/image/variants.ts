/**
 * Variation recipes — WHAT each generated image looks like, never what it costs.
 *
 * Meesho prices shipping from the image itself (it matches the photo to an
 * existing catalog product — see content/meesho-api.ts), so size, border colour
 * and stickers all move the charge in ways no formula predicts. We therefore
 * generate a spread of Listify-style looks and let Meesho quote every one live;
 * the panel ranks them by those live quotes. There is no price in this file.
 *
 * A spec is plain data, and rendering is a pure function of it (compositor.ts),
 * so the 200px card preview and the 1000px image Meesho quoted are the same
 * picture.
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

export type VariantSpec = {
  id: string;
  /** Longest product side ÷ canvas edge. */
  footprint: number;
  /** Nudge within the free margin, −1…1 per axis (0 = centred). */
  offset: { x: number; y: number };
  /** Thin square frame near the canvas edge (fractions of the canvas edge). */
  border: { color: string; width: number; inset: number } | null;
  stickers: StickerPlacement[];
};

/** Frame colours in the spirit of Listify's output (bright, thin, square). */
export const BORDER_COLORS = [
  "#111111",
  "#E6399B",
  "#5DD39E",
  "#3CCFCF",
  "#22D3EE",
  "#8BD346",
  "#B06AD9",
  "#F97316",
  "#EF4444",
  "#3B82F6",
  "#FACC15",
] as const;

/** Product sizes explored. Meesho's QC rejects "shrunk" products, so the floor
 *  keeps the product clearly readable; the live quotes decide what's cheap. */
const MIN_FOOTPRINT = 0.3;
const MAX_FOOTPRINT = 0.92;

/** Where stickers sit on the product: chest (upper band) or a lower corner. */
const STICKER_SPOTS = [
  { px: [0.2, 0.42], py: [0.18, 0.34] }, // left chest
  { px: [0.58, 0.8], py: [0.18, 0.34] }, // right chest
  { px: [0.35, 0.65], py: [0.38, 0.55] }, // centre
  { px: [0.62, 0.82], py: [0.7, 0.86] }, // lower right
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
 * Build `count` distinct looks. Footprints are stratified across the range (one
 * per stratum, jittered) so small and large framings are both always tested;
 * border and stickers are drawn at random per variant.
 */
export function buildVariantSpecs(opts: {
  count: number;
  seed: number;
  stickerIds: string[];
  withStickers: boolean;
}): VariantSpec[] {
  const rand = mulberry32(opts.seed);
  const count = Math.max(1, Math.round(opts.count));
  const pickSticker = () =>
    opts.stickerIds[Math.floor(rand() * opts.stickerIds.length)];

  const specs: VariantSpec[] = [];
  for (let i = 0; i < count; i++) {
    const stratum = (MAX_FOOTPRINT - MIN_FOOTPRINT) / count;
    const footprint = MIN_FOOTPRINT + stratum * (i + rand());

    const border =
      rand() < 0.88
        ? {
            color: BORDER_COLORS[Math.floor(rand() * BORDER_COLORS.length)],
            width: 0.007 + rand() * 0.007,
            inset: 0.012 + rand() * 0.014,
          }
        : null;

    const stickers: StickerPlacement[] = [];
    if (opts.withStickers && opts.stickerIds.length) {
      const roll = rand();
      const n = roll < 0.2 ? 0 : roll < 0.75 ? 1 : 2;
      const spots = [...STICKER_SPOTS].sort(() => rand() - 0.5).slice(0, n);
      for (const spot of spots) {
        stickers.push({
          stickerId: pickSticker(),
          px: between(rand, spot.px),
          py: between(rand, spot.py),
          scale: 0.16 + rand() * 0.1,
          rotation: (rand() - 0.5) * 16,
        });
      }
    }

    specs.push({
      id: `${opts.seed.toString(36)}-${i}`,
      footprint,
      offset: { x: (rand() - 0.5) * 0.3, y: (rand() - 0.5) * 0.3 },
      border,
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

/** Short human description for a card, e.g. "42% size · pink frame · 1 sticker". */
export function describeSpec(spec: VariantSpec): string {
  const parts = [`${Math.round(spec.footprint * 100)}% size`];
  parts.push(spec.border ? "frame" : "no frame");
  if (spec.stickers.length) {
    parts.push(`${spec.stickers.length} sticker${spec.stickers.length > 1 ? "s" : ""}`);
  }
  return parts.join(" · ");
}
