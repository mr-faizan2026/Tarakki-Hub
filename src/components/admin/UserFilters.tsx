"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

const selectClass =
  "h-10 rounded-md border border-hairline-strong bg-surface pl-3 pr-8 text-small text-ink-800 transition-[border-color,box-shadow] focus:border-teal-400 focus:shadow-[0_0_0_3px_var(--color-teal-100)] focus:outline-none";

export function UserFilters({ plans }: { plans: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [q, setQ] = useState(params.get("q") ?? "");
  const firstRun = useRef(true);

  // Push the current filter state into the URL (resetting to page 1).
  function apply(next: { q?: string; plan?: string; status?: string }) {
    const sp = new URLSearchParams(params.toString());
    const set = (key: string, value: string | undefined) => {
      if (value && value !== "all") sp.set(key, value);
      else sp.delete(key);
    };
    if ("q" in next) set("q", next.q);
    if ("plan" in next) set("plan", next.plan);
    if ("status" in next) set("status", next.status);
    sp.delete("page");
    startTransition(() => {
      router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
    });
  }

  // Debounce the free-text search so we don't navigate on every keystroke.
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const id = setTimeout(() => apply({ q }), 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const plan = params.get("plan") ?? "all";
  const status = params.get("status") ?? "all";

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400">
          <Icon name="search" size={17} />
        </span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or email…"
          aria-label="Search users"
          className="h-10 w-full rounded-md border border-hairline-strong bg-surface pl-9 pr-3 text-small text-ink-900 placeholder:text-ink-400 transition-[border-color,box-shadow] focus:border-teal-400 focus:shadow-[0_0_0_3px_var(--color-teal-100)] focus:outline-none"
        />
        {pending ? (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400">
            <Icon name="refresh" size={15} className="animate-spin" />
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor="filter-plan">
          Filter by plan
        </label>
        <select
          id="filter-plan"
          value={plan}
          onChange={(e) => apply({ plan: e.target.value })}
          className={cn(selectClass, "flex-1 sm:flex-none")}
        >
          <option value="all">All plans</option>
          {plans.map((p) => (
            <option key={p} value={p.toLowerCase()}>
              {p}
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor="filter-status">
          Filter by status
        </label>
        <select
          id="filter-status"
          value={status}
          onChange={(e) => apply({ status: e.target.value })}
          className={cn(selectClass, "flex-1 sm:flex-none")}
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="blocked">Blocked</option>
        </select>
      </div>
    </div>
  );
}
