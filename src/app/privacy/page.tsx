import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Nav } from "@/components/site/Nav";
import { Footer } from "@/components/site/Footer";
import { Container } from "@/components/ui/Container";

export const metadata: Metadata = {
  title: "Privacy policy",
  description:
    "What TarakkiHub collects, what it never collects, and who processes it — including the Chrome extension.",
};

/**
 * /privacy — the published policy.
 *
 * ── WHY THIS PAGE IS A BLOCKER, NOT A NICE-TO-HAVE ────────────────────────
 * The Chrome Web Store requires a privacy policy at a public URL, and it requires
 * the answers in its own "Privacy practices" form to MATCH that page. A listing
 * submitted with answers no public page backs up gets rejected, or worse, pulled
 * later for a mismatch.
 *
 * So this page is not marketing copy: it is the canonical text that
 * `extension/docs/store-listing.md` is filled in from. **If you change what the
 * extension collects, change this page and that document together.** The two
 * disagreeing is the failure mode.
 *
 * ── WHAT IT DELIBERATELY SAYS OUT LOUD ────────────────────────────────────
 *   • TarakkiHub never sees a seller's MEESHO login. That is the first question
 *     every seller has and the one a vague policy loses them on.
 *   • The exact five fields a health event contains, because "we collect usage
 *     data" sounds like it could be anything, and in this case it provably is not.
 *   • That we are not Meesho.
 *
 * Dates are rendered from LAST_UPDATED rather than from `new Date()`: a policy
 * whose "last updated" moves every time the page is served is worthless as a
 * record of what a seller agreed to.
 */

/** Bump this — and nothing else about it — whenever the text below changes. */
const LAST_UPDATED = "3 October 2026";

/** The one place to change if support moves. */
const CONTACT_EMAIL = "support@tarakkihub.com";

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="font-display text-h3 font-semibold tracking-[-0.018em] text-ink-900">
        {title}
      </h2>
      <div className="mt-4 flex flex-col gap-4 text-body text-ink-600">{children}</div>
    </section>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <tr className="border-t border-hairline align-top">{children}</tr>;
}

function Cell({ children, head = false }: { children: ReactNode; head?: boolean }) {
  const Tag = head ? "th" : "td";
  return (
    <Tag
      className={
        head
          ? "py-3 pr-4 text-left text-small font-semibold text-ink-900"
          : "py-3 pr-4 text-small text-ink-600"
      }
    >
      {children}
    </Tag>
  );
}

const CONTENTS = [
  ["who-we-are", "Who we are"],
  ["meesho-login", "Your Meesho login"],
  ["what-we-collect", "What we collect"],
  ["extension", "The Chrome extension, specifically"],
  ["health", "Adapter health reports"],
  ["never", "What we never collect"],
  ["why", "Why we use it"],
  ["processors", "Who else processes it"],
  ["retention", "How long we keep it, and deleting it"],
  ["security", "Security"],
  ["children", "Children"],
  ["changes", "Changes to this policy"],
  ["contact", "Contact"],
] as const;

export default function PrivacyPage() {
  return (
    <>
      <Nav />
      <main id="main" className="bg-canvas">
        <Container className="py-16 sm:py-20 lg:py-24">
          <div className="max-w-3xl">
            <p className="label-mono text-ink-500">Legal</p>
            <h1 className="mt-3 font-display text-h2 font-semibold tracking-[-0.02em] text-ink-900">
              Privacy policy
            </h1>
            <p className="mt-4 text-body text-ink-500">
              Last updated {LAST_UPDATED}. This covers the TarakkiHub website, the
              dashboard and the TarakkiHub Chrome extension.
            </p>

            <nav
              aria-label="On this page"
              className="mt-10 rounded-xl border border-hairline bg-surface p-5"
            >
              <h2 className="text-micro font-semibold uppercase tracking-[0.12em] text-ink-500">
                On this page
              </h2>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {CONTENTS.map(([id, label]) => (
                  <li key={id}>
                    <a
                      href={`#${id}`}
                      className="text-small text-teal-700 hover:text-teal-800"
                    >
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="mt-14 flex flex-col gap-12">
              <Section id="who-we-are" title="Who we are">
                <p>
                  TarakkiHub is a set of listing tools for Meesho sellers: a web
                  dashboard and a Chrome extension that works on your own Meesho
                  supplier panel. You can reach us at{" "}
                  <a
                    href={`mailto:${CONTACT_EMAIL}`}
                    className="font-medium text-teal-700 hover:text-teal-800"
                  >
                    {CONTACT_EMAIL}
                  </a>
                  .
                </p>
                <p className="rounded-lg border border-hairline bg-canvas-sunk p-4 text-small">
                  <strong className="text-ink-800">
                    TarakkiHub is an independent tool.
                  </strong>{" "}
                  We are not affiliated with, endorsed by, sponsored by or connected
                  to Meesho. We use the name &ldquo;Meesho&rdquo; only to say which
                  website our tools work with. We do not speak for Meesho and we
                  have no special access to Meesho&rsquo;s systems — the extension
                  reads the same page you are looking at.
                </p>
              </Section>

              <Section id="meesho-login" title="Your Meesho login">
                <p className="rounded-lg border border-teal-200 bg-teal-50 p-4">
                  <strong className="text-ink-900">
                    We never ask for, read, store or send your Meesho username or
                    password.
                  </strong>{" "}
                  The extension works inside the Meesho session that is already open
                  in your own browser. There is no field in TarakkiHub where you
                  could type your Meesho password, and nothing in the extension reads
                  one.
                </p>
                <p>
                  The same is true of your bank details, UPI ID, PAN and GST
                  credentials. The extension never captures a password, bank,
                  account-number, IFSC, UPI, PAN or Aadhaar field, even if one
                  happens to be on a page it is working on.
                </p>
              </Section>

              <Section id="what-we-collect" title="What we collect">
                <p>
                  Only what the features you use actually need. In full:
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <Row>
                        <Cell head>What</Cell>
                        <Cell head>Why</Cell>
                      </Row>
                    </thead>
                    <tbody>
                      <Row>
                        <Cell>
                          <strong className="text-ink-800">Your email address</strong>
                        </Cell>
                        <Cell>
                          To create and sign you into your TarakkiHub account. We do
                          not require a name, phone number or address.
                        </Cell>
                      </Row>
                      <Row>
                        <Cell>
                          <strong className="text-ink-800">Your password</strong>
                        </Cell>
                        <Cell>
                          Sent to our authentication provider at sign-in and stored by
                          them as a hash. We never see it in plain text and the
                          extension never stores it.
                        </Cell>
                      </Row>
                      <Row>
                        <Cell>
                          <strong className="text-ink-800">
                            Listing field values you choose to save
                          </strong>
                        </Cell>
                        <Cell>
                          When you save a filled Meesho form as a reusable profile,
                          the fields you kept in the preview are stored so you can
                          fill the next listing from them. Nothing is saved unless you
                          press Save.
                        </Cell>
                      </Row>
                      <Row>
                        <Cell>
                          <strong className="text-ink-800">
                            Product images you upload
                          </strong>
                        </Cell>
                        <Cell>
                          To generate the catalog-ready versions and to ask Meesho for
                          a live shipping quote on each one.
                        </Cell>
                      </Row>
                      <Row>
                        <Cell>
                          <strong className="text-ink-800">
                            Your plan, credit balance and usage log
                          </strong>
                        </Cell>
                        <Cell>
                          To run billing and to show you where your credits went.
                        </Cell>
                      </Row>
                      <Row>
                        <Cell>
                          <strong className="text-ink-800">
                            A random id per extension install
                          </strong>
                        </Cell>
                        <Cell>
                          To enforce how many computers one account may use at a time,
                          and to let you sign a computer out. See below — it is not a
                          fingerprint.
                        </Cell>
                      </Row>
                      <Row>
                        <Cell>
                          <strong className="text-ink-800">Adapter health reports</strong>
                        </Cell>
                        <Cell>
                          To tell us when Meesho has changed its page so we can fix the
                          extension. Their exact contents are listed below.
                        </Cell>
                      </Row>
                    </tbody>
                  </table>
                </div>
              </Section>

              <Section id="extension" title="The Chrome extension, specifically">
                <p>
                  The extension only runs on{" "}
                  <strong className="text-ink-800">supplier.meesho.com</strong>. It
                  has no access to any other website and does not read your browsing
                  history.
                </p>
                <p>
                  On that site it reads two things: the shipping figure your supplier
                  panel is already showing, and the catalog form when you ask it to.
                  Page chrome — the header, navigation, search and account menus — is
                  excluded, and file, hidden and password inputs are never read at
                  all. Account, payment and order screens have no catalog form, so
                  there is nothing for it to read there.
                </p>
                <p>
                  It writes to the page only on your click: a prepared image into the
                  front-image field, or a saved profile into the form.{" "}
                  <strong className="text-ink-800">
                    It never presses Next, Save, Submit or Publish
                  </strong>{" "}
                  and never advances a step — you review and submit your own catalog
                  every time.
                </p>
                <p>
                  <strong className="text-ink-800">The install id.</strong> On first
                  install the extension generates a random id and keeps it on your own
                  computer. It contains nothing about your machine: no hardware
                  identifiers, no screen or font probing, no IP. Two accounts on one
                  computer get two unrelated ids, and it cannot be matched with
                  anything outside TarakkiHub. Clearing the extension&rsquo;s data
                  genuinely resets it.
                </p>
              </Section>

              <Section id="health" title="Adapter health reports">
                <p>
                  Meesho changes its supplier panel without notice, and when it does,
                  parts of the extension stop finding what they need. So the extension
                  reports whether each check succeeded. A report is{" "}
                  <strong className="text-ink-800">five fields</strong>:
                </p>
                <ul className="flex list-disc flex-col gap-2 pl-5 text-small">
                  <li>a feature name, such as <code>form</code>;</li>
                  <li>a check name, such as <code>field_detect</code>;</li>
                  <li>
                    the outcome — <code>ok</code>, <code>not_found</code> or{" "}
                    <code>error</code>;
                  </li>
                  <li>the extension version;</li>
                  <li>
                    the page path{" "}
                    <strong className="text-ink-800">
                      with every identifier removed
                    </strong>{" "}
                    — for example{" "}
                    <code>/panel/:id/new/catalog/:id/single</code>.
                  </li>
                </ul>
                <p>
                  A rounded count may be attached, such as &ldquo;20&ndash;29 fields
                  found&rdquo;.
                </p>
                <p className="rounded-lg border border-hairline bg-canvas-sunk p-4 text-small">
                  A health report{" "}
                  <strong className="text-ink-800">never</strong> contains a field
                  label, a field value, a product name, a price, an SKU, your shop
                  name or shop code, an image, or anything from a web address after
                  the <code>?</code>. The extension strips those before sending, our
                  server strips them again on arrival, and the database function that
                  writes the row strips them a third time.
                </p>
              </Section>

              <Section id="never" title="What we never collect">
                <ul className="flex list-disc flex-col gap-2 pl-5">
                  <li>Your Meesho username or password.</li>
                  <li>
                    Your browsing history, or anything from any website other than
                    your own Meesho supplier panel.
                  </li>
                  <li>
                    Card, bank or UPI details in the extension. Payments happen on
                    this website through a payment provider; the extension has no
                    payment screen and never sees those details.
                  </li>
                  <li>Your location.</li>
                  <li>Your contacts, messages, emails or files.</li>
                  <li>Keystrokes, screen recordings or screenshots.</li>
                </ul>
              </Section>

              <Section id="why" title="Why we use it">
                <p>
                  To run the features you are using, and nothing else: your account
                  and plan, your saved profiles, your credits, generating and quoting
                  your images, and keeping the extension working when Meesho changes
                  its page.
                </p>
                <p className="rounded-lg border border-hairline bg-canvas-sunk p-4 text-small">
                  <strong className="text-ink-800">We do not sell your data.</strong>{" "}
                  We do not transfer it to anyone for a purpose unrelated to running
                  TarakkiHub, we do not use it for advertising, and we do not use it
                  to judge creditworthiness or for lending. We do not train models on
                  your listing data.
                </p>
              </Section>

              <Section id="processors" title="Who else processes it">
                <p>
                  We use a small number of service providers to run TarakkiHub. They
                  process data on our instructions only:
                </p>
                <ul className="flex list-disc flex-col gap-2 pl-5">
                  <li>
                    <strong className="text-ink-800">Supabase</strong> — database,
                    authentication and file storage.
                  </li>
                  <li>
                    <strong className="text-ink-800">Vercel</strong> — hosting for
                    this website and the dashboard.
                  </li>
                  <li>
                    <strong className="text-ink-800">Cashfree</strong> — payments,
                    once billing is live. Card and bank details go to them directly
                    and are never stored by us.
                  </li>
                </ul>
                <p>
                  Separately, when you use the image tool the extension sends your
                  image to <strong className="text-ink-800">Meesho</strong>, from your
                  own account, to get their live shipping quote. That is the same
                  request your supplier panel makes when you upload a photo yourself;
                  it is how the figure can be real rather than an estimate.
                </p>
              </Section>

              <Section id="retention" title="How long we keep it, and deleting it">
                <ul className="flex list-disc flex-col gap-2 pl-5">
                  <li>
                    Account data and saved profiles are kept while your account
                    exists.
                  </li>
                  <li>
                    Deleting a profile deletes its stored field values immediately.
                  </li>
                  <li>
                    Signing a computer out removes its access; the install id row is
                    kept marked as signed out so that computer gets a clear message.
                  </li>
                  <li>
                    Health reports are operational data and are trimmed periodically.
                  </li>
                  <li>
                    Billing records are kept as long as Indian tax and accounting law
                    requires.
                  </li>
                </ul>
                <p>
                  To delete your account and everything in it, email us at{" "}
                  <a
                    href={`mailto:${CONTACT_EMAIL}`}
                    className="font-medium text-teal-700 hover:text-teal-800"
                  >
                    {CONTACT_EMAIL}
                  </a>{" "}
                  from the address on the account. You can also ask us for a copy of
                  your data, or for a correction.
                </p>
              </Section>

              <Section id="security" title="Security">
                <p>
                  Every table is protected by row-level security, so one account
                  cannot read another&rsquo;s rows — this is enforced by the database
                  itself, not by our application code. Privileged operations run only
                  on our server; the extension ships with a public key that grants it
                  nothing beyond your own data.
                </p>
                <p>
                  The extension loads no remote code. Everything it runs is in the
                  package Chrome installed. It does fetch a configuration of page
                  selectors from us so we can fix the extension when Meesho changes
                  its page, and that configuration is data — it is checked against a
                  strict schema and used only to find elements on the page. It is
                  never executed.
                </p>
              </Section>

              <Section id="children" title="Children">
                <p>
                  TarakkiHub is a business tool and is not intended for anyone under
                  18. We do not knowingly collect data from children.
                </p>
              </Section>

              <Section id="changes" title="Changes to this policy">
                <p>
                  If we change what we collect or why, we will update this page and
                  the date at the top, and — for anything material — tell you in the
                  dashboard before it takes effect.
                </p>
              </Section>

              <Section id="contact" title="Contact">
                <p>
                  Questions, a data request, or something here that does not match
                  what you have seen the product do:{" "}
                  <a
                    href={`mailto:${CONTACT_EMAIL}`}
                    className="font-medium text-teal-700 hover:text-teal-800"
                  >
                    {CONTACT_EMAIL}
                  </a>
                  . We would rather hear about a discrepancy than have it stand.
                </p>
                <p className="text-small">
                  <Link href="/" className="font-medium text-teal-700 hover:text-teal-800">
                    ← Back to tarakkihub.com
                  </Link>
                </p>
              </Section>
            </div>
          </div>
        </Container>
      </main>
      <Footer />
    </>
  );
}
