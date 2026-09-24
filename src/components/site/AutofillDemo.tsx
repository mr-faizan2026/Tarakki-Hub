"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/cn";

type Field = {
  label: string;
  value: string;
  strike?: string;
  auto?: boolean;
  kind?: "text" | "price" | "chips";
};

const FIELDS: Field[] = [
  { label: "Product name", value: "Cotton Anarkali Kurti — Sky Blue" },
  { label: "Category", value: "Kurtis & Kurtas", auto: true },
  { label: "Selling price", value: "₹549", strike: "₹1,299", kind: "price" },
  { label: "Available sizes", value: "S · M · L · XL · XXL", kind: "chips" },
  { label: "GST rate", value: "5%", auto: true },
  { label: "HSN code", value: "6109", auto: true },
  { label: "Fabric", value: "Cotton Blend" },
];

const SIZES = ["S", "M", "L", "XL", "XXL"];

type Phase = "clicking" | "filling" | "done";

function Check() {
  return (
    <motion.span
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 520, damping: 24 }}
      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-teal-500"
      aria-hidden
    >
      <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none">
        <path
          d="M2.5 6.2 4.8 8.5 9.5 3.5"
          stroke="white"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </motion.span>
  );
}

function Cursor() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 drop-shadow-sm" aria-hidden>
      <path
        d="M4 3 L4 19 L8.5 14.8 L11.4 21 L14 19.8 L11.1 13.8 L17 13.4 Z"
        fill="var(--color-ink-900)"
        stroke="white"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FieldRow({
  field,
  index,
  filled,
  active,
}: {
  field: Field;
  index: number;
  filled: boolean;
  active: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors duration-200",
        active && "bg-teal-50 ring-1 ring-inset ring-teal-200",
        filled && "bg-transparent",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-micro font-medium uppercase tracking-[0.1em] text-ink-400">
            {field.label}
          </span>
          {field.auto && (
            <span className="rounded-full bg-teal-100 px-1.5 py-px text-[0.5rem] font-semibold uppercase tracking-[0.08em] text-teal-700">
              auto
            </span>
          )}
        </div>

        <div className="mt-1 flex min-h-[22px] items-center">
          {/* Empty state placeholder */}
          {!filled && !active && (
            <span className="h-1.5 w-24 rounded-full bg-hairline-strong/70" />
          )}

          {/* Active — caret blinking, about to fill */}
          {active && (
            <span className="inline-flex items-center">
              <span className="h-4 w-0.5 caret-blink bg-teal-600" />
            </span>
          )}

          {/* Filled */}
          {filled && field.kind === "chips" && (
            <div className="flex flex-wrap gap-1">
              {SIZES.map((s, i) => (
                <motion.span
                  key={s}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.045 }}
                  className="rounded border border-hairline-strong bg-surface px-1.5 py-0.5 text-[0.7rem] font-medium text-ink-700"
                >
                  {s}
                </motion.span>
              ))}
            </div>
          )}

          {filled && field.kind !== "chips" && (
            <motion.span
              initial={{ opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-baseline gap-2 truncate text-small font-medium text-ink-900"
            >
              <span className="truncate">{field.value}</span>
              {field.strike && (
                <span className="text-micro font-normal text-ink-400 line-through">
                  {field.strike}
                </span>
              )}
            </motion.span>
          )}
        </div>
      </div>

      <div className="w-4 shrink-0">
        <AnimatePresence>{filled && <Check key="c" />}</AnimatePresence>
      </div>
    </div>
  );
}

export function AutofillDemo({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "0px 0px -10% 0px" });
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("clicking");
  const [filled, setFilled] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setFilled(FIELDS.length);
      setPhase("done");
      return;
    }
    let cancelled = false;
    const timers: number[] = [];
    const wait = (ms: number) =>
      new Promise<void>((res) => {
        const id = window.setTimeout(res, ms);
        timers.push(id);
      });

    const run = async () => {
      while (!cancelled) {
        setPhase("clicking");
        setFilled(0);
        await wait(780);
        if (cancelled) break;
        setPhase("filling");
        for (let i = 1; i <= FIELDS.length; i++) {
          await wait(500);
          if (cancelled) break;
          setFilled(i);
        }
        if (cancelled) break;
        setPhase("done");
        await wait(2700);
      }
    };
    run();
    return () => {
      cancelled = true;
      timers.forEach((id) => clearTimeout(id));
    };
  }, [inView, reduce]);

  const progress = Math.round((filled / FIELDS.length) * 100);

  return (
    <div ref={ref} className={cn("relative", className)}>
      {/* Floating template chip — the source of truth */}
      <div className="pointer-events-none absolute -left-3 -top-3 z-20 hidden sm:block">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 6 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="flex items-center gap-2 rounded-md border border-hairline bg-surface px-3 py-2 shadow-[0_10px_30px_-18px_rgba(14,33,49,0.4)]"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded bg-ink-900">
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
              <path
                d="M4 3h5l3 3v7H4z"
                stroke="var(--color-teal-300)"
                strokeWidth="1.3"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <div className="leading-tight">
            <div className="text-[0.6rem] uppercase tracking-[0.12em] text-ink-400">
              Template
            </div>
            <div className="text-small font-semibold text-ink-900">
              Cotton Kurti
            </div>
          </div>
        </motion.div>
      </div>

      {/* The panel */}
      <div className="relative overflow-hidden rounded-lg border border-hairline bg-surface shadow-[0_2px_4px_rgba(14,33,49,0.04),0_30px_60px_-32px_rgba(14,33,49,0.28)]">
        {/* Panel top bar */}
        <div className="flex items-center justify-between border-b border-hairline bg-canvas/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex gap-1.5" aria-hidden>
              <span className="h-2 w-2 rounded-full bg-hairline-strong" />
              <span className="h-2 w-2 rounded-full bg-hairline-strong" />
              <span className="h-2 w-2 rounded-full bg-teal-400" />
            </span>
            <span className="label-mono text-ink-400">Supplier Panel · New catalog</span>
          </div>
          <span className="hidden text-micro font-medium text-ink-400 sm:block">
            meesho.com
          </span>
        </div>

        {/* Autofill trigger row */}
        <div className="relative flex items-center justify-between gap-3 border-b border-hairline px-4 py-3">
          <div className="text-small text-ink-500">
            <span className="font-medium text-ink-800">7 fields</span> to fill
          </div>

          <div className="relative">
            <button
              type="button"
              tabIndex={-1}
              aria-hidden
              className={cn(
                "pointer-events-none inline-flex h-9 items-center gap-2 rounded-md px-3.5 text-small font-medium text-white transition-transform",
                phase === "clicking"
                  ? "scale-[0.97] bg-teal-700"
                  : "bg-teal-500",
              )}
            >
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden>
                <path
                  d="M9 1 2.5 9.2H7l-1 5.8L13.5 6.8H9z"
                  fill="white"
                />
              </svg>
              Autofill from template
            </button>

            {/* faux cursor tap */}
            <AnimatePresence>
              {phase === "clicking" && !reduce && (
                <motion.div
                  key="cursor"
                  className="absolute right-3 top-6 z-10"
                  initial={{ opacity: 0, x: 12, y: 12 }}
                  animate={{ opacity: 1, x: 0, y: [8, 0, 8] }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.6 }}
                >
                  <Cursor />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Fields */}
        <div className="flex flex-col gap-0.5 p-2">
          {FIELDS.map((f, i) => (
            <FieldRow
              key={f.label}
              field={f}
              index={i}
              filled={i < filled}
              active={phase === "filling" && i === filled}
            />
          ))}
        </div>

        {/* Footer status */}
        <div className="border-t border-hairline px-4 py-3">
          <AnimatePresence mode="wait">
            {phase === "done" ? (
              <motion.div
                key="done"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2">
                  <Check />
                  <span className="text-small font-medium text-ink-900">
                    Draft ready to review
                  </span>
                </div>
                <span className="text-micro text-ink-400">
                  Nothing goes live without you
                </span>
              </motion.div>
            ) : (
              <motion.div
                key="progress"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-3"
              >
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-hairline">
                  <motion.div
                    className="h-full rounded-full bg-teal-500"
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
                <span className="w-24 text-right text-micro tabular-nums text-ink-400">
                  Filling {Math.min(filled + (phase === "filling" ? 1 : 0), 7)} / 7
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Time-saved caption, tucked under */}
      <div className="mt-3 flex items-center gap-2 pl-1 text-micro text-ink-400">
        <span className="h-1 w-1 rounded-full bg-teal-500" />
        Same catalog, filled by hand: ~6 minutes. Here: about 4 seconds.
      </div>
    </div>
  );
}
