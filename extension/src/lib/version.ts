/**
 * Version comparison, for the min_version floor and the latest_version notice.
 *
 * Deliberately not semver-complete: extension versions in a Chrome manifest are
 * 1–4 dot-separated integers and nothing else — no pre-release tags, no build
 * metadata, no leading `v`. Pulling in a semver library to parse a grammar that
 * Chrome itself forbids would be the wrong trade.
 *
 * Anything unparseable compares as 0, which means an install with a mangled
 * version is treated as OLD and shown the update screen. That is the safe
 * direction: the alternative is treating a broken build as current.
 */

const PART_RE = /^\d+$/;

function parts(version: string): number[] {
  return String(version ?? "")
    .trim()
    .split(".")
    .slice(0, 4)
    .map((part) => (PART_RE.test(part) ? Number.parseInt(part, 10) : 0));
}

/** −1 when a is older, 0 when equal, 1 when a is newer. "0.10.0" > "0.9.0". */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

/** True when `version` is below `floor` — the hard "please update" gate. */
export function isBelow(version: string, floor: string): boolean {
  return compareVersions(version, floor) < 0;
}

/** The running extension's own version, from the manifest. */
export function currentVersion(): string {
  try {
    return chrome.runtime.getManifest().version;
  } catch {
    // Outside an extension context (the preview harness, a unit test).
    return "0.0.0";
  }
}
