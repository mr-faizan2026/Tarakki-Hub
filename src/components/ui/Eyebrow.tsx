import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Two flavours of section label:
 *  - "mono": a precise monospace micro-label with a leading tick.
 *  - "editorial": Fraunces italic — the single human, editorial touch.
 */
export function Eyebrow({
  children,
  variant = "mono",
  className,
  tone = "teal",
}: {
  children: ReactNode;
  variant?: "mono" | "editorial";
  className?: string;
  tone?: "teal" | "ink" | "muted" | "onDark";
}) {
  if (variant === "editorial") {
    return (
      <p
        className={cn(
          "font-serif text-lead italic",
          tone === "onDark" ? "text-teal-200" : "text-teal-700",
          className,
        )}
      >
        {children}
      </p>
    );
  }

  const toneClass = {
    teal: "text-teal-700",
    ink: "text-ink-700",
    muted: "text-ink-400",
    onDark: "text-teal-300",
  }[tone];

  return (
    <p
      className={cn(
        "label-mono flex items-center gap-2.5 font-medium",
        toneClass,
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "inline-block h-px w-6",
          tone === "onDark" ? "bg-teal-300/60" : "bg-teal-500/60",
        )}
      />
      {children}
    </p>
  );
}
