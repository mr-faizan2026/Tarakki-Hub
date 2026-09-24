"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { activeNav } from "@/lib/dashboard-nav";
import { initials } from "@/lib/format";
import { cn } from "@/lib/cn";

export function Topbar({
  fullName,
  email,
  creditsRemaining,
  onOpenMenu,
}: {
  fullName: string | null;
  email: string | null;
  creditsRemaining: number;
  onOpenMenu: () => void;
}) {
  const pathname = usePathname();
  const current = activeNav(pathname);
  const low = creditsRemaining <= 1;

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-hairline bg-canvas/85 px-4 backdrop-blur-md sm:px-6">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Open menu"
        className="flex h-10 w-10 items-center justify-center rounded-lg border border-hairline-strong bg-surface text-ink-700 lg:hidden"
      >
        <Icon name="menu" size={20} />
      </button>

      <h1 className="truncate font-display text-h4 font-semibold text-ink-900">
        {current?.label ?? "Dashboard"}
      </h1>

      <div className="ml-auto flex items-center gap-2.5">
        <Link
          href="/dashboard/credits"
          className={cn(
            "hidden items-center gap-2 rounded-full px-3 py-1.5 text-small font-medium ring-1 ring-inset transition-colors sm:inline-flex",
            low
              ? "bg-amber-500/12 text-amber-600 ring-amber-500/25 hover:bg-amber-500/20"
              : "bg-teal-50 text-teal-700 ring-teal-100 hover:bg-teal-100",
          )}
          title="Credits remaining"
        >
          <Icon name="spark" size={15} />
          <span className="tabular-nums">{creditsRemaining}</span>
          <span className="text-ink-400">credits</span>
        </Link>

        <Link
          href="/dashboard/settings"
          className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-1 transition-colors hover:bg-canvas-sunk sm:pr-3"
          title="Account settings"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-800 text-small font-semibold text-teal-100">
            {initials(fullName, email)}
          </span>
          <span className="hidden max-w-[10rem] truncate text-small font-medium text-ink-800 sm:block">
            {fullName || email}
          </span>
        </Link>
      </div>
    </header>
  );
}
