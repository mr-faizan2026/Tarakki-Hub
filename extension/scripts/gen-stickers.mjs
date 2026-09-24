/**
 * Generates the default sticker set as on-brand SVG badges under
 * public/stickers/, plus stickers/index.json (the manifest the panel reads).
 *
 * These are working, brand-styled placeholders. To use custom art, drop PNG/SVG
 * files into public/stickers/ and add them to index.json — the loader reads the
 * manifest, so nothing in code needs to change. Re-run with `npm run gen:assets`.
 *
 * Text uses a generic sans-serif so it always renders when the SVG is drawn to
 * the export canvas as an <img> (page @font-face doesn't apply inside <img>).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "public", "stickers");

// name → accent theme. teal/white, ink/white, amber/ink.
const THEME = {
  teal: { fill: "#17B8A1", edge: "#0B7C6D", text: "#FFFFFF", sub: "#D2F4EC" },
  ink: { fill: "#16293B", edge: "#0E2131", text: "#FFFFFF", sub: "#A7B2BA" },
  amber: { fill: "#E8A13C", edge: "#CF8A29", text: "#16293B", sub: "#5A6F7E" },
};

// The 12 provided sticker names, with a theme each.
const STICKERS = [
  { label: "BEST DEAL", theme: "teal" },
  { label: "FREE SHIPPING", theme: "teal" },
  { label: "LOWEST PRICE", theme: "teal" },
  { label: "SPECIAL OFFER", theme: "amber" },
  { label: "SPECIAL SALE", theme: "amber" },
  { label: "SALE", theme: "amber" },
  { label: "CLEARANCE", theme: "amber" },
  { label: "24 HR OFFER", theme: "amber" },
  { label: "BEST SELLER", theme: "ink" },
  { label: "BEST QUALITY", theme: "ink" },
  { label: "NEW ARRIVAL", theme: "teal" },
  { label: "NEW", theme: "teal" },
];

const slug = (label) => label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const titleCase = (label) =>
  label
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bHr\b/, "Hr");

function escapeText(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function badgeSvg(label, themeName) {
  const t = THEME[themeName];
  const words = label.split(" ");
  const twoLine = words.length > 1;

  // Layout: compact rounded badge, optional two lines, a top accent hairline
  // and a small corner fold for a handcrafted sticker feel.
  const W = 380;
  const H = twoLine ? 230 : 170;
  const pad = 16;
  const radius = 22;

  const lines = twoLine ? [words[0], words.slice(1).join(" ")] : [label];
  const fontSize = twoLine ? 62 : 78;
  const lineGap = fontSize * 1.02;
  const startY = H / 2 - ((lines.length - 1) * lineGap) / 2;

  const textEls = lines
    .map((line, i) => {
      const y = startY + i * lineGap;
      return `<text x="${W / 2}" y="${y}" text-anchor="middle" dominant-baseline="central" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="${fontSize}" letter-spacing="1.5" fill="${t.text}">${escapeText(line)}</text>`;
    })
    .join("\n    ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <filter id="s" x="-8%" y="-8%" width="116%" height="120%">
      <feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#0E2131" flood-opacity="0.18"/>
    </filter>
  </defs>
  <g filter="url(#s)">
    <rect x="${pad}" y="${pad}" width="${W - pad * 2}" height="${H - pad * 2}" rx="${radius}" fill="${t.fill}" stroke="${t.edge}" stroke-width="3"/>
    <rect x="${pad + 12}" y="${pad + 12}" width="${W - pad * 2 - 24}" height="${H - pad * 2 - 24}" rx="${radius - 8}" fill="none" stroke="${t.sub}" stroke-opacity="0.45" stroke-width="2"/>
    ${textEls}
  </g>
</svg>
`;
}

mkdirSync(OUT_DIR, { recursive: true });
const index = { stickers: [] };
for (const s of STICKERS) {
  const id = slug(s.label);
  const file = `stickers/${id}.svg`;
  writeFileSync(join(OUT_DIR, `${id}.svg`), badgeSvg(s.label, s.theme));
  index.stickers.push({ id, label: titleCase(s.label), file });
}
writeFileSync(join(OUT_DIR, "index.json"), JSON.stringify(index, null, 2));
console.log(`Wrote ${index.stickers.length} stickers + index.json`);
