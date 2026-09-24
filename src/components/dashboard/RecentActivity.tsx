import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/Icon";
import { relativeTime } from "@/lib/format";

export type ActivityItem = {
  id: string;
  icon: IconName;
  text: string;
  at: string;
};

export function RecentActivity({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-hairline-strong px-6 py-10 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-canvas-sunk text-ink-400">
          <Icon name="spark" size={20} />
        </span>
        <p className="mt-3 text-body font-medium text-ink-800">
          Nothing here yet
        </p>
        <p className="mt-1 max-w-xs text-small text-ink-500">
          Credits you spend in the Chrome extension will show up here as you use
          it.
        </p>
        <Link
          href="/dashboard/credits"
          className="mt-4 text-small font-medium text-teal-700 hover:text-teal-800"
        >
          View credits →
        </Link>
      </div>
    );
  }

  return (
    <ul className="flex flex-col">
      {items.map((item, i) => (
        <li
          key={item.id}
          className="flex items-center gap-3.5 py-3"
          style={{ borderTop: i === 0 ? undefined : "1px solid var(--color-hairline)" }}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-canvas-sunk text-ink-500">
            <Icon name={item.icon} size={17} />
          </span>
          <span className="min-w-0 flex-1 truncate text-small text-ink-700">
            {item.text}
          </span>
          <time className="shrink-0 text-small tabular-nums text-ink-400">
            {relativeTime(item.at)}
          </time>
        </li>
      ))}
    </ul>
  );
}
