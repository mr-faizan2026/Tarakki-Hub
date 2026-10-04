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
  title: "Terms & Conditions",
  description:
    "The terms you agree to when you use TarakkiHub — accounts, credits, the image tools, and the limits of what we promise.",
};

/**
 * /terms-and-conditions
 *
 * ── WHY THIS URL AND NOT /terms ───────────────────────────────────────────
 * It is the path the published site already uses, so anything already pointing
 * at it — a payment aggregator's onboarding form, a Web Store listing field, a
 * WhatsApp message to a seller — keeps working. A tidier path would cost a dead
 * link for no gain.
 *
 * ── THE LOW-SHIPPING CLAUSES ARE THE POINT OF THIS DOCUMENT ───────────────
 * Section 7 is the one that matters commercially. The product quotes a shipping
 * figure read live from the seller's own supplier panel, and Meesho can change
 * what it charges at any time afterwards. Saying plainly that a quote is a
 * reading and not a promise is what makes the refund policy defensible — and it
 * is the honest description of what the tool does.
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
    id: "acceptance",
    title: "1. Acceptance of terms",
    body: (
      <p>
        By accessing or using {LEGAL.brandName} (the &ldquo;Service&rdquo;,
        &ldquo;we&rdquo;, &ldquo;us&rdquo; or &ldquo;our&rdquo;), operated under the
        legal name <strong className="text-ink-800">{LEGAL.legalName}</strong>,
        including any tools, features or applications provided within it, you
        acknowledge that you have read, understood and agree to be bound by these
        Terms and Conditions (&ldquo;Terms&rdquo;). If you do not agree to these
        Terms, you must not access or use the Service.
      </p>
    ),
  },
  {
    id: "service",
    title: "2. Description of the service",
    body: (
      <>
        <p>
          {LEGAL.brandName} provides digital tools and services for online sellers,
          including but not limited to listing autofill, image generation, image
          optimisation, live shipping-rate verification and related utilities
          (collectively, the &ldquo;Service&rdquo;).
        </p>
        <p>
          We reserve the right to modify, update, suspend, restrict or discontinue
          any part of the Service, temporarily or permanently, at any time and
          without prior notice.
        </p>
      </>
    ),
  },
  {
    id: "accounts",
    title: "3. User accounts",
    body: (
      <>
        <p>
          To access certain features you may be required to create an account. You
          agree to provide accurate, current and complete information during
          registration and to keep it updated.
        </p>
        <p>
          You are solely responsible for safeguarding your account credentials and
          for all activity conducted under your account. {LEGAL.brandName} shall not
          be liable for any loss or damage arising from unauthorised access to your
          account.
        </p>
        <p>
          Certain features may require phone-number verification. By providing your
          phone number you consent to receive verification codes and service-related
          communications by SMS or WhatsApp.
        </p>
      </>
    ),
  },
  {
    id: "conduct",
    title: "4. User conduct",
    body: (
      <>
        <p>
          You agree to use the Service only for lawful purposes and in compliance
          with these Terms. You shall not:
        </p>
        <LegalList
          items={[
            "Upload, generate or distribute content that is unlawful, harmful, threatening, abusive, defamatory, obscene or otherwise objectionable.",
            "Attempt to reverse engineer, decompile, disassemble or otherwise misuse any portion of the Service.",
            "Use the Service in a way that infringes the intellectual property or other legal rights of any third party.",
            "Engage in any activity that disrupts, interferes with or harms the integrity or performance of the Service.",
          ]}
        />
        <p>
          In the event of misuse, abuse or violation of these Terms, we reserve the
          right to suspend or terminate your account, revoke credits and restrict
          access to the Service without prior notice.
        </p>
      </>
    ),
  },
  {
    id: "ip",
    title: "5. Intellectual property",
    body: (
      <>
        <p>
          The Service — including its software, design, features, functionality and
          original content — is the exclusive property of {LEGAL.brandName} and its
          licensors, and is protected by applicable intellectual property laws.
        </p>
        <p>
          You retain ownership of the content you upload. By uploading content you
          grant {LEGAL.brandName} a worldwide, non-exclusive, royalty-free licence to
          use, reproduce, modify and display that content solely for the purpose of
          providing and improving the Service.
        </p>
      </>
    ),
  },
  {
    id: "credits",
    title: "6. Credits, payments and refunds",
    body: (
      <>
        <p>
          The Service operates on a credit-based system. We may, at our discretion,
          offer free or promotional credits, which may be subject to expiry or usage
          limits.
        </p>
        <p>
          Purchased credits are final and non-refundable except as required by
          applicable law. For all refund matters, please refer to our{" "}
          <Link
            href="/refund-policy"
            className="font-medium text-teal-700 hover:text-teal-800"
          >
            Refund&nbsp;&amp;&nbsp;Cancellation Policy
          </Link>
          , which forms an integral part of these Terms.
        </p>
      </>
    ),
  },
  {
    id: "shipping-tools",
    title: "7. Low-shipping image tools — specific terms",
    body: (
      <>
        <p>
          The low-shipping image tools are offered as part of the Service and are
          subject to the following additional conditions.
        </p>
        <LegalCallout>
          <strong className="text-ink-800">
            A shipping figure shown by {LEGAL.brandName} is a reading, not a promise.
          </strong>{" "}
          Every figure is obtained live from your own supplier panel at the moment
          you ask for it. The marketplace decides what it charges, and it can change
          that at any time — including after you list.
        </LegalCallout>
        <LegalList
          items={[
            <>
              <strong className="text-ink-800">Eligibility.</strong> Low-shipping
              eligibility is determined by product category and other parameters
              defined by the marketplace. Not all categories are eligible, and no
              guarantee is given that any image will qualify for a lower shipping
              charge.
            </>,
            <>
              <strong className="text-ink-800">Rate dependency.</strong> Optimisation
              is performed against the shipping rates and criteria applicable at the
              time of use. If the marketplace modifies, updates or recalculates its
              rates at any time, {LEGAL.brandName} is not responsible for the
              resulting change in shipping cost.
            </>,
            <>
              <strong className="text-ink-800">Discrepancies.</strong> If the actual
              shipping cost shown on the marketplace differs from the figure shown in
              our application, {LEGAL.brandName} shall not be held liable for that
              difference. Where the two disagree, the marketplace&rsquo;s own figure
              is the one that applies to your order.
            </>,
            <>
              <strong className="text-ink-800">Credit usage.</strong> Credits are
              consumed as described in the Service at the point of use, regardless of
              the shipping outcome subsequently applied by the marketplace.
            </>,
          ]}
        />
      </>
    ),
  },
  {
    id: "independence",
    title: "8. Independence from marketplaces",
    body: (
      <LegalCallout>
        <strong className="text-ink-800">
          {LEGAL.brandName} is an independent tool.
        </strong>{" "}
        We are not affiliated with, authorised by, sponsored by or endorsed by
        Meesho or any of its subsidiaries, or by any other marketplace. Marketplace
        names are used only to identify which website our tools work with. We never
        ask for, read or store your marketplace username or password.
      </LegalCallout>
    ),
  },
  {
    id: "availability",
    title: "9. Availability, maintenance and errors",
    body: (
      <>
        <p>
          The Service is provided on a best-effort basis. While we aim for
          uninterrupted access, it may occasionally experience technical errors,
          delays, bugs or downtime.
        </p>
        <p>
          We reserve the right to place the Service, or any part of it, under
          maintenance, during which access may be limited or unavailable.{" "}
          {LEGAL.brandName} shall not be liable for any loss, inconvenience or damage
          arising from such interruptions.
        </p>
      </>
    ),
  },
  {
    id: "support",
    title: "10. Support and response times",
    body: (
      <p>
        Our support team will make reasonable efforts to address enquiries and
        issues. Resolution times may vary with the nature and complexity of the
        issue, and {LEGAL.brandName} does not guarantee a fixed response or
        resolution timeline. You can reach support at {mail}.
      </p>
    ),
  },
  {
    id: "termination",
    title: "11. Termination",
    body: (
      <>
        <p>
          We may terminate or suspend your account and access to the Service
          immediately, without prior notice or liability, for any reason, including a
          breach of these Terms.
        </p>
        <p>
          On termination, any unused credits may be forfeited without refund, subject
          to applicable law.
        </p>
      </>
    ),
  },
  {
    id: "warranties",
    title: "12. Disclaimer of warranties",
    body: (
      <p>
        The Service is provided on an &ldquo;as is&rdquo; and &ldquo;as
        available&rdquo; basis. {LEGAL.brandName} makes no warranties, express or
        implied, including as to merchantability, fitness for a particular purpose,
        accuracy or reliability of the Service or of any result obtained through it.
      </p>
    ),
  },
  {
    id: "liability",
    title: "13. Limitation of liability",
    body: (
      <p>
        To the maximum extent permitted by law, {LEGAL.brandName} shall not be liable
        for any indirect, incidental, special, consequential or punitive damages,
        including loss of profits, data, goodwill or business opportunity, arising
        out of or related to your use of, or inability to use, the Service.
      </p>
    ),
  },
  {
    id: "law",
    title: "14. Governing law",
    body: (
      <p>
        These Terms are governed by and construed in accordance with the laws of
        India, without regard to conflict-of-law principles.
      </p>
    ),
  },
  {
    id: "changes",
    title: "15. Changes to these terms",
    body: (
      <p>
        We may modify or replace these Terms at any time. Continued use of the
        Service after a change constitutes acceptance of the revised Terms. The date
        at the top of this page records when it last changed.
      </p>
    ),
  },
  {
    id: "contact",
    title: "16. Contact and legal entity",
    body: (
      <>
        <p>If you have any questions about these Terms, please contact us.</p>
        <LegalList
          items={[
            <>
              <strong className="text-ink-800">Legal name:</strong>{" "}
              {LEGAL.legalName}
            </>,
            <>
              <strong className="text-ink-800">Brand / business name:</strong>{" "}
              {LEGAL.brandName}
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

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms &amp; Conditions"
      lastUpdated={LEGAL_UPDATED.terms}
      intro={<>These cover the {LEGAL.brandName} website, dashboard and Chrome extension.</>}
      sections={sections}
    />
  );
}
