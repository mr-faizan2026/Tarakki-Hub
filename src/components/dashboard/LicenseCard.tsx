import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { Badge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/format";
import type { AccessStatus } from "@/lib/account";

/**
 * What a paid pack actually unlocks.
 *
 * ── WHAT THIS CARD USED TO SAY, AND WHY IT WAS WRONG TWICE ────────────────
 * "An active subscription keeps the Chrome extension unlocked once paid plans
 * launch." Two false claims in one sentence:
 *
 *   1. There are no subscriptions. The product sells one-time credit packs, and
 *      paid plans have launched.
 *   2. The extension is NOT gated. Its image tools run on a free account using
 *      the seller's starter credits — only LISTING AUTOFILL is paid-only (see
 *      has_active_plan() in 0005_billing.sql and LockedAutofill in the panel).
 *
 * Telling a free seller the extension is locked is telling them not to install
 * the thing the whole product is. So the card now names the one feature a pack
 * actually unlocks, and says when it lapses.
 */
export function LicenseCard({ access }: { access: AccessStatus }) {
  return (
    <div className="rounded-xl border border-hairline bg-surface p-5 shadow-[0_1px_0_0_rgba(14,33,49,0.03)] sm:p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span
            className={
              access.paid
                ? "flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50 text-teal-600 ring-1 ring-inset ring-teal-100"
                : "flex h-9 w-9 items-center justify-center rounded-lg bg-canvas-sunk text-ink-500"
            }
          >
            <Icon name="shield" size={19} />
          </span>
          <h3 className="font-display text-h4 font-semibold text-ink-900">
            Listing autofill
          </h3>
        </div>
        <Badge tone={access.paid ? "teal" : "outline"}>
          {access.paid ? "Unlocked" : "Locked"}
        </Badge>
      </div>

      <p className="mt-3 text-small leading-relaxed text-ink-600">
        {access.paid ? (
          <>
            Autofill is unlocked in the Chrome extension
            {access.until ? <> until {formatDate(access.until)}</> : null}. Save a
            filled Meesho form once and reuse it on every listing.
          </>
        ) : (
          <>
            Your image tools work on the free plan with your starter credits. Buy
            any credit pack to also unlock listing autofill — it costs no credits
            to use.
          </>
        )}
      </p>

      <Link
        href="/dashboard/billing"
        className="mt-4 inline-flex items-center gap-1 text-small font-medium text-teal-700 hover:text-teal-800"
      >
        {access.paid ? "Buy more credits" : "See credit packs"}
        <Icon name="chevronRight" size={14} />
      </Link>
    </div>
  );
}
