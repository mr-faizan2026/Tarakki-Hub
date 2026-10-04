import type { PanelPricingContext, TabState } from "@/lib/messages";

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  THE PANEL'S ONE NEXT-STEP LINE
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Connection status AND whatever is standing between the seller and a working
 *  panel — in one line, at the top, once.
 *
 *  ── WHY IT OWNS THE BLOCKER NOW ───────────────────────────────────────────
 *  It used to report only the handshake, so each card worked out the rest for
 *  itself. On a fresh Add Single Catalog screen that meant the shipping card
 *  said "open a product and enter its selling price…", the pricing basis said
 *  "enter your selling price in the supplier panel so its price breakdown
 *  appears…", and the generator's own blocker said "enter your selling price in
 *  the supplier panel first…" — three paragraphs of the same instruction,
 *  stacked, in a 380px column. The seller has ONE next step; this is where it
 *  is written.
 *
 *  Phrased as an instruction, not a diagnosis: "Enter your selling price" beats
 *  "pricing context not captured".
 */
export function StatusPill({
  tab,
  panel,
}: {
  tab: TabState;
  /** Only read for the two states the handshake alone can't see. */
  panel?: PanelPricingContext;
}) {
  const onMeesho = tab.meeshoTabId != null;

  let tone = "warn";
  let text = "Open your Meesho supplier panel";

  if (!onMeesho) {
    // keep the default
  } else if (!tab.contentReady) {
    text = "Connecting…";
  } else if (panel && !panel.probeInstalled) {
    // Not a nicety: without the probe nothing below can read what the panel is
    // pricing, so this is the whole panel's blocker, not one card's.
    text = "Reload this Meesho tab";
  } else if (panel && !panel.captured) {
    text = "Enter your selling price in the panel";
  } else {
    tone = "connected";
    text = "Connected";
  }

  return (
    <div className={`pill ${tone}`} role="status">
      <span className="dot" />
      <span>{text}</span>
    </div>
  );
}
