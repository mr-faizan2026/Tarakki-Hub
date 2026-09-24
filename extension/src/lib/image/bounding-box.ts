/**
 * Detect the product's true bounding box inside an uploaded image by trimming
 * surrounding whitespace / transparency. Footprint scaling is then based on the
 * product itself, not the incoming image's canvas — so a photo that already has
 * wide margins still gets scaled correctly.
 */

export type Box = { x: number; y: number; width: number; height: number };

export type BBoxOptions = {
  /** RGB channel value above which a pixel counts as "white" (0–255). */
  whiteThreshold: number;
  /** Alpha below which a pixel counts as transparent (0–255). */
  alphaThreshold: number;
  /** Longest edge (px) the analysis is downscaled to for speed. */
  analysisMax: number;
};

const DEFAULTS: BBoxOptions = {
  whiteThreshold: 244,
  alphaThreshold: 12,
  analysisMax: 640,
};

function make2dCanvas(w: number, h: number): {
  canvas: OffscreenCanvas | HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
} {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("2D context unavailable");
    return { canvas, ctx };
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D context unavailable");
  return { canvas, ctx };
}

/**
 * Returns the product's bounding box in the SOURCE image's own pixel
 * coordinates. If the image is effectively empty (all background), returns the
 * full-image box so the product is never lost.
 */
export function detectBoundingBox(
  source: CanvasImageSource & { width: number; height: number },
  options: Partial<BBoxOptions> = {},
): Box {
  const opt = { ...DEFAULTS, ...options };
  const sw = source.width;
  const sh = source.height;
  const full: Box = { x: 0, y: 0, width: sw, height: sh };
  if (!sw || !sh) return full;

  // Downscale for a fast pixel scan, then map the box back to source coords.
  const scale = Math.min(1, opt.analysisMax / Math.max(sw, sh));
  const aw = Math.max(1, Math.round(sw * scale));
  const ah = Math.max(1, Math.round(sh * scale));

  const { ctx } = make2dCanvas(aw, ah);
  ctx.drawImage(source, 0, 0, aw, ah);

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, aw, ah).data;
  } catch {
    // Should never taint (same-origin source), but be safe.
    return full;
  }

  const { whiteThreshold: wt, alphaThreshold: at } = opt;
  let minX = aw;
  let minY = ah;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < ah; y++) {
    for (let x = 0; x < aw; x++) {
      const i = (y * aw + x) * 4;
      const a = data[i + 3];
      if (a < at) continue; // transparent → background
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (r >= wt && g >= wt && b >= wt) continue; // near-white → background
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0 || maxY < 0) return full; // nothing but background

  // Map back to source resolution, clamped to bounds.
  const inv = 1 / scale;
  const x = Math.max(0, Math.floor(minX * inv));
  const y = Math.max(0, Math.floor(minY * inv));
  const width = Math.min(sw - x, Math.ceil((maxX - minX + 1) * inv));
  const height = Math.min(sh - y, Math.ceil((maxY - minY + 1) * inv));
  return { x, y, width, height };
}
