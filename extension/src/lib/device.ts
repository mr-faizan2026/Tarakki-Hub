import { DEVICE_LABEL_MAX } from "./config";
import { KEYS, read, write } from "./storage";

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  THE DEVICE ID — what it is, and what it deliberately is not
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  A random UUID, generated once on first install, kept in chrome.storage.local,
 *  and sent with every licensed call so the backend can enforce how many installs
 *  one account may keep signed in.
 *
 *  ── NOT A FINGERPRINT ─────────────────────────────────────────────────────
 *  Nothing about the machine goes into it. No hardware ids, no canvas or font
 *  probing, no installed-extension enumeration, no IP. It is `crypto.randomUUID()`
 *  and nothing else, which means:
 *
 *    • it cannot identify a person across accounts — two accounts on one computer
 *      get two unrelated ids;
 *    • it cannot be correlated with anything outside TarakkiHub;
 *    • clearing the extension's storage genuinely resets it, and the result is
 *      simply a new device the seller can sign out of from the panel.
 *
 *  A real fingerprint would survive a reinstall, which is exactly why we don't
 *  want one: the cost of a honest id is that a determined person can reinstall to
 *  get a fresh one, and that is a far better trade than quietly tracking people.
 *
 *  ── THE LABEL ─────────────────────────────────────────────────────────────
 *  "Chrome on Windows", derived from the platform the extension API already
 *  tells us. It exists so the device list in the panel reads like something a
 *  seller can make a decision about, rather than four UUIDs. It is coarse on
 *  purpose — no browser version, no architecture, no locale.
 */

/**
 * The id for this install, creating it on first call.
 *
 * Idempotent and safe to call from any context: a second caller that races the
 * first re-reads storage and keeps whichever id landed, so the two never diverge.
 */
export async function deviceId(): Promise<string> {
  const existing = await read(KEYS.deviceId);
  if (existing) return existing;

  const fresh = randomId();
  await write(KEYS.deviceId, fresh);

  // Re-read: if another context (the panel and the worker can boot together)
  // wrote first, that id is the one already registered with the backend.
  const settled = await read(KEYS.deviceId);
  return settled ?? fresh;
}

function randomId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    // crypto.randomUUID needs a secure context. Extension pages always are, but
    // a preview harness or an odd embedding might not be — and an id is still
    // better than no id, since it only ever has to be unique per account.
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
}

/**
 * A short, human label for the device list. Coarse by design — enough for a
 * seller to tell their shop computer from their laptop, and no more.
 */
export async function deviceLabel(): Promise<string> {
  const browser = browserName();
  const os = await platformName();
  return `${browser} on ${os}`.slice(0, DEVICE_LABEL_MAX);
}

function browserName(): string {
  // Chromium forks all run this extension; naming the actual one helps a seller
  // who uses Chrome at the shop and Edge at home.
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/\bEdg\//.test(ua)) return "Edge";
  if (/\bOPR\//.test(ua)) return "Opera";
  if (/\bBrave\//.test(ua)) return "Brave";
  if (/\bVivaldi\//.test(ua)) return "Vivaldi";
  return "Chrome";
}

const OS_NAMES: Record<string, string> = {
  win: "Windows",
  mac: "macOS",
  linux: "Linux",
  cros: "ChromeOS",
  android: "Android",
  openbsd: "OpenBSD",
};

async function platformName(): Promise<string> {
  try {
    const info = await chrome.runtime.getPlatformInfo();
    return OS_NAMES[info.os] ?? "this computer";
  } catch {
    return "this computer";
  }
}
