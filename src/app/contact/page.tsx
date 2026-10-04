import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/site/Nav";
import { Footer } from "@/components/site/Footer";
import { Container } from "@/components/ui/Container";
import { Icon } from "@/components/ui/Icon";
import { LEGAL } from "@/content/legal";

export const metadata: Metadata = {
  title: "Contact us",
  description:
    "Reach TarakkiHub support on WhatsApp or email for help with Meesho listing tools, credits and billing.",
};

/**
 * /contact
 *
 * ── TWO AUDIENCES, ONE PAGE ───────────────────────────────────────────────
 * A seller who needs help, and a payment aggregator's reviewer checking that a
 * real, contactable business is behind the merchant account. The first wants a
 * WhatsApp link they can tap; the second wants the legal entity written out.
 * Both are here, in that order, because the seller is the one who visits daily.
 *
 * ── WHY THERE IS NO CONTACT FORM ──────────────────────────────────────────
 * A form needs an endpoint, somewhere to deliver to, and spam handling — and it
 * would be slower for the seller than the WhatsApp number they already use for
 * everything else. Two real channels that work beat a form that silently fails.
 *
 * ── THE ADDRESS BLOCK IS CONDITIONAL, AND THAT IS DELIBERATE ──────────────
 * `LEGAL.registeredAddress` is null until the business address is supplied. An
 * empty "Registered address" heading reads worse than no heading, and inventing
 * a placeholder on a page a payment reviewer reads would be far worse than
 * either. Fill it in src/content/legal.ts and the block appears.
 */

const WHATSAPP_URL = `https://wa.me/${LEGAL.whatsappNumber}`;
const MAIL_URL = `mailto:${LEGAL.supportEmail}`;

function Channel({
  icon,
  label,
  value,
  href,
  action,
  external,
}: {
  icon: "whatsapp" | "mail";
  label: string;
  value: string;
  href: string;
  action: string;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      className="group flex flex-col gap-3 rounded-xl border border-hairline bg-surface p-6 transition-colors hover:border-teal-200 hover:bg-teal-50/40"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
        {icon === "whatsapp" ? (
          <svg
            width={20}
            height={20}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3.5 20.5l1.3-4.2A8.4 8.4 0 1 1 7.9 19.3l-4.4 1.2Z" />
            <path d="M8.9 8.2c.2-.5.4-.5.6-.5h.5c.2 0 .4 0 .6.5l.7 1.6c.1.3 0 .5-.1.7l-.4.5c-.2.2-.3.4-.1.7a6 6 0 0 0 2.8 2.4c.3.1.5 0 .7-.2l.5-.6c.2-.2.4-.2.6-.1l1.6.8c.2.1.4.2.4.4v.5c0 .9-.8 1.6-1.7 1.6a7.9 7.9 0 0 1-6.8-6.9c0-.9.6-1.7 1.4-1.9Z" />
          </svg>
        ) : (
          <Icon name="mail" size={20} />
        )}
      </span>
      <span className="label-mono text-ink-400">{label}</span>
      <span className="font-display text-h4 font-semibold tracking-[-0.015em] text-ink-900">
        {value}
      </span>
      <span className="text-small font-medium text-teal-700 group-hover:text-teal-800">
        {action} &rarr;
      </span>
    </a>
  );
}

export default function ContactPage() {
  return (
    <>
      <Nav />
      <main id="main" className="bg-canvas">
        <Container className="py-16 sm:py-20 lg:py-24">
          <div className="max-w-3xl">
            <p className="label-mono text-ink-500">Direct support</p>
            <h1 className="mt-3 font-display text-h2 font-semibold tracking-[-0.02em] text-ink-900">
              Contact us
            </h1>
            <p className="mt-4 text-lead text-ink-600">
              Questions about the Meesho tools, your credits or a payment? Message us
              on WhatsApp or send an email — both reach the same team.
            </p>

            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              <Channel
                icon="whatsapp"
                label="WhatsApp support"
                value={LEGAL.whatsapp}
                href={WHATSAPP_URL}
                action="Click to chat"
                external
              />
              <Channel
                icon="mail"
                label="Email us"
                value={LEGAL.supportEmail}
                href={MAIL_URL}
                action="Send mail"
              />
            </div>

            <p className="mt-6 text-small text-ink-500">
              We answer seller queries throughout the week. Response times vary with
              the complexity of the issue — for a billing or refund question, please
              include your order ID and registered email so we can look it up
              straight away.
            </p>

            {/* The entity, written out. A payment aggregator's onboarding review
                looks for exactly this, and sellers deserve to know who they are
                buying from. */}
            <div className="mt-14 rounded-xl border border-hairline bg-surface p-6">
              <h2 className="text-micro font-semibold uppercase tracking-[0.12em] text-ink-500">
                Business details
              </h2>
              <dl className="mt-4 grid gap-3 text-body sm:grid-cols-[auto_1fr] sm:gap-x-8">
                <dt className="text-ink-500">Legal name</dt>
                <dd className="text-ink-800">{LEGAL.legalName}</dd>

                <dt className="text-ink-500">Brand name</dt>
                <dd className="text-ink-800">{LEGAL.brandName}</dd>

                <dt className="text-ink-500">Email</dt>
                <dd>
                  <a
                    href={MAIL_URL}
                    className="font-medium text-teal-700 hover:text-teal-800"
                  >
                    {LEGAL.supportEmail}
                  </a>
                </dd>

                <dt className="text-ink-500">WhatsApp</dt>
                <dd>
                  <a
                    href={WHATSAPP_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-teal-700 hover:text-teal-800"
                  >
                    {LEGAL.whatsapp}
                  </a>
                </dd>

                {LEGAL.registeredAddress ? (
                  <>
                    <dt className="text-ink-500">Registered address</dt>
                    <dd className="whitespace-pre-line text-ink-800">
                      {LEGAL.registeredAddress}
                    </dd>
                  </>
                ) : null}
              </dl>
            </div>

            <p className="mt-8 text-small text-ink-500">
              See also our{" "}
              <Link href="/terms-and-conditions" className="text-teal-700 hover:text-teal-800">
                Terms &amp; Conditions
              </Link>
              ,{" "}
              <Link href="/refund-policy" className="text-teal-700 hover:text-teal-800">
                Refund Policy
              </Link>
              ,{" "}
              <Link href="/shipping-policy" className="text-teal-700 hover:text-teal-800">
                Delivery Policy
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="text-teal-700 hover:text-teal-800">
                Privacy Policy
              </Link>
              .
            </p>

            <p className="mt-6 rounded-lg border border-hairline bg-canvas-sunk p-4 text-small text-ink-500">
              <strong className="text-ink-800">{LEGAL.brandName} is an independent tool.</strong>{" "}
              We are not affiliated with, endorsed by or connected to Meesho. Please
              contact Meesho directly for anything concerning your marketplace
              account, orders or payouts.
            </p>
          </div>
        </Container>
      </main>
      <Footer />
    </>
  );
}
