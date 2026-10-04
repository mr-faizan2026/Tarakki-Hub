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
  title: "Refund & Cancellation Policy",
  description:
    "When a TarakkiHub purchase can be refunded, how to request it, and how long it takes.",
};

/**
 * /refund-policy
 *
 * ── THIS PAGE IS A PAYMENT-GATEWAY PREREQUISITE ───────────────────────────
 * An Indian payment aggregator will not activate a live merchant account
 * without a published refund and cancellation policy. It is checked against the
 * live site during onboarding, so it has to be reachable, specific and consistent
 * with the terms. A vague "contact us for refunds" fails that review.
 *
 * ── THE 48-HOUR CLOCK, STATED CAREFULLY ───────────────────────────────────
 * The window governs when a seller must ASK, not how long we may take to answer.
 * Conflating the two creates an obvious unfairness — a request made in good time
 * could expire while it sits in our queue — so §1 and §4 say so explicitly. That
 * separation is also what makes the window defensible if it is ever challenged.
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
    id: "eligibility",
    title: "1. Refund eligibility period",
    body: (
      <>
        <LegalCallout>
          <strong className="text-ink-800">
            You may submit a refund request within 48 hours of purchase.
          </strong>{" "}
          That window applies to <em>submitting</em> the request only.
        </LegalCallout>
        <p>
          The time our support or technical team needs to review, assess, verify or
          investigate a request is <strong>not</strong> counted against your 48-hour
          window. A request sent in time stays eligible however long we take to
          answer it.
        </p>
        <p>
          Requests submitted after the 48-hour period has expired are not eligible
          for consideration, except where required by applicable Indian law.
        </p>
      </>
    ),
  },
  {
    id: "nature",
    title: "2. Nature of the service",
    body: (
      <>
        <p>
          {LEGAL.brandName} is a Software-as-a-Service platform. We do not sell or
          ship physical goods. Access to digital tools and credits is granted
          immediately on successful payment.
        </p>
        <p>
          In line with Indian consumer protection law, refunds for digital services
          are assessed with regard to service usage, access and consumption. See our{" "}
          <Link
            href="/shipping-policy"
            className="font-medium text-teal-700 hover:text-teal-800"
          >
            Delivery Policy
          </Link>{" "}
          for how and when access is delivered.
        </p>
      </>
    ),
  },
  {
    id: "how",
    title: "3. How to request a refund",
    body: (
      <>
        <p>
          Email {mail} within the 48-hour window with accurate transaction details:
        </p>
        <LegalList
          items={[
            "Your order ID",
            "The email address registered with your account",
            "The payment reference from your bank or payment provider",
          ]}
        />
        <p>
          All requests are reviewed and handled in a fair, reasonable and transparent
          manner.
        </p>
      </>
    ),
  },
  {
    id: "processing",
    title: "4. Review, assessment and processing time",
    body: (
      <>
        <p>Once a valid request is received:</p>
        <LegalList
          items={[
            "Our support and technical teams may take the time reasonably required to assess and verify the request.",
            "The length of that assessment does not affect your eligibility and is not counted toward the 48-hour submission window.",
            "Approval or rejection is communicated to you by email.",
            <>
              If approved, the refund is processed to the{" "}
              <strong className="text-ink-800">original payment method</strong>{" "}
              within <strong className="text-ink-800">5–7 business days</strong>,
              subject to bank and payment-gateway timelines.
            </>,
          ]}
        />
        <p>
          {LEGAL.brandName} is not liable for delays caused by third-party payment
          processors or financial institutions.
        </p>
      </>
    ),
  },
  {
    id: "late",
    title: "5. Late or missing refunds",
    body: (
      <>
        <p>If an approved refund has not reached you:</p>
        <LegalList
          items={[
            "Check your bank account or payment method again — settlement can lag the approval.",
            "Contact your card issuer or payment provider.",
            "Contact your bank for further clarification.",
          ]}
        />
        <p>If it still has not arrived, write to us at {mail} and we will chase it.</p>
      </>
    ),
  },
  {
    id: "cancellation",
    title: "6. Cancellation policy",
    body: (
      <>
        <p>
          You may cancel a recurring plan at any time. Cancellation takes effect at
          the end of the current billing cycle, and you keep access until then.
        </p>
        <p>
          No prorated or partial refunds are issued for unused periods. A refund
          following cancellation is considered only where both the cancellation and
          the refund request fall within the 48-hour window, subject to usage.
        </p>
      </>
    ),
  },
  {
    id: "non-refundable",
    title: "7. Non-refundable scenarios",
    body: (
      <>
        <p>
          Except where mandated by Indian law, refunds are not provided where:
        </p>
        <LegalList
          items={[
            "The request was submitted after the 48-hour window.",
            "The credits or services have been fully or partially used.",
            "The credits were free, bonus or promotional.",
            "The dissatisfaction arises from a change or action by a third-party platform — for example a marketplace altering its shipping rates after you listed.",
            "The account was suspended or terminated for a violation of the Terms & Conditions.",
          ]}
        />
      </>
    ),
  },
  {
    id: "grievance",
    title: "8. Consumer rights and grievance redressal",
    body: (
      <>
        <p>
          Nothing in this policy limits or waives the statutory rights available to
          you as a consumer under Indian law.
        </p>
        <p>For refund grievances or merchant enquiries, contact:</p>
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
        <p>
          We make reasonable efforts to resolve grievances within a reasonable time,
          in accordance with applicable consumer-protection regulations.
        </p>
      </>
    ),
  },
  {
    id: "updates",
    title: "9. Policy updates",
    body: (
      <p>
        {LEGAL.brandName} may amend or update this policy at any time. Changes take
        effect on publication on this page, and the date at the top records when that
        last happened.
      </p>
    ),
  },
];

export default function RefundPolicyPage() {
  return (
    <LegalPage
      title="Refund &amp; Cancellation Policy"
      lastUpdated={LEGAL_UPDATED.refund}
      intro={
        <>
          This policy forms part of our{" "}
          <Link
            href="/terms-and-conditions"
            className="font-medium text-teal-700 hover:text-teal-800"
          >
            Terms &amp; Conditions
          </Link>
          .
        </>
      }
      sections={sections}
    />
  );
}
