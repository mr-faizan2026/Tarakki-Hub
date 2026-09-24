import { Container } from "@/components/ui/Container";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/cn";

const columns: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "How it works", href: "#how" },
      { label: "Features", href: "#features" },
      { label: "One-click autofill", href: "#autofill" },
      { label: "Image generator", href: "#images" },
      { label: "Pricing", href: "#pricing" },
    ],
  },
  {
    title: "Free tools",
    links: [
      { label: "Image resizer", href: "/signup" },
      { label: "GST / HSN lookup", href: "/signup" },
      { label: "CSV template maker", href: "/signup" },
      { label: "Listing checklist", href: "/signup" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "#" },
      { label: "Blog", href: "#" },
      { label: "Careers", href: "#" },
      { label: "Contact", href: "#" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "#" },
      { label: "Terms", href: "#" },
      { label: "Refund policy", href: "#" },
    ],
  },
];

const socials: { label: string; href: string; path: React.ReactNode }[] = [
  {
    label: "Instagram",
    href: "#",
    path: (
      <>
        <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17" cy="7" r="1.1" fill="currentColor" stroke="none" />
      </>
    ),
  },
  {
    label: "YouTube",
    href: "#",
    path: (
      <>
        <rect x="2.5" y="5.5" width="19" height="13" rx="4" />
        <path d="M10 9.2 15 12l-5 2.8z" fill="currentColor" stroke="none" />
      </>
    ),
  },
  {
    label: "WhatsApp",
    href: "#",
    path: (
      <path d="M4 20l1.3-3.6A7.5 7.5 0 1 1 8 19.2L4 20Zm5-9.5c0 3 4.5 5.7 6.2 4.2.7-.6.2-1.3-.3-1.7-.4-.3-1-.7-1.6-.2-.4.4-.8.2-1.2-.1-.6-.4-1.2-1-1.5-1.7-.2-.4-.2-.7.1-1 .4-.4.3-.9.1-1.4-.2-.6-.6-1.3-1.3-1.1-.9.2-1.2 1.3-1.2 2.7z" />
    ),
  },
  {
    label: "X",
    href: "#",
    path: <path d="M4 4l16 16M20 4L4 20" strokeLinecap="round" />,
  },
];

function SocialIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      {children}
    </svg>
  );
}

export function Footer() {
  return (
    <footer className="bg-ink-900 text-ink-300">
      <Container className="py-16 sm:py-20">
        <div className="grid grid-cols-2 gap-x-6 gap-y-12 sm:grid-cols-3 lg:grid-cols-12 lg:gap-8">
          {/* Brand + updates */}
          <div className="col-span-2 sm:col-span-3 lg:col-span-4">
            <Logo onDark />
            <p className="mt-4 max-w-xs text-small text-ink-400">
              The fastest way to build listings and cut shipping cost. Built for
              Meesho sellers who&apos;d rather grow than re-type.
            </p>

            {/* launch updates (waitlist scaffold — wire up later) */}
            <div className="mt-6 max-w-xs">
              <label
                htmlFor="footer-email"
                className="text-micro font-medium uppercase tracking-[0.1em] text-ink-400"
              >
                Get launch updates
              </label>
              <div className="mt-2 flex items-center gap-2">
                <input
                  id="footer-email"
                  type="email"
                  inputMode="email"
                  placeholder="you@shop.in"
                  className="h-10 min-w-0 flex-1 rounded-md border border-white/12 bg-white/5 px-3 text-small text-white placeholder:text-ink-400 focus-visible:border-teal-500 focus-visible:outline-none"
                />
                <button
                  type="button"
                  className="h-10 shrink-0 rounded-md bg-teal-500 px-3.5 text-small font-medium text-white transition-colors hover:bg-teal-600"
                >
                  Notify me
                </button>
              </div>
            </div>
          </div>

          {/* Link columns */}
          {columns.map((col) => (
            <nav key={col.title} className="lg:col-span-2" aria-label={col.title}>
              <h3 className="text-micro font-semibold uppercase tracking-[0.12em] text-ink-400">
                {col.title}
              </h3>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      className="text-small text-ink-200 transition-colors hover:text-white"
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-14 flex flex-col gap-6 border-t border-white/10 pt-6 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/12 px-3 py-1 text-micro font-medium text-ink-200">
              <span className="flex h-2.5 w-4 overflow-hidden rounded-[2px]" aria-hidden>
                <span className="h-full w-1/3 bg-[#FF9933]" />
                <span className="h-full w-1/3 bg-white" />
                <span className="h-full w-1/3 bg-[#138808]" />
              </span>
              Made for Indian sellers
            </span>
            <span className="label-mono text-ink-400">
              Ecommerce. Growth. Freedom.
            </span>
          </div>

          <div className="flex items-center gap-2">
            {socials.map((s) => (
              <a
                key={s.label}
                href={s.href}
                aria-label={s.label}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-md border border-white/10 text-ink-300 transition-colors hover:border-teal-600 hover:text-white",
                )}
              >
                <SocialIcon>{s.path}</SocialIcon>
              </a>
            ))}
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-2 text-micro text-ink-400 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Tarakki Hub. All rights reserved.</p>
          <p className="max-w-md sm:text-right">
            Tarakki Hub is an independent tool and is not affiliated with,
            endorsed by, or sponsored by Meesho.
          </p>
        </div>
      </Container>
    </footer>
  );
}
