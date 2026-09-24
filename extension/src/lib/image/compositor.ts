import type { Box } from "./bounding-box";
import type { VariantSpec } from "./variants";

/**
 * Canvas compositor. Renders a VariantSpec — product on a square white canvas
 * (Meesho spec is 1000×1000) at the spec's footprint, a thin square frame, and
 * promo stickers on the product, Listify-style — and exports a JPEG.
 *
 * Rendering is a pure function of (photo, bbox, spec), so a card preview and the
 * exported image Meesho quoted are always the same picture. The exported bytes
 * are what get quoted, applied and downloaded — never re-rendered in between.
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

/** The product rectangle for a spec on a size×size canvas. */
export function productRectFor(size: number, bbox: Box, spec: VariantSpec): Placement {
  const aspect = bbox.width / bbox.height || 1;
  const target = spec.footprint * size; // longest side
  const width = bbox.width >= bbox.height ? target : target * aspect;
  const height = bbox.width >= bbox.height ? target / aspect : target;
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
  // 1) White canvas.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);

  // 2) Product, trimmed to its bounding box and scaled to the footprint.
  const rect = productRectFor(size, bbox, spec);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    bitmap,
    bbox.x,
    bbox.y,
    bbox.width,
    bbox.height,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
  );

  // 3) Thin square frame near the canvas edge.
  if (spec.border) {
    const lineWidth = Math.max(1, spec.border.width * size);
    const inset = spec.border.inset * size + lineWidth / 2;
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = spec.border.color;
    ctx.strokeRect(inset, inset, size - inset * 2, size - inset * 2);
  }

  // 4) Stickers on the product.
  const longest = Math.max(rect.width, rect.height);
  for (const s of spec.stickers) {
    const art = stickers.get(s.stickerId);
    if (!art || !art.naturalWidth) continue;
    const w = s.scale * longest;
    const h = w / (art.naturalWidth / art.naturalHeight || 2.4);
    ctx.save();
    ctx.translate(rect.x + s.px * rect.width, rect.y + s.py * rect.height);
    ctx.rotate((s.rotation * Math.PI) / 180);
    ctx.drawImage(art, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
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
