import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * The dashboard's base surface: a hairline-framed panel. Depth comes from the
 * 1px border and a whisper of shadow — never a heavy drop shadow.
 */
export function Card({
  children,
  className,
  as: Tag = "div",
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  as?: ElementType;
  padded?: boolean;
}) {
  return (
    <Tag
      className={cn(
        "rounded-xl border border-hairline bg-surface shadow-[0_1px_0_0_rgba(14,33,49,0.03)]",
        padded && "p-5 sm:p-6",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/** Section heading used on every dashboard page. */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-h2 font-semibold tracking-[-0.02em] text-ink-900">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-body text-ink-500">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
