export type Faq = {
  q: string;
  a: string;
};

/** Genuine questions a first-time Meesho seller actually asks. */
export const faqs: Faq[] = [
  {
    q: "Is it safe for my Meesho account?",
    a: "Yes. Tarakki Hub works inside your supplier panel like a helper on top of it — we never ask for your password and nothing publishes on its own. Every listing goes to a draft first, so you review and hit publish yourself. Aapka account, aapke haath mein.",
  },
  {
    q: "Does it work with my GST and HSN codes?",
    a: "It does. Category, HSN, GST rate, fabric and the other Meesho fields are mapped automatically from your template. You set them once; after that they fill in correctly every time. You can always override a field before publishing.",
  },
  {
    q: "I'm not technical. Can I still use it?",
    a: "That's exactly who we built it for. Most sellers are set up in under 20 minutes. Save one listing as a template, then it's a single click per catalog. Support is available in Hindi and English if you get stuck.",
  },
  {
    q: "Will it work for all my product categories?",
    a: "Tarakki Hub is built for Meesho sellers for now, and it works across categories — apparel, home, kitchen, accessories and more. Make a template per category and reuse it. Variants like size, colour and price are handled without redoing the whole listing.",
  },
  {
    q: "How does the low-shipping image generator actually help?",
    a: "Meesho calculates shipping partly from image and packaging signals. The generator produces clean, spec-correct product images tuned to keep your shipping band low — which lowers cost per order. You review every image before it goes live.",
  },
  {
    q: "Can I upload my existing catalog in bulk?",
    a: "Yes. Export or prepare a CSV, match it to a template, and Tarakki Hub lists in bulk — then holds everything as drafts for a final review. Hundreds of catalogs in one sitting is normal.",
  },
  {
    q: "What does it cost?",
    a: "Pricing is launching soon. There will be a genuinely useful free plan to start, plus paid tiers for sellers running higher volume. Add the extension now and you'll be first to know when plans go live.",
  },
  {
    q: "What if a listing looks wrong after autofill?",
    a: "Nothing publishes without you. Autofill fills the draft, you check it, fix the one variant that's different, then publish. Human-in-the-loop is the default, not an option you have to turn on.",
  },
];
