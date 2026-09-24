"use client";

import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { activeAdminNav } from "@/lib/admin-nav";
import { initials } from "@/lib/format";

export function AdminTopbar({
  fullName,
  email,
  onOpenMenu,
}: {
  fullName: string | null;
  email: string | null;
  onOpenMenu: () => void;
}) {
  const pathname = usePathname();
  const current = activeAdminNav(pathname);

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

      <div className="flex min-w-0 items-center gap-2.5">
        <h1 className="truncate font-display text-h4 font-semibold text-ink-900">
          {current?.label ?? "Admin"}
        </h1>
        <span className="hidden shrink-0 rounded-full bg-canvas-sunk px-2 py-0.5 text-micro font-medium uppercase tracking-[0.08em] text-ink-500 sm:inline">
          Admin panel
        </span>
      </div>

      <div className="ml-auto flex items-center gap-2.5">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-full bg-ink-800 text-small font-semibold text-teal-100"
          title={fullName || email || "Admin"}
        >
          {initials(fullName, email)}
        </span>
      </div>
    </header>
  );
}
