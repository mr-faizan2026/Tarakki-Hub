import { Icon } from "@/components/ui/Icon";
import { formatDate } from "@/lib/format";
import type { CreditEvent } from "@/lib/supabase/types";

/**
 * Read-only history of credit spends (date · action · credits). Rows are
 * written by the Chrome extension via consume_credit(); the dashboard only
 * displays them.
 */
export function CreditLog({ events }: { events: CreditEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-hairline-strong px-6 py-12 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-canvas-sunk text-ink-400">
          <Icon name="spark" size={20} />
        </span>
        <p className="mt-3 text-body font-medium text-ink-800">
          No credit usage yet
        </p>
        <p className="mt-1 max-w-sm text-small text-ink-500">
          When you use the Chrome extension, each credit you spend will be listed
          here with the date and what it was used for.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden">
      {/* Header row — hidden on mobile where each entry stacks. */}
      <div className="hidden grid-cols-[1fr_auto] gap-4 border-b border-hairline px-1 pb-2.5 sm:grid sm:grid-cols-[10rem_1fr_auto]">
        <span className="label-mono text-ink-400">Date</span>
        <span className="label-mono text-ink-400">Action</span>
        <span className="label-mono text-right text-ink-400">Credits</span>
      </div>

      <ul className="flex flex-col">
        {events.map((e) => (
          <li
            key={e.id}
            className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 border-b border-hairline px-1 py-3.5 last:border-b-0 sm:grid-cols-[10rem_1fr_auto]"
          >
            <time className="order-2 text-small tabular-nums text-ink-400 sm:order-1">
              {formatDate(e.created_at)}
            </time>
            <span className="order-1 col-span-2 min-w-0 truncate text-small font-medium text-ink-800 sm:order-2 sm:col-span-1">
              {e.action}
            </span>
            <span className="order-3 text-right text-small font-semibold tabular-nums text-ink-900">
              −{e.credits}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
