/**
 * ════════════════════════════════════════════════════════════════════════════
 *  EXTENSION ICONS — the TH monogram at 16 / 32 / 48 / 128 px
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Run: npm run gen:assets   (writes public/icons/icon<size>.png)
 *
 *  The mark is the same geometry the web app draws in src/components/ui/
 *  Logo.tsx — two filled polygons, traced from the brand PNG's own pixels. The
 *  arrow is NOT painted: it is the gap left between the T and the H, which
 *  here fills with the white tile beneath.
 *
 *  ── WHY THE MARK SITS ON A WHITE TILE HERE, AND NOWHERE ELSE ──────────────
 *  The brand mark is the bare monogram, and that is what the website draws —
 *  there the background is ours, so the ink H is always legible.
 *
 *  A toolbar icon has no such luxury. Rendered bare on a DARK Chrome theme the
 *  navy H all but vanishes and the knocked-out arrow fills with grey, so at
 *  16px the icon reads as a lone teal "T" — half the brand gone, for the one
 *  pixel-size by which users recognise an extension. Both variants were
 *  rendered and compared before choosing.
 *
 *  So the tile is not a second logo; it is packaging for the one surface whose
 *  background we do not control, the same reason phone app icons sit on a
 *  shape rather than floating.
 *
 *  ── NO IMAGE LIBRARY ──────────────────────────────────────────────────────
 *  Supersampled point-in-polygon fill, then a box downsample for the edges,
 *  then a PNG written by hand. Keeping the toolchain at zero dependencies is
 *  why a release build can be trusted to contain only what is in this repo.
 */

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "public", "icons");

/* Brand colours — the panel's own tokens, so the icon and the UI never drift. */
const TEAL = [0x17, 0xb8, 0xa1];
const INK = [0x0e, 0x21, 0x31];

/* The mark, authored on a 100 x 82.86 grid. Identical to Logo.tsx. */
const VB_W = 100;
const VB_H = 82.86;

const TEAL_PATH =
  "M0.29 0.57L0.29 17.14L21.14 16.86L20.86 82.86L39.71 82.86L40 38.57L39.43 38.29L38.86 38.86L38 38.86L37.71 39.43L36.86 39.43L36 40.29L35.14 40.29L24.57 45.71L24.29 45.14L27.14 42.57L27.14 42L29.43 40L29.43 39.43L30.57 38.86L30.57 38.29L36.57 32.29L36.57 31.71L37.43 31.43L37.43 30.86L40.29 28.29L40.29 27.71L40.86 27.71L41.14 26.86L45.43 22.86L45.43 22.29L50.29 17.71L50.29 16.86L48.86 15.43L46 13.71L46.29 13.14L61.71 10.29L61.71 28L58.57 25.14L58.57 40L60.29 39.43L62.29 37.43L62.86 37.43L66.86 34L67.43 34L67.71 0.57Z";

const INK_PATH =
  "M99.43 0L82 9.14L81.71 40.29L58.57 40L58.57 24.86L58 24L56.57 24.29L54.57 26.57L54 26.57L52.57 28.29L52 28.29L50.29 30.29L49.71 30.29L46 34L45.43 34L45.14 34.86L44 35.43L43.71 82.86L58.86 82.57L58.86 54.86L81.71 54.86L81.71 82.86L100 82.57L100 0.29Z";

/** These paths are straight-line polygons only, so parsing is this simple. */
function toPolygons(d) {
  return d
    .split("Z")
    .filter((s) => s.trim())
    .map((sub) =>
      sub
        .replace(/^M/, "")
        .split("L")
        .map((pair) => pair.trim().split(/\s+/).map(Number)),
    );
}

const TEAL_POLYS = toPolygons(TEAL_PATH);
const INK_POLYS = toPolygons(INK_PATH);

/**
 * Even-odd fill, matching how a browser renders these paths. A ray cast to the
 * right counts crossings; odd means inside. Even-odd rather than nonzero is
 * what makes a hole inside a shape read as a hole.
 */
function inside(polys, x, y) {
  let crossings = 0;
  for (const pts of polys) {
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i];
      const [xj, yj] = pts[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) crossings++;
    }
  }
  return crossings % 2 === 1;
}

const SS = 4; // supersample factor — 16 samples per output pixel

/**
 * The mark is wider than it is tall, so it is centred in the square icon and
 * scaled to the width. The tile is drawn first and fills the canvas; the mark
 * is then inset inside it.
 */
function render(size) {
  const R = size * SS;
  const out = new Uint8Array(R * R * 4);

  const margin = 0.18; // inset within the tile, not the canvas
  const scale = (R * (1 - margin * 2)) / VB_W;
  const offX = R * margin;
  const offY = (R - VB_H * scale) / 2;

  /* Rounded square, corner radius ~22% — close to the platform convention and
     to the radius the panel's own surfaces use. */
  const rad = R * 0.22;
  const inTile = (x, y) => {
    const cx = Math.min(Math.max(x, rad), R - rad);
    const cy = Math.min(Math.max(y, rad), R - rad);
    return Math.hypot(x - cx, y - cy) <= rad;
  };

  for (let py = 0; py < R; py++) {
    for (let px = 0; px < R; px++) {
      if (inTile(px + 0.5, py + 0.5)) {
        const t = (py * R + px) * 4;
        out[t] = out[t + 1] = out[t + 2] = 0xff;
        out[t + 3] = 255;
      }
      const x = (px + 0.5 - offX) / scale;
      const y = (py + 0.5 - offY) / scale;
      let rgb = null;
      // Ink is drawn over teal where they meet, as in the SVG's paint order.
      if (inside(INK_POLYS, x, y)) rgb = INK;
      else if (inside(TEAL_POLYS, x, y)) rgb = TEAL;
      if (!rgb) continue;
      const o = (py * R + px) * 4;
      out[o] = rgb[0];
      out[o + 1] = rgb[1];
      out[o + 2] = rgb[2];
      out[o + 3] = 255;
    }
  }
  return { buf: out, R };
}

/** Box filter down to the final size — this is where the edges get their
 *  anti-aliasing. Colours are averaged weighted by alpha so the edge pixels do
 *  not darken toward transparent black. */
function downsample(hi, R, size) {
  const out = new Uint8Array(size * size * 4);
  const n = SS * SS;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const o = ((y * SS + sy) * R + (x * SS + sx)) * 4;
          const al = hi[o + 3];
          r += hi[o] * al;
          g += hi[o + 1] * al;
          b += hi[o + 2] * al;
          a += al;
        }
      }
      const o = (y * size + x) * 4;
      if (a > 0) {
        out[o] = Math.round(r / a);
        out[o + 1] = Math.round(g / a);
        out[o + 2] = Math.round(b / a);
        out[o + 3] = Math.round(a / n);
      }
    }
  }
  return out;
}

/* ── PNG encoding, unchanged ───────────────────────────────────────────────*/
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(rgba, size) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const { buf, R } = render(size);
  const png = encodePng(downsample(buf, R, size), size);
  writeFileSync(join(OUT_DIR, `icon${size}.png`), png);
  console.log(`  icons/icon${size}.png (${png.length} bytes)`);
}
