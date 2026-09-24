import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "teal" | "ink" | "amber" | "outline" | "danger" | "neutral";

const tones: Record<Tone, string> = {
  teal: "bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-100",
  ink: "bg-ink-800 text-teal-100 ring-1 ring-inset ring-white/10",
  amber: "bg-amber-500/12 text-amber-600 ring-1 ring-inset ring-amber-500/20",
  outline: "text-ink-600 ring-1 ring-inset ring-hairline-strong",
  danger: "bg-danger-50 text-danger-700 ring-1 ring-inset ring-danger-100",
  neutral: "bg-canvas-sunk text-ink-600 ring-1 ring-inset ring-hairline",
};

export function Badge({
  children,
  tone = "teal",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-micro font-medium uppercase tracking-[0.08em]",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
