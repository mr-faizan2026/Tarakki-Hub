/**
 * ════════════════════════════════════════════════════════════════════════════
 *  THE BUSINESS IDENTITY — ONE SOURCE, BECAUSE A PAYMENT GATEWAY CHECKS IT
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  The legal name, brand name and support contacts appear on four published
 *  pages (terms, refund, shipping, contact) and inside the privacy policy. A
 *  payment aggregator's onboarding review reads all of them and expects the same
 *  entity on each — a mismatch between "Mohd Faizan" on one page and something
 *  else on another is the kind of thing that stalls a KYC for a week.
 *
 *  So they live here, once. Change the entity here and every page follows.
 *
 *  ── WHAT IS STILL MISSING, AND WHY IT MATTERS ─────────────────────────────
 *  `REGISTERED_ADDRESS` is null. Indian payment aggregators (Cashfree, Razorpay)
 *  require a registered business address published on the site before they will
 *  activate a live merchant account — it is an RBI requirement on the aggregator,
 *  not a preference, so there is no talking them out of it. Fill it in and the
 *  contact page renders it automatically; leave it null and the page simply omits
 *  the block rather than printing an empty heading.
 */

export const LEGAL = {
  /** The individual or company that is actually party to the contract. */
  legalName: "Mohd Faizan",
  /** The trading name sellers know. */
  brandName: "Tarakki Hub",
  supportEmail: "tarakkihub.com@gmail.com",
  /** Display form; `whatsappNumber` is the E.164 form wa.me needs. */
  whatsapp: "+91 8076 961 072",
  whatsappNumber: "918076961072",
  website: "https://www.tarakkihub.com",
  /** TODO — required before a live payment gateway can be activated. */
  registeredAddress: null as string | null,
} as const;

/**
 * Each policy's own date, not a shared one.
 *
 * A "last updated" that moves whenever any page changes is useless as a record
 * of what a seller agreed to, and three pages claiming to have changed on the
 * same day when only one did is worse than no date at all. Bump the one you
 * edited.
 */
export const LEGAL_UPDATED = {
  terms: "1 August 2026",
  refund: "1 August 2026",
  shipping: "4 October 2026",
} as const;
