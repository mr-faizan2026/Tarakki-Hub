import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type SectionProps = {
  children: ReactNode;
  id?: string;
  className?: string;
  /** Vertical rhythm. Editorial = large, confident padding. */
  spacing?: "sm" | "md" | "lg";
  tone?: "canvas" | "surface" | "sunk" | "ink";
};

const spacingMap = {
  sm: "py-14 sm:py-16",
  md: "py-18 sm:py-24 lg:py-28",
  lg: "py-24 sm:py-32 lg:py-40",
} as const;

const toneMap = {
  canvas: "bg-canvas text-ink-900",
  surface: "bg-surface text-ink-900",
  sunk: "bg-canvas-sunk text-ink-900",
  ink: "bg-ink-900 text-white",
} as const;

export function Section({
  children,
  id,
  className,
  spacing = "lg",
  tone = "canvas",
}: SectionProps) {
  return (
    <section
      id={id}
      className={cn(
        "relative w-full overflow-hidden",
        spacingMap[spacing],
        toneMap[tone],
        className,
      )}
    >
      {children}
    </section>
  );
}
