import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "error" | "success" | "info";

const tones: Record<Tone, string> = {
  error: "border-danger-500/30 bg-danger-50 text-danger-700",
  success: "border-teal-300 bg-teal-50 text-teal-800",
  info: "border-hairline-strong bg-canvas-sunk text-ink-700",
};

/** A compact, inline banner for form-level messages. Not an alert() popup. */
export function FormAlert({
  tone = "error",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2.5 rounded-md border px-3.5 py-2.5 text-small",
        tones[tone],
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
          tone === "error"
            ? "bg-danger-500"
            : tone === "success"
              ? "bg-teal-500"
              : "bg-ink-300",
        )}
      />
      <span>{children}</span>
    </div>
  );
}
