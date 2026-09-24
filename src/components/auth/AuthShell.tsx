import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { Icon } from "@/components/ui/Icon";

const POINTS = [
  "Save a listing template once — reuse it on every catalog.",
  "Frame product photos to marketplace sizes in a click.",
  "Your credits, templates, and exports, all in one place.",
];

/** Editorial brand panel shown beside the auth form on large screens. */
function BrandPanel() {
  return (
    <div className="relative hidden overflow-hidden bg-ink-900 text-white lg:block">
      <div aria-hidden className="wash-ink absolute inset-0" />
      <div aria-hidden className="bg-dotgrid-tight absolute inset-0 opacity-[0.5]" />
      <div className="relative flex h-full flex-col justify-between p-12 xl:p-16">
        <Link
          href="/"
          aria-label="Tarakki Hub home"
          className="w-fit rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-400"
        >
          <Logo variant="full" onDark size={30} />
        </Link>

        <div className="max-w-md">
          <p className="font-serif text-lead italic text-teal-200">
            Your listing workspace
          </p>
          <h2 className="mt-4 font-display text-h2 font-semibold leading-[1.05] text-white">
            List your catalog in seconds, not hours.
          </h2>
          <ul className="mt-8 flex flex-col gap-4">
            {POINTS.map((point) => (
              <li key={point} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-500/15 text-teal-300 ring-1 ring-inset ring-teal-400/25">
                  <Icon name="check" size={14} />
                </span>
                <span className="text-body text-ink-100">{point}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-small text-ink-300">
          Built for Indian sellers. No password sharing, ever.
        </p>
      </div>
    </div>
  );
}

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <BrandPanel />

      <main className="flex flex-col px-5 py-8 sm:px-8 lg:px-12">
        {/* Mobile-only logo (brand panel is hidden below lg) */}
        <div className="lg:hidden">
          <Link
            href="/"
            aria-label="Tarakki Hub home"
            className="inline-flex rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-600"
          >
            <Logo variant="full" size={28} />
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[26rem]">
            <div className="mb-7">
              <h1 className="font-display text-h2 font-semibold tracking-[-0.02em] text-ink-900">
                {title}
              </h1>
              {subtitle ? (
                <p className="mt-2 text-body text-ink-500">{subtitle}</p>
              ) : null}
            </div>
            {children}
            {footer ? (
              <div className="mt-7 border-t border-hairline pt-6 text-small text-ink-500">
                {footer}
              </div>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}
