import type { StickerArt } from "./compositor";

/**
 * Sticker registry.
 *
 * Stickers are bundled assets under `public/stickers/`, listed in
 * `stickers/index.json` so new ones can be dropped into the folder (and added
 * to the index) without touching code. They load from the extension origin, so
 * drawing them to the export canvas never taints it.
 *
 * Placement is part of each variant's recipe (variants.ts): like Listify's
 * output, stickers sit on the product itself, and Meesho's live quote tells us
 * whether a given sticker helped or hurt.
 */

export type StickerMeta = {
  id: string;
  label: string;
  file: string; // path relative to the extension root, e.g. "stickers/best-deal.svg"
};

/** Load the sticker manifest. Returns [] (no stickers) if the file is absent. */
export async function loadStickerIndex(): Promise<StickerMeta[]> {
  try {
    const url = chrome.runtime.getURL("stickers/index.json");
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = (await res.json()) as { stickers?: StickerMeta[] };
    return json.stickers ?? [];
  } catch {
    return [];
  }
}

const imageCache = new Map<string, HTMLImageElement>();

/** Load (and cache) a sticker as an <img>, ready to draw onto a canvas. */
export async function loadStickerImage(
  meta: StickerMeta,
): Promise<HTMLImageElement> {
  const cached = imageCache.get(meta.id);
  if (cached) return cached;

  const url = chrome.runtime.getURL(meta.file);
  const img = new Image();
  img.decoding = "async";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Failed to load sticker ${meta.file}`));
    img.src = url;
  });
  imageCache.set(meta.id, img);
  return img;
}

/** Load every sticker in the index; ones that fail to load are skipped. */
export async function loadStickerArt(metas: StickerMeta[]): Promise<StickerArt> {
  const art: StickerArt = new Map();
  await Promise.all(
    metas.map(async (meta) => {
      try {
        art.set(meta.id, await loadStickerImage(meta));
      } catch {
        /* missing art — that sticker just isn't used */
      }
    }),
  );
  return art;
}
