"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

/**
 * Prev / next pager driven by the `?page=` search param. Kept deliberately
 * simple (prev · "page X of Y" · next) to match the restrained UI.
 */
export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function goTo(next: number) {
    const sp = new URLSearchParams(params.toString());
    if (next <= 1) sp.delete("page");
    else sp.set("page", String(next));
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  }

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const btn =
    "inline-flex h-9 items-center gap-1.5 rounded-md border border-hairline-strong bg-surface px-3 text-small font-medium text-ink-700 transition-colors hover:border-ink-300 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-hairline-strong";

  return (
    <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
      <p className="text-small text-ink-500">
        Showing <span className="font-medium text-ink-800">{from}</span>–
        <span className="font-medium text-ink-800">{to}</span> of{" "}
        <span className="font-medium text-ink-800">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => goTo(page - 1)}
          disabled={page <= 1}
          className={btn}
        >
          <Icon name="chevronLeft" size={15} />
          Prev
        </button>
        <span className="px-1 text-small tabular-nums text-ink-500">
          {page} / {Math.max(pageCount, 1)}
        </span>
        <button
          type="button"
          onClick={() => goTo(page + 1)}
          disabled={page >= pageCount}
          className={cn(btn)}
        >
          Next
          <Icon name="chevronRight" size={15} />
        </button>
      </div>
    </div>
  );
}
