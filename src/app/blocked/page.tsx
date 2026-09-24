import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { Icon } from "@/components/ui/Icon";

export const metadata: Metadata = {
  title: "Account suspended",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Public notice shown to a blocked account. Both loadAccount() (dashboard) and
 * requireAdmin() (admin) redirect here, and the credit-spend DB functions
 * refuse blocked users, so there's nothing to do here but sign out or ask for
 * help. Intentionally not gated by the proxy.
 */
export default function BlockedPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-5 py-12">
      <div className="w-full max-w-md">
        <Link
          href="/"
          aria-label="Tarakki Hub home"
          className="inline-flex rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-600"
        >
          <Logo variant="full" size={28} />
        </Link>

        <div className="mt-8 rounded-2xl border border-hairline bg-surface p-7 shadow-panel sm:p-8">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/12 text-amber-600 ring-1 ring-inset ring-amber-500/20">
            <Icon name="shield" size={24} />
          </span>
          <h1 className="mt-5 font-display text-h3 font-semibold text-ink-900">
            Your account is suspended
          </h1>
          <p className="mt-3 text-body text-ink-500">
            Access to the Tarakki Hub dashboard and Chrome extension has been
            paused for this account. If you think this is a mistake, reach out
            to support and we&apos;ll take a look.
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <a
              href="mailto:support@tarakkihub.com"
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-teal-500 px-5 text-small font-medium text-white shadow-[0_1px_0_0_rgba(11,124,109,0.9),0_10px_24px_-14px_rgba(15,156,136,0.9)] transition-colors hover:bg-teal-600"
            >
              <Icon name="shield" size={16} />
              Contact support
            </a>
            <form action="/auth/signout" method="post" className="flex-1">
              <button
                type="submit"
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-hairline-strong bg-surface px-5 text-small font-medium text-ink-800 transition-colors hover:border-ink-300"
              >
                <Icon name="logout" size={16} />
                Sign out
              </button>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
