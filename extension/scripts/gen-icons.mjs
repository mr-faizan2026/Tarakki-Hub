/**
 * Generates the extension's toolbar/store icons (16/32/48/128 px PNG) from the
 * TarakkiHub logo mark — a teal rounded square with a white rising arrow. Pure
 * Node (zlib only), no native deps: renders at 4× and box-downsamples for clean
 * anti-aliasing, then writes valid PNGs. Re-run with `npm run gen:assets`.
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "public", "icons");

const TEAL = [0x17, 0xb8, 0xa1];
const WHITE = [0xff, 0xff, 0xff];
const SS = 4; // supersample factor
const GRID = 40; // logo mark is authored on a 40-unit grid

// ── geometry helpers (grid units) ──────────────────────────────────────────
function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function insideRoundedRect(x, y, w, h, r) {
  const cx = Math.min(Math.max(x, r), w - r);
  const cy = Math.min(Math.max(y, r), h - r);
  if (x >= r && x <= w - r) return y >= 0 && y <= h;
  if (y >= r && y <= h - r) return x >= 0 && x <= w;
  return Math.hypot(x - cx, y - cy) <= r;
}

// Arrow strokes (grid units), matching src/components/ui/Logo.tsx.
const STROKE = 3.3;
const HALF = STROKE / 2;
const shaft = [12.6, 26.8, 26, 13.8];
const headA = [19.4, 13.8, 26, 13.8];
const headB = [26, 13.8, 26, 20.2];
const dot = { x: 12.6, y: 26.8, r: 2 };

function isWhite(gx, gy) {
  if (Math.hypot(gx - dot.x, gy - dot.y) <= dot.r) return true;
  if (distToSegment(gx, gy, ...shaft) <= HALF) return true;
  if (distToSegment(gx, gy, ...headA) <= HALF) return true;
  if (distToSegment(gx, gy, ...headB) <= HALF) return true;
  return false;
}

function renderHiRes(size) {
  const R = size * SS;
  const scale = R / GRID;
  const radius = 9 * scale; // rx=9 on the 40 grid
  const buf = new Uint8ClampedArray(R * R * 4); // transparent
  for (let y = 0; y < R; y++) {
    for (let x = 0; x < R; x++) {
      const i = (y * R + x) * 4;
      const px = x + 0.5;
      const py = y + 0.5;
      if (!insideRoundedRect(px, py, R, R, radius)) continue; // stays transparent
      const gx = px / scale;
      const gy = py / scale;
      const [r, g, b] = isWhite(gx, gy) ? WHITE : TEAL;
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
      buf[i + 3] = 255;
    }
  }
  return { buf, R };
}

// Premultiplied box-downsample from R×R to size×size.
function downsample(hi, R, size) {
  const out = new Uint8ClampedArray(size * size * 4);
  const n = SS * SS;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sa = 0;
      let sr = 0;
      let sg = 0;
      let sb = 0;
      for (let dy = 0; dy < SS; dy++) {
        for (let dx = 0; dx < SS; dx++) {
          const sx = x * SS + dx;
          const sy = y * SS + dy;
          const i = (sy * R + sx) * 4;
          const a = hi[i + 3];
          sa += a;
          sr += hi[i] * a;
          sg += hi[i + 1] * a;
          sb += hi[i + 2] * a;
        }
      }
      const o = (y * size + x) * 4;
      const a = sa / n;
      out[o + 3] = Math.round(a);
      if (sa > 0) {
        out[o] = Math.round(sr / sa);
        out[o + 1] = Math.round(sg / sa);
        out[o + 2] = Math.round(sb / sa);
      }
    }
  }
  return out;
}

// ── PNG encoding ────────────────────────────────────────────────────────────
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
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
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
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  // filtered scanlines (filter byte 0 per row)
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── run ───────────────────────────────────────────────────────────────────
mkdirSync(OUT_DIR, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const { buf, R } = renderHiRes(size);
  const small = downsample(buf, R, size);
  const png = encodePng(small, size);
  writeFileSync(join(OUT_DIR, `icon${size}.png`), png);
  console.log(`icons/icon${size}.png (${png.length} bytes)`);
}
