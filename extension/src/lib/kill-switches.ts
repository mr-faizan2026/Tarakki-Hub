import { KEYS, read, watch } from "./storage";
import type { KillSwitch, KillSwitchMap } from "./backend-types";

/**
 * Feature kill switches, read from the cached map the heartbeat and the config
 * fetch both write.
 *
 * ── WHAT "OFF" MEANS, EXACTLY ─────────────────────────────────────────────
 * Not "hidden", and not "shows an error". A switched-off feature:
 *   • renders its own card with the admin's message, so the seller knows it is
 *     paused deliberately rather than broken;
 *   • does NOTHING on the page — no DOM reads, no writes, no Meesho API calls.
 *     The content script checks the same map before acting, so a stale panel
 *     cannot drive a paused feature.
 *
 * The second half is the point. A switch is thrown when the adapter is getting
 * something WRONG, and a wrong answer that is merely hidden from the UI is still
 * a wrong answer being computed against a seller's live listing.
 *
 * ── FAIL-OPEN, DELIBERATELY ───────────────────────────────────────────────
 * An absent or unreadable map means every feature is ON. The alternative —
 * treating "I couldn't read the switches" as "everything is off" — would take a
 * paying seller's whole toolkit away because chrome.storage hiccuped. The switches
 * exist to stop a known problem, not to be a licence check; the licence checks
 * are elsewhere and they fail closed.
 */

export type FeatureId = "live_shipping" | "image_generator" | "autofill";

export const FEATURE_LABELS: Record<FeatureId, string> = {
  live_shipping: "Live shipping",
  image_generator: "Low-shipping images",
  autofill: "Listing autofill",
};

const DEFAULT_MESSAGE =
  "TarakkiHub has paused this feature for everyone while we fix something. Nothing else is affected.";

export type FeatureState = {
  enabled: boolean;
  /** What the card shows when disabled. Never empty. */
  message: string;
};

export function featureState(map: KillSwitchMap, feature: FeatureId): FeatureState {
  const entry: KillSwitch | undefined = map?.[feature];
  if (!entry || entry.enabled !== false) return { enabled: true, message: "" };
  return {
    enabled: false,
    message: entry.message?.trim() ? entry.message.trim() : DEFAULT_MESSAGE,
  };
}

/** One-shot read, for the content script's boot and for guard checks. */
export async function readFeature(feature: FeatureId): Promise<FeatureState> {
  return featureState(await read(KEYS.killSwitches), feature);
}

/** Every switch at once, for the panel. */
export async function readAllFeatures(): Promise<Record<FeatureId, FeatureState>> {
  const map = await read(KEYS.killSwitches);
  return {
    live_shipping: featureState(map, "live_shipping"),
    image_generator: featureState(map, "image_generator"),
    autofill: featureState(map, "autofill"),
  };
}

/** React to an admin throwing a switch mid-session, without polling. */
export function watchFeatures(
  onChange: (features: Record<FeatureId, FeatureState>) => void,
): () => void {
  return watch(KEYS.killSwitches, (map) => {
    onChange({
      live_shipping: featureState(map, "live_shipping"),
      image_generator: featureState(map, "image_generator"),
      autofill: featureState(map, "autofill"),
    });
  });
}
