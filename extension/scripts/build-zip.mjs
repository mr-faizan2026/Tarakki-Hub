/**
 * ════════════════════════════════════════════════════════════════════════════
 *  RELEASE BUILD — produce the zip you upload to the Chrome Web Store
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Run: npm run release
 *
 *  Does a clean production build, CHECKS IT, and only then writes
 *  `release/tarakkihub-<version>.zip`.
 *
 *  ── THE CHECKS ARE THE POINT ──────────────────────────────────────────────
 *  Zipping a folder is three lines. What this script is actually for is refusing
 *  to ship the mistakes that are invisible in a diff and expensive in review:
 *
 *    • a source map, which hands the whole codebase to anyone who downloads it;
 *    • the dev field-scan view, which lists the seller's own form values;
 *    • a localhost host permission, which Chrome review will ask about and which
 *      has no business in a release;
 *    • a manifest version that does not match package.json, which is how you end
 *      up uploading 0.1.0 twice and having the store reject the second one;
 *    • a missing icon size, which fails validation after the upload rather than
 *      before it.
 *
 *  Every failure exits non-zero with the reason. A release that cannot be checked
 *  is not a release.
 *
 *  ── WHY A HAND-WRITTEN ZIP ────────────────────────────────────────────────
 *  No archiver dependency, exactly as scripts/gen-icons.mjs writes PNGs with only
 *  node:zlib. A release tool that pulls packages off the network is a release tool
 *  that can be compromised, and the ZIP format's stored/deflate entries are a
 *  couple of structs. It is also deterministic: fixed timestamps mean the same
 *  dist produces byte-identical zips, so two builds can be compared.
 */

import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { deflateRawSync } from "node:zlib";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = path.join(root, "dist");
const releaseDir = path.join(root, "release");

const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const version = pkg.version;

const problems = [];
const notes = [];

function fail(message) {
  problems.push(message);
}


/* ════════════════════════════════════════════════════════════════════════════
 *  A minimal ZIP writer
 * ════════════════════════════════════════════════════════════════════════════
 *  Local file headers + central directory + end record, deflate-raw for anything
 *  that compresses and stored for anything that doesn't. Timestamps are fixed so
 *  the same dist always produces the same bytes.
 */

/** 1980-01-01 00:00, the zero point of the DOS timestamp ZIP uses. */
const DOS_TIME = 0;
const DOS_DATE = (1980 - 1980) * 512 + 1 * 32 + 1;

/**
 * Built on first use rather than at module scope: the flow above runs at the top
 * level and reaches buildZip before a `const` declared down here would be
 * initialised. A hoisted function has no such problem, and memoising costs
 * nothing.
 */
let crcTable = null;

function crc32(buffer) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[i] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buffer.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buffer[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function buildZip(baseDir, relativePaths) {
  const locals = [];
  const central = [];
  let offset = 0;

  for (const rel of relativePaths) {
    const name = Buffer.from(rel, "utf8");
    const raw = readFileSync(path.join(baseDir, rel));
    const deflated = deflateRawSync(raw, { level: 9 });
    // Stored beats deflate when deflate made it bigger (tiny files, PNGs).
    const useDeflate = deflated.length < raw.length;
    const data = useDeflate ? deflated : raw;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(raw);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0, 6); // flags
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(DOS_TIME, 10);
    localHeader.writeUInt16LE(DOS_DATE, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(raw.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra field length

    locals.push(localHeader, name, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0, 8); // flags
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(DOS_TIME, 12);
    centralHeader.writeUInt16LE(DOS_DATE, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(raw.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra
    centralHeader.writeUInt16LE(0, 32); // comment
    centralHeader.writeUInt16LE(0, 34); // disk number
    centralHeader.writeUInt16LE(0, 36); // internal attrs
    centralHeader.writeUInt32LE(0, 38); // external attrs
    centralHeader.writeUInt32LE(offset, 42);

    central.push(centralHeader, name);
    offset += localHeader.length + name.length + data.length;
  }

  const centralBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4); // this disk
  end.writeUInt16LE(0, 6); // disk with central directory
  end.writeUInt16LE(relativePaths.length, 8);
  end.writeUInt16LE(relativePaths.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...locals, centralBuffer, end]);
}
/* ─── 1. a clean production build ──────────────────────────────────────── */

/**
 * Every step runs as `node <script>` — never through npm or a shell.
 *
 * Going through npm means spawning `npm.cmd` on Windows, which Node refuses
 * without `shell: true`, and `shell: true` concatenates arguments unescaped. A
 * release script is the last place to want either. Calling the tools' own entry
 * points directly is also one less layer between "it built" and what was built.
 */
function node(script, args = []) {
  const target = path.join(root, script);
  execFileSync(process.execPath, [target, ...args], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "production" },
  });
}

const TSC = "node_modules/typescript/bin/tsc";
const VITE = "node_modules/vite/bin/vite.js";

for (const tool of [TSC, VITE]) {
  try {
    statSync(path.join(root, tool));
  } catch {
    console.error(`\nMissing ${tool} — run npm install first.\n`);
    process.exit(1);
  }
}

console.log(`\n\x1b[1mTarakkiHub extension — release build ${version}\x1b[0m\n`);

console.log("  → typecheck");
node(TSC, ["--noEmit"]);

console.log("  → tests");
node("scripts/test-accuracy.mjs");
node("scripts/test-fixtures.mjs");

console.log("  → clean build");
rmSync(dist, { recursive: true, force: true });
node(VITE, ["build"]);

/* ─── 2. walk the build ────────────────────────────────────────────────── */

/** Every file under dist, as paths relative to dist, with POSIX separators. */
function walk(dir, prefix = "") {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(path.join(dir, entry.name), rel));
    else out.push(rel);
  }
  return out.sort();
}

const files = walk(dist);
if (!files.length) fail("dist/ is empty — the build produced nothing");

/* ─── 3. the checks ────────────────────────────────────────────────────── */

/* Source maps. */
const maps = files.filter((f) => f.endsWith(".map"));
if (maps.length) {
  fail(
    `source maps in the release: ${maps.join(", ")}. Set build.sourcemap = false in vite.config.ts.`,
  );
}

/* The .vite build manifest is a build artefact, not something to ship. */
const buildMeta = files.filter((f) => f.startsWith(".vite/"));
if (buildMeta.length) notes.push(`removing build metadata: ${buildMeta.join(", ")}`);

/* The dev field-scan view. It lists the seller's own field VALUES, so a release
 * containing it is a privacy problem, not only a tidiness one. */
const devMarkers = ["Field scan", "FieldScan", "VITE_DEV_TOOLS"];
for (const file of files) {
  if (!/\.(js|html|css)$/.test(file)) continue;
  const text = readFileSync(path.join(dist, file), "utf8");
  for (const marker of devMarkers) {
    if (text.includes(marker)) {
      fail(
        `"${marker}" appears in ${file} — the dev field-scan view was not stripped. ` +
          `Check DEV_TOOLS folds to false (src/lib/config.ts) and that the import stays dynamic.`,
      );
    }
  }
}

/* The manifest. */
const manifestPath = path.join(dist, "manifest.json");
let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch {
  fail("dist/manifest.json is missing or unreadable");
}

if (manifest) {
  if (manifest.version !== version) {
    fail(
      `manifest version ${manifest.version} does not match package.json ${version}. ` +
        `Bump package.json — the manifest reads from it.`,
    );
  }

  const localhost = (manifest.host_permissions ?? []).filter((p) => /localhost|127\.0\.0\.1/.test(p));
  if (localhost.length) {
    fail(
      `localhost host permissions in the release: ${localhost.join(", ")}. ` +
        `They are meant to be gated on NODE_ENV in src/manifest.config.ts — was this built with NODE_ENV=production?`,
    );
  }

  const EXPECTED_PERMISSIONS = ["sidePanel", "storage", "activeTab", "scripting", "alarms"];
  const extra = (manifest.permissions ?? []).filter((p) => !EXPECTED_PERMISSIONS.includes(p));
  if (extra.length) {
    fail(
      `unexpected permissions: ${extra.join(", ")}. Every permission needs a justification ` +
        `in docs/store-listing.md — add it there and to EXPECTED_PERMISSIONS here, or drop it.`,
    );
  }
  const missing = EXPECTED_PERMISSIONS.filter((p) => !(manifest.permissions ?? []).includes(p));
  if (missing.length) notes.push(`permissions not requested: ${missing.join(", ")}`);

  for (const size of ["16", "32", "48", "128"]) {
    if (!manifest.icons?.[size]) fail(`manifest is missing the ${size}px icon`);
    else if (!files.includes(manifest.icons[size])) {
      fail(`icon ${manifest.icons[size]} is in the manifest but not in the build`);
    }
  }

  if (!manifest.homepage_url) notes.push("manifest has no homepage_url");
  if ((manifest.description ?? "").length > 132) {
    fail(
      `description is ${manifest.description.length} characters; the store allows 132`,
    );
  }
}

/* ─── 4. report, then zip ──────────────────────────────────────────────── */

if (problems.length) {
  console.log("");
  for (const problem of problems) console.log(`  \x1b[31m✗\x1b[0m ${problem}`);
  console.log(`\n\x1b[31mRelease refused — ${problems.length} problem(s).\x1b[0m\n`);
  process.exit(1);
}

for (const note of notes) console.log(`  \x1b[2m· ${note}\x1b[0m`);

const shipped = files.filter((f) => !f.startsWith(".vite/"));

mkdirSync(releaseDir, { recursive: true });
const zipPath = path.join(releaseDir, `tarakkihub-${version}.zip`);
writeFileSync(zipPath, buildZip(dist, shipped));

const bytes = statSync(zipPath).size;
console.log(`\n  \x1b[32m✓\x1b[0m ${shipped.length} files, ${(bytes / 1024).toFixed(0)} KB`);
console.log(`  \x1b[32m✓\x1b[0m ${path.relative(root, zipPath)}\n`);
console.log("  Next: upload it, and once the store APPROVES it, set");
console.log("  latest_version in /admin → Extension. Not before.\n");
