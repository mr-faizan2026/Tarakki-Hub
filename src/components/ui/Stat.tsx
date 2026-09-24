"use client";

import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/cn";

type StatProps = {
  /** Numeric target for the count-up. */
  value: number;
  prefix?: string;
  suffix?: string;
  /** Decimal places to show (e.g. 4.8 -> decimals=1). */
  decimals?: number;
  label: string;
  className?: string;
  onDark?: boolean;
};

/** A number that counts up once, the moment it enters view. */
export function Stat({
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
  label,
  className,
  onDark = false,
}: StatProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -15% 0px" });
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setDisplay(value);
      return;
    }
    const duration = 1100;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutExpo
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      setDisplay(value * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduce, value]);

  const formatted = display.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <div ref={ref} className={cn("flex flex-col", className)}>
      <div
        className={cn(
          "font-display text-h2 font-semibold tabular-nums",
          onDark ? "text-white" : "text-ink-900",
        )}
      >
        {prefix}
        {formatted}
        {suffix}
      </div>
      <div
        className={cn(
          "mt-1.5 text-small",
          onDark ? "text-ink-300" : "text-ink-500",
        )}
      >
        {label}
      </div>
    </div>
  );
}
