"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/ui/Logo";
import { Icon } from "@/components/ui/Icon";
import { SignOutForm } from "@/components/dashboard/SignOutForm";
import { ADMIN_NAV_ITEMS } from "@/lib/admin-nav";
import { initials } from "@/lib/format";
import { cn } from "@/lib/cn";

type Props = {
  fullName: string | null;
  email: string | null;
  /** Close the mobile drawer on navigation. */
  onNavigate?: () => void;
};

export function AdminSidebar({ fullName, email, onNavigate }: Props) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between px-5">
        <Link
          href="/admin"
          onClick={onNavigate}
          aria-label="Tarakki Hub admin"
          className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-600"
        >
          <Logo size={28} />
        </Link>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-800 px-2.5 py-1 text-micro font-semibold uppercase tracking-[0.1em] text-teal-100 ring-1 ring-inset ring-white/10">
          <Icon name="shield" size={12} />
          Admin
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
        {ADMIN_NAV_ITEMS.map((item) => {
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
      </nav>

      <div className="mt-auto px-3 pb-3">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="flex h-10 items-center gap-2.5 rounded-lg px-3 text-small font-medium text-ink-600 transition-colors hover:bg-canvas-sunk hover:text-ink-900"
        >
          <Icon name="arrowLeft" size={18} className="text-ink-400" />
          Back to dashboard
        </Link>

        <div className="mt-1.5 rounded-xl border border-hairline bg-canvas-sunk/60 p-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink-800 text-small font-semibold text-teal-100">
              {initials(fullName, email)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-small font-medium text-ink-900">
                {fullName || "Admin"}
              </p>
              <p className="truncate text-micro text-ink-500">{email}</p>
            </div>
          </div>
        </div>

        <div className="mt-1.5 border-t border-hairline pt-1.5">
          <SignOutForm />
        </div>
      </div>
    </div>
  );
}
