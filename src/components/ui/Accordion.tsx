"use client";

import { useId, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/cn";

export type AccordionItem = {
  q: string;
  a: string;
};

export function Accordion({
  items,
  className,
}: {
  items: AccordionItem[];
  className?: string;
}) {
  const [open, setOpen] = useState<number | null>(0);
  const reduce = useReducedMotion();
  const baseId = useId();

  return (
    <div className={cn("divide-y divide-hairline border-y border-hairline", className)}>
      {items.map((item, i) => {
        const isOpen = open === i;
        const panelId = `${baseId}-panel-${i}`;
        const btnId = `${baseId}-btn-${i}`;
        return (
          <div key={item.q}>
            <h3>
              <button
                id={btnId}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-4 py-5 text-left"
              >
                <span
                  className={cn(
                    "text-h4 font-medium transition-colors",
                    isOpen ? "text-ink-900" : "text-ink-700",
                  )}
                >
                  {item.q}
                </span>
                <span
                  className={cn(
                    "relative mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors",
                    isOpen
                      ? "border-teal-500 bg-teal-500 text-white"
                      : "border-hairline-strong text-ink-500",
                  )}
                  aria-hidden
                >
                  <span className="absolute h-0.5 w-2.5 rounded-full bg-current" />
                  <motion.span
                    className="absolute h-0.5 w-2.5 rounded-full bg-current"
                    animate={{ rotate: isOpen ? 0 : 90 }}
                    transition={{ duration: reduce ? 0 : 0.2 }}
                    style={{ opacity: isOpen ? 0 : 1 }}
                  />
                </span>
              </button>
            </h3>

            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  id={panelId}
                  role="region"
                  aria-labelledby={btnId}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{
                    duration: reduce ? 0 : 0.3,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="overflow-hidden"
                >
                  <p className="max-w-2xl pb-6 pr-8 text-body text-ink-600">
                    {item.a}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
