"use client";

import { scorePassword } from "@/lib/password";
import { cn } from "@/lib/cn";

const BAR_TONES = [
  "bg-danger-500", // 1 weak
  "bg-amber-500", // 2 fair
  "bg-teal-400", // 3 good
  "bg-teal-600", // 4 strong
];

const LABEL_TONES = [
  "text-ink-400",
  "text-danger-600",
  "text-amber-600",
  "text-teal-700",
  "text-teal-700",
];

/** Live four-segment strength meter shown under a password field. */
export function PasswordStrength({ password }: { password: string }) {
  const { score, label, hint } = scorePassword(password);
  const show = password.length > 0;

  return (
    <div aria-live="polite" className="mt-0.5">
      <div className="flex items-center gap-1.5" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors duration-300",
              show && score > i ? BAR_TONES[Math.min(score, 4) - 1] : "bg-hairline-strong",
            )}
          />
        ))}
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-3 text-small">
        <span className={cn("font-medium", LABEL_TONES[show ? score : 0])}>
          {show ? `${label} password` : "Password strength"}
        </span>
        {show && hint ? <span className="text-ink-500">{hint}</span> : null}
      </div>
    </div>
  );
}
