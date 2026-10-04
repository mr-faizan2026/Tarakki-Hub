import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL, LEGAL_UPDATED } from "@/content/legal";
import {
  LegalCallout,
  LegalList,
  LegalPage,
  type LegalSection,
} from "@/components/site/LegalPage";

export const metadata: Metadata = {
  title: "Delivery Policy",
  description:
    "TarakkiHub is a digital service — how and when access and credits are delivered after payment.",
};

/**
 * /shipping-policy
 *
 * ── WHY A SOFTWARE PRODUCT PUBLISHES A "SHIPPING" POLICY ──────────────────
 * Because the payment aggregator's onboarding checklist asks for one by that
 * name, and an absent page stalls the review. The honest content is short: there
 * is nothing to ship, delivery is instant and electronic, and here is what to do
 * if it does not arrive. Saying that plainly satisfies the requirement and is
 * more useful to a buyer than a page of courier language copied from a goods
 * merchant.
 *
 * It is titled "Delivery Policy" for the reader and reachable at
 * /shipping-policy for the form. Both audiences get what they came for.
 *
 * ── THE ONE CLAUSE WORTH READING TWICE ────────────────────────────────────
 * "Shipping" means two different things on this site: what the buyer pays us
 * (nothing — it is software) and the marketplace shipping charge the tools help
 * reduce. Not separating them would be genuinely confusing on a page a buyer
 * reads right before paying, so §4 does it explicitly.
 */

const mail = (
  <a
    href={`mailto:${LEGAL.supportEmail}`}
    className="font-medium text-teal-700 hover:text-teal-800"
  >
    {LEGAL.supportEmail}
  </a>
);

const sections: LegalSection[] = [
  {
    id: "digital",
    title: "1. A digital service — nothing is shipped",
    body: (
      <>
        <LegalCallout>
          <strong className="text-ink-800">
            {LEGAL.brandName} sells software, not goods.
          </strong>{" "}
          Nothing is posted, couriered or physically delivered, and no shipping or
          handling fee is ever charged by us.
        </LegalCallout>
        <p>
          Every purchase is for access to an online service and to credits used
          inside it. There is no physical product, so no delivery address is
          required and no tracking number exists.
        </p>
      </>
    ),
  },
  {
    id: "delivery",
    title: "2. How and when delivery happens",
    body: (
      <>
        <p>
          Delivery is electronic and immediate. On successful payment:
        </p>
        <LegalList
          items={[
            "Credits are added to your TarakkiHub account automatically, usually within a few seconds.",
            "The purchased features become available in the dashboard and in the Chrome extension as soon as you reload them.",
            "A confirmation is sent to the email address registered with your account.",
          ]}
        />
        <p>
          Nothing needs to be collected, activated or installed separately for the
          credits to work.
        </p>
      </>
    ),
  },
  {
    id: "delay",
    title: "3. If credits do not appear",
    body: (
      <>
        <p>
          Occasionally a bank or payment gateway confirms a payment more slowly than
          usual. If your credits have not appeared:
        </p>
        <LegalList
          items={[
            "Sign out and sign in again, or reload the dashboard — the balance is read fresh each time.",
            "Allow up to 30 minutes for a delayed gateway confirmation.",
            <>
              If they are still missing, email {mail} with your order ID, registered
              email address and payment reference. We will trace the payment and
              credit the account manually.
            </>,
          ]}
        />
        <p>
          A payment that was taken but never delivered is always made good — either
          by crediting the account or by refunding it.
        </p>
      </>
    ),
  },
  {
    id: "marketplace",
    title: "4. “Shipping” means something else in the product",
    body: (
      <>
        <p>
          The word appears on this site in two unrelated senses, and it is worth
          separating them:
        </p>
        <LegalList
          items={[
            <>
              <strong className="text-ink-800">
                Shipping you pay {LEGAL.brandName}:
              </strong>{" "}
              none. The service is digital and carries no delivery charge.
            </>,
            <>
              <strong className="text-ink-800">
                The marketplace shipping charge:
              </strong>{" "}
              the fee a marketplace such as Meesho applies to your own orders. Our
              tools read that figure live from your supplier panel and help you find
              a product image that is quoted a lower one. That charge is set and
              collected by the marketplace, never by us.
            </>,
          ]}
        />
        <p>
          What a marketplace ultimately charges on an order is its decision and can
          change at any time. See clause 7 of our{" "}
          <Link
            href="/terms-and-conditions#shipping-tools"
            className="font-medium text-teal-700 hover:text-teal-800"
          >
            Terms &amp; Conditions
          </Link>
          .
        </p>
      </>
    ),
  },
  {
    id: "international",
    title: "5. Availability",
    body: (
      <p>
        The service is delivered over the internet and can be used anywhere it is
        lawful to do so. Payments are processed in Indian Rupees (INR). Your bank or
        card issuer may apply its own conversion or international transaction charge,
        which is outside our control.
      </p>
    ),
  },
  {
    id: "contact",
    title: "6. Contact",
    body: (
      <>
        <p>Questions about delivery of a purchase:</p>
        <LegalList
          items={[
            <>
              <strong className="text-ink-800">Legal name:</strong>{" "}
              {LEGAL.legalName}
            </>,
            <>
              <strong className="text-ink-800">Brand name:</strong> {LEGAL.brandName}
            </>,
            <>
              <strong className="text-ink-800">Email:</strong> {mail}
            </>,
            <>
              <strong className="text-ink-800">WhatsApp:</strong> {LEGAL.whatsapp}
            </>,
          ]}
        />
      </>
    ),
  },
];

export default function ShippingPolicyPage() {
  return (
    <LegalPage
      title="Delivery Policy"
      lastUpdated={LEGAL_UPDATED.shipping}
      intro={
        <>
          {LEGAL.brandName} is a digital service. See also our{" "}
          <Link
            href="/refund-policy"
            className="font-medium text-teal-700 hover:text-teal-800"
          >
            Refund &amp; Cancellation Policy
          </Link>
          .
        </>
      }
      sections={sections}
    />
  );
}
