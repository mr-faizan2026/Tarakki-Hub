export type PricingTier = {
  id: string;
  name: string;
  tagline: string;
  /** Placeholder only — real numbers land later. Kept as strings so a "—"
   * or "Soon" placeholder is trivial to swap for a value. */
  price: {
    monthly: string;
    yearly: string;
  };
  priceNote: string;
  cta: string;
  featured?: boolean;
  features: string[];
};

/**
 * EDITABLE SCAFFOLD. Prices are placeholders and checkout is inert.
 * To go live: fill `price.monthly` / `price.yearly`, set PRICING_LIVE = true
 * in the Pricing section, and wire the CTA.
 */
export const pricingTiers: PricingTier[] = [
  {
    id: "free",
    name: "Free",
    tagline: "For getting your first templates live.",
    price: { monthly: "₹0", yearly: "₹0" },
    priceNote: "Free to start, always.",
    cta: "Start free",
    features: [
      "1-click autofill in your supplier panel",
      "Up to 3 reusable templates",
      "Smart GST / HSN / category mapping",
      "Draft & review before publishing",
      "Community support",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "For sellers listing every day.",
    price: { monthly: "—", yearly: "—" },
    priceNote: "Pricing launching soon",
    cta: "Join the waitlist",
    featured: true,
    features: [
      "Everything in Free",
      "Unlimited templates & variants",
      "Bulk CSV upload → list in bulk",
      "Reusable image library + auto-resize",
      "Low-shipping image generator",
      "Priority support in Hindi & English",
    ],
  },
  {
    id: "business",
    name: "Business",
    tagline: "For growing shops and small teams.",
    price: { monthly: "—", yearly: "—" },
    priceNote: "Pricing launching soon",
    cta: "Talk to us",
    features: [
      "Everything in Pro",
      "Higher bulk-listing limits",
      "Shared template & image library",
      "Multiple seller accounts",
      "Team roles & draft approvals",
      "Dedicated onboarding",
    ],
  },
];
