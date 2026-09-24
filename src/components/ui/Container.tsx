import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Centered content column. Max ~1240px with fluid gutters that never
 * let content touch the edge on a 320px phone.
 */
export function Container({
  children,
  className,
  as: Tag = "div",
  bleed = false,
}: {
  children: ReactNode;
  className?: string;
  as?: ElementType;
  /** Remove horizontal padding (for full-bleed inner control). */
  bleed?: boolean;
}) {
  return (
    <Tag
      className={cn(
        "mx-auto w-full max-w-[1240px]",
        !bleed && "px-5 sm:px-6 lg:px-10",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
