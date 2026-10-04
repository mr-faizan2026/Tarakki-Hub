import type { Box } from "./bounding-box";
import type { VariantSpec } from "./variants";

/**
 * Canvas compositor. Renders a VariantSpec onto a square canvas (Meesho's
 * catalog spec is 1000×1000): background fill, the product cropped from its
 * bounding box and scaled to the spec's footprint, one or two square frames,
 * and promo stickers on the product. Exports a JPEG.
 *
 * Rendering is a pure function of (photo, bbox, spec), so a card preview and the
 * exported image Meesho quoted are always the same picture. The exported bytes
 * are what get quoted, applied and downloaded — never re-rendered in between:
 * Meesho's shipping charge follows the catalog product it matched the image to,
 * so a re-encode between quoting and handing over would silently invalidate the
 * figure. preview/pipeline.tsx checks that determinism against a real photo.
 */

export const EXPORT_SIZE = 1000;
const JPEG_QUALITY = 0.92;

export type Placement = { x: number; y: number; width: number; height: number };

/** Sticker art by id, pre-loaded (see stickers.ts). */
export type StickerArt = Map<string, HTMLImageElement>;

/** Decode an uploaded file into an ImageBitmap (reliable width/height). */
export async function decodeImageFile(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file);
}

/**
 * The SOURCE rectangle to draw from: the product's bounding box, cropped in by
 * `spec.crop`. Zoom 1 is the whole box. The window is clamped inside the box,
 * so a crop centre near an edge slides in rather than sampling blank pixels
 * outside the product.
 */
export function sourceRectFor(bbox: Box, spec: VariantSpec): Placement {
  const zoom = Math.max(1, spec.crop.zoom);
  const width = bbox.width / zoom;
  const height = bbox.height / zoom;
  const x = bbox.x + clamp(spec.crop.cx * bbox.width - width / 2, 0, bbox.width - width);
  const y = bbox.y + clamp(spec.crop.cy * bbox.height - height / 2, 0, bbox.height - height);
  return { x, y, width, height };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * The product rectangle for a spec on a size×size canvas.
 *
 * Aspect comes from the CROPPED source, not the raw bbox — otherwise a cropped
 * variant would be stretched, and a distorted garment is both an obviously
 * worse listing and a match nobody can reason about.
 */
export function productRectFor(size: number, bbox: Box, spec: VariantSpec): Placement {
  const src = sourceRectFor(bbox, spec);
  const aspect = src.width / src.height || 1;
  const target = spec.footprint * size; // longest side
  const width = src.width >= src.height ? target : target * aspect;
  const height = src.width >= src.height ? target / aspect : target;
  const freeX = (size - width) / 2;
  const freeY = (size - height) / 2;
  return {
    x: freeX + spec.offset.x * freeX,
    y: freeY + spec.offset.y * freeY,
    width,
    height,
  };
}

/** Render one variant onto `ctx` (already sized to size×size). */
export function renderVariant(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  bitmap: ImageBitmap,
  bbox: Box,
  spec: VariantSpec,
  size: number,
  stickers: StickerArt,
): void {
  // 1) Canvas fill.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = spec.background || "#ffffff";
  ctx.fillRect(0, 0, size, size);

  // 2) Product: the crop window out of its bounding box, scaled to the
  //    footprint. Source and destination aspect agree (see productRectFor), so
  //    nothing is stretched.
  const src = sourceRectFor(bbox, spec);
  const rect = productRectFor(size, bbox, spec);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    bitmap,
    src.x,
    src.y,
    src.width,
    src.height,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
  );

  // 3) Square frame(s) near the canvas edge, outer first.
  for (const border of [spec.border, spec.innerBorder]) {
    if (!border) continue;
    const lineWidth = Math.max(1, border.width * size);
    const inset = border.inset * size + lineWidth / 2;
    // A frame whose inset has eaten the whole canvas would draw inside out.
    if (size - inset * 2 <= lineWidth) continue;
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = border.color;
    ctx.strokeRect(inset, inset, size - inset * 2, size - inset * 2);
  }

  // 4) Stickers on the product.
  for (const s of spec.stickers) {
    const art = stickers.get(s.stickerId);
    if (!art || !art.naturalWidth) continue;
    const placed = stickerRectFor(rect, s, art.naturalWidth / art.naturalHeight || 2.4);
    ctx.save();
    ctx.translate(placed.x + placed.width / 2, placed.y + placed.height / 2);
    ctx.rotate((s.rotation * Math.PI) / 180);
    ctx.drawImage(art, -placed.width / 2, -placed.height / 2, placed.width, placed.height);
    ctx.restore();
  }
}

/**
 * Where one sticker actually lands — SIZED AND CLAMPED TO THE PRODUCT.
 *
 * ── THE BUG THIS EXISTS TO PREVENT ────────────────────────────────────────
 * `scale` is a fraction of the product's LONGEST side, and a garment photo is
 * portrait: at footprint 0.97 on a 600×900 product the longest side is the
 * ~970px height while the product is only ~647px wide. A 0.29-scale sticker is
 * then 281px wide, and one placed at px 0.82 (the lower-right spot) hung ~80px
 * off the side of the garment and onto the plain backdrop — a promo badge
 * floating in space, which reads as a slapped-on watermark and is exactly the
 * kind of thing Meesho QC rejects. It quoted fine, which is what made it easy to
 * miss.
 *
 * Two rules, in order:
 *   1. the badge may never be wider or taller than the product rect;
 *   2. its centre is then pulled in until the whole badge sits inside it.
 *
 * ── WHY THE ROTATED DIAGONAL, NOT THE BOX ─────────────────────────────────
 * The badge is drawn rotated about its centre, so the space it really occupies is
 * its rotated bounding box. Clamping the unrotated box would still let a tilted
 * corner poke out. The rotation is small (±9°) so this costs a few pixels of
 * margin and buys a guarantee.
 *
 * Exported because it is the containment rule: renderVariant calls it, and
 * scripts/test-accuracy.mjs asserts against it rather than re-deriving the maths.
 */
export function stickerRectFor(
  product: Placement,
  sticker: { px: number; py: number; scale: number; rotation: number },
  artAspect: number,
): Placement {
  const aspect = artAspect > 0 ? artAspect : 2.4;
  const longest = Math.max(product.width, product.height);

  let width = sticker.scale * longest;
  let height = width / aspect;

  // 1) Never larger than the product, in either direction. Scale down keeping the
  //    art's own aspect, so a clamped sticker is smaller, never squashed.
  const fit = Math.min(1, product.width / width, product.height / height);
  width *= fit;
  height *= fit;

  // 2) Pull the centre inside. The rotated badge spans this much either way.
  const radians = (sticker.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const spanX = Math.min(width * cos + height * sin, product.width);
  const spanY = Math.min(width * sin + height * cos, product.height);

  const cx = clamp(
    product.x + sticker.px * product.width,
    product.x + spanX / 2,
    product.x + product.width - spanX / 2,
  );
  const cy = clamp(
    product.y + sticker.py * product.height,
    product.y + spanY / 2,
    product.y + product.height - spanY / 2,
  );

  return { x: cx - width / 2, y: cy - height / 2, width, height };
}

function makeCanvas(
  width: number,
  height = width,
): {
  canvas: OffscreenCanvas | HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
} {
  const canvas =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement("canvas"), { width, height });
  const ctx = canvas.getContext("2d") as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error("2D context unavailable");
  return { canvas, ctx };
}

async function canvasToJpeg(canvas: OffscreenCanvas | HTMLCanvasElement): Promise<Blob> {
  if (canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type: "image/jpeg", quality: JPEG_QUALITY });
  }
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      JPEG_QUALITY,
    ),
  );
}

/** Render a variant at full export resolution → JPEG (what Meesho quotes). */
export async function exportVariantJpeg(
  bitmap: ImageBitmap,
  bbox: Box,
  spec: VariantSpec,
  stickers: StickerArt,
): Promise<Blob> {
  const { canvas, ctx } = makeCanvas(EXPORT_SIZE);
  renderVariant(ctx, bitmap, bbox, spec, EXPORT_SIZE, stickers);
  return canvasToJpeg(canvas);
}

/**
 * The seller's own photo as Meesho would receive it — the baseline every
 * variant is compared against. JPEG/PNG go up untouched; anything else (e.g.
 * WEBP, which the panel's picker doesn't accept) is flattened onto white.
 */
export async function originalForUpload(file: File, bitmap: ImageBitmap): Promise<Blob> {
  if (file.type === "image/jpeg" || file.type === "image/png") return file;
  const { canvas, ctx } = makeCanvas(bitmap.width, bitmap.height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, bitmap.width, bitmap.height);
  ctx.drawImage(bitmap, 0, 0);
  return canvasToJpeg(canvas);
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
