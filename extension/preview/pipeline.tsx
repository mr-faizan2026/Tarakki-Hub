import "../src/sidepanel/styles.css";
import { detectBoundingBox } from "@/lib/image/bounding-box";
import {
  EXPORT_SIZE,
  decodeImageFile,
  exportVariantJpeg,
  type StickerArt,
} from "@/lib/image/compositor";
import { buildVariantSpecs, describeSpec } from "@/lib/image/variants";
import { loadStickerArt, loadStickerIndex } from "@/lib/image/stickers";

/**
 * IMAGE PIPELINE CHECK — run against a real product photo (see FIXTURES below).
 *
 * The quoting side is covered by scripts/test-accuracy.mjs, which can't touch a
 * canvas. This page covers the other half, and one property in particular:
 *
 *   THE BYTES MEESHO QUOTED MUST BE THE BYTES THE SELLER DOWNLOADS.
 *
 * Meesho derives the shipping charge from which catalog product it matches the
 * photo to, so re-encoding an image between quoting it and handing it over
 * would silently invalidate the number. ImageGenerator keeps the exact Blob it
 * quoted; this page proves the renderer that produced it is deterministic, so
 * that guarantee is real rather than incidental.
 *
 * Drop any product photo at preview/product.jpg (gitignored — it's a fixture,
 * not source), run `npm run dev:preview`, and open
 * http://localhost:5199/pipeline.html.
 */

const SPEC_COUNT = 12;
const root = document.getElementById("root")!;

// stickers.ts resolves bundled art through chrome.runtime.getURL. A plain page
// has a `chrome` object but no `runtime`, so point that one function at the dev
// server's copy of public/ — the REAL loader then runs here instead of being
// stubbed out of the test.
type ChromeShim = { runtime?: { getURL?: (path: string) => string } };
const g = globalThis as unknown as { chrome?: ChromeShim };
g.chrome ??= {};
g.chrome.runtime ??= {};
g.chrome.runtime.getURL ??= (path: string) => new URL(`/${path}`, location.origin).href;

const results: { name: string; ok: boolean; detail: string }[] = [];

function check(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
}

async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)]
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** The first fixture that is present — drop any product photo into preview/. */
const FIXTURES = ["/product.jpg", "/loafers.jpg"];
let fixture = FIXTURES[0];
async function loadFixture(): Promise<Blob> {
  for (const path of FIXTURES) {
    const res = await fetch(path);
    if (res.ok) {
      fixture = path.replace("/", "");
      return res.blob();
    }
  }
  throw new Error(`No fixture found — add one of ${FIXTURES.join(", ")}`);
}

async function run() {
  const file = await loadFixture();
  const bitmap = await decodeImageFile(file);
  const bbox = detectBoundingBox(bitmap);

  check(
    "photo decodes",
    bitmap.width > 0 && bitmap.height > 0,
    `${bitmap.width}×${bitmap.height}px, ${(file.size / 1024).toFixed(1)} kB`,
  );
  check(
    "product bounding box is sane",
    bbox.width > 0 &&
      bbox.height > 0 &&
      bbox.x + bbox.width <= bitmap.width &&
      bbox.y + bbox.height <= bitmap.height,
    `x${bbox.x} y${bbox.y} ${bbox.width}×${bbox.height} — trimmed ${(
      100 -
      (bbox.width * bbox.height * 100) / (bitmap.width * bitmap.height)
    ).toFixed(1)}% of the frame as background`,
  );

  const stickers: StickerArt = await loadStickerIndex()
    .then(loadStickerArt)
    .catch(() => new Map());
  check("sticker art loads", stickers.size > 0, `${stickers.size} stickers`);

  const specs = buildVariantSpecs({
    count: SPEC_COUNT,
    seed: 20240924,
    stickerIds: [...stickers.keys()],
    withStickers: true,
  });

  const gallery = document.createElement("div");
  gallery.className = "variations";

  let allDeterministic = true;
  let allSquare = true;

  for (const spec of specs) {
    // Render the SAME spec twice: these must be byte-identical, because one of
    // them is what Meesho priced and the other is what the seller receives.
    const first = await exportVariantJpeg(bitmap, bbox, spec, stickers);
    const second = await exportVariantJpeg(bitmap, bbox, spec, stickers);
    const [a, b] = await Promise.all([sha256(first), sha256(second)]);
    if (a !== b) allDeterministic = false;

    const shot = await createImageBitmap(first);
    if (shot.width !== EXPORT_SIZE || shot.height !== EXPORT_SIZE) allSquare = false;

    const card = document.createElement("div");
    card.className = "vcard";
    const img = document.createElement("img");
    img.src = URL.createObjectURL(first);
    img.width = 200;
    img.height = 200;
    img.style.borderRadius = "8px";
    const foot = document.createElement("div");
    foot.className = "vcard__foot";
    foot.textContent = `${describeSpec(spec)} · ${(first.size / 1024).toFixed(0)} kB · ${a}`;
    card.append(img, foot);
    gallery.append(card);
  }

  check(
    "rendering is deterministic",
    allDeterministic,
    "the same spec rendered twice produced identical bytes — so the image Meesho quoted is the image that gets downloaded",
  );
  check("exports are 1000×1000", allSquare, `Meesho's catalog spec, ${SPEC_COUNT} variants checked`);

  /* ─── report ───────────────────────────────────────────────────────────── */

  const failed = results.filter((r) => !r.ok).length;
  const head = document.createElement("div");
  head.className = "section";
  head.innerHTML = `<div class="section__title">Image pipeline — ${fixture}</div>`;
  for (const r of results) {
    const row = document.createElement("div");
    row.className = r.ok ? "alert success" : "alert";
    row.style.marginTop = "8px";
    row.textContent = `${r.ok ? "PASS" : "FAIL"} — ${r.name}: ${r.detail}`;
    head.append(row);
  }
  const summary = document.createElement("p");
  summary.className = "hint";
  summary.style.marginTop = "10px";
  summary.textContent = failed
    ? `${failed} of ${results.length} checks failed.`
    : `All ${results.length} checks passed.`;
  head.append(summary);

  const shelf = document.createElement("div");
  shelf.className = "section";
  shelf.innerHTML = `<div class="section__title">Rendered variants</div>`;
  shelf.append(gallery);

  root.append(head, shelf);
  document.title = failed ? `FAIL (${failed})` : "PASS";
}

run().catch((err) => {
  root.textContent = `Harness error: ${String(err)}`;
  document.title = "ERROR";
});
