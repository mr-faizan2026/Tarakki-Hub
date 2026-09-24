"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/ui/Logo";
import { Icon } from "@/components/ui/Icon";
import { CreditMeter } from "@/components/dashboard/CreditMeter";
import { SignOutForm } from "@/components/dashboard/SignOutForm";
import { NAV_ITEMS } from "@/lib/dashboard-nav";
import { titleCase } from "@/lib/format";
import { cn } from "@/lib/cn";

type Props = {
  plan: string;
  isAdmin?: boolean;
  creditsRemaining: number;
  creditsTotal: number;
  /** Close the mobile drawer on navigation. */
  onNavigate?: () => void;
};

export function SidebarContent({
  plan,
  isAdmin = false,
  creditsRemaining,
  creditsTotal,
  onNavigate,
}: Props) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          aria-label="Tarakki Hub dashboard"
          className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-600"
        >
          <Logo size={28} />
        </Link>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative flex h-11 items-center gap-3 rounded-lg px-3 text-small font-medium transition-colors",
                active
                  ? "bg-teal-50 text-ink-900 ring-1 ring-inset ring-teal-100"
                  : "text-ink-600 hover:bg-canvas-sunk hover:text-ink-900",
              )}
            >
              {active ? (
                <span
                  aria-hidden
                  className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-teal-500"
                />
              ) : null}
              <Icon
                name={item.icon}
                size={20}
                className={active ? "text-teal-600" : "text-ink-400 group-hover:text-ink-600"}
              />
              {item.label}
            </Link>
          );
        })}

        {isAdmin ? (
          <Link
            href="/admin"
            onClick={onNavigate}
            className="group mt-1 flex h-11 items-center gap-3 rounded-lg border border-hairline bg-canvas-sunk/50 px-3 text-small font-medium text-ink-700 transition-colors hover:border-teal-300 hover:text-ink-900"
          >
            <Icon
              name="shield"
              size={20}
              className="text-ink-400 group-hover:text-teal-600"
            />
            Admin panel
          </Link>
        ) : null}
      </nav>

      <div className="mt-auto px-3 pb-3">
        <div className="rounded-xl border border-hairline bg-canvas-sunk/60 p-4">
          <div className="flex items-center justify-between">
            <span className="label-mono text-ink-500">{titleCase(plan)} plan</span>
            <span className="text-small font-semibold tabular-nums text-ink-900">
              {creditsRemaining}
            </span>
          </div>
          <CreditMeter remaining={creditsRemaining} total={creditsTotal} className="mt-2.5" />
          <p className="mt-2 text-micro text-ink-500">
            {creditsRemaining === 1 ? "1 credit left" : `${creditsRemaining} credits left`}
          </p>
          <Link
            href="/dashboard/credits"
            onClick={onNavigate}
            className="mt-3 flex items-center gap-1 text-small font-medium text-teal-700 hover:text-teal-800"
          >
            View credits
            <Icon name="chevronRight" size={14} />
          </Link>
        </div>

        <div className="mt-1.5 border-t border-hairline pt-1.5">
          <SignOutForm />
        </div>
      </div>
    </div>
  );
}
