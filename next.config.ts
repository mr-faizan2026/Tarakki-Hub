import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * ── KEEPING THE PUBLISHED SITE'S URLS ALIVE ───────────────────────────────
   * The live site serves its privacy policy at /privacy-policy, while this app
   * serves it at /privacy. That older URL is not just a stale internal link: it
   * is the address handed to the Chrome Web Store listing and typed into payment
   * onboarding forms, and those are slow and awkward to correct once submitted.
   *
   * A permanent redirect keeps every one of them working. The same applies to
   * /terms and /refund, which are the paths people guess at.
   */
  async redirects() {
    return [
      { source: "/privacy-policy", destination: "/privacy", permanent: true },
      { source: "/terms", destination: "/terms-and-conditions", permanent: true },
      { source: "/refund", destination: "/refund-policy", permanent: true },
      { source: "/shipping", destination: "/shipping-policy", permanent: true },
    ];
  },
};

export default nextConfig;
