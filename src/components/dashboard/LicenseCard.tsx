import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { Badge } from "@/components/ui/Badge";
import { titleCase } from "@/lib/format";

/**
 * Subscription / license status. An active (paid) subscription is what unlocks
 * the Chrome extension where the seller tools live. Free accounts still get
 * their starter credits, but see a nudge to upgrade.
 */
export function LicenseCard({
  plan,
  active,
}: {
  plan: string;
  active: boolean;
}) {
  return (
    <div className="rounded-xl border border-hairline bg-surface p-5 shadow-[0_1px_0_0_rgba(14,33,49,0.03)] sm:p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span
            className={
              active
                ? "flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50 text-teal-600 ring-1 ring-inset ring-teal-100"
                : "flex h-9 w-9 items-center justify-center rounded-lg bg-canvas-sunk text-ink-500"
            }
          >
            <Icon name="shield" size={19} />
          </span>
          <h3 className="font-display text-h4 font-semibold text-ink-900">
            Extension license
          </h3>
        </div>
        <Badge tone={active ? "teal" : "outline"}>
          {active ? "Active" : titleCase(plan)}
        </Badge>
      </div>

      <p className="mt-3 text-small leading-relaxed text-ink-600">
        {active ? (
          <>
            Your {titleCase(plan)} subscription is active — the Chrome extension
            is unlocked on this account.
          </>
        ) : (
          <>
            You&apos;re on the {titleCase(plan)} plan. An active subscription
            keeps the Chrome extension unlocked once paid plans launch.
          </>
        )}
      </p>

      <Link
        href="/dashboard/billing"
        className="mt-4 inline-flex items-center gap-1 text-small font-medium text-teal-700 hover:text-teal-800"
      >
        {active ? "Manage subscription" : "See plans"}
        <Icon name="chevronRight" size={14} />
      </Link>
    </div>
  );
}
