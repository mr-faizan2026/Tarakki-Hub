"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { setStarterCredits } from "@/app/admin/plans/actions";
import { cn } from "@/lib/cn";

export function StarterCreditsForm({ current }: { current: number }) {
  const router = useRouter();
  const [value, setValue] = useState(String(current));
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<
    { tone: "success" | "error"; text: string } | null
  >(null);

  const dirty = value.trim() !== String(current);

  function submit() {
    setFeedback(null);
    startTransition(async () => {
      const res = await setStarterCredits(value);
      if (!res.ok) {
        setFeedback({ tone: "error", text: res.error });
        return;
      }
      setFeedback({ tone: "success", text: "Starter credits updated." });
      router.refresh();
    });
  }

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative sm:w-40">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-teal-500">
            <Icon name="spark" size={16} />
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setFeedback(null);
            }}
            aria-label="Starter credits"
            className="h-10 w-full rounded-md border border-hairline-strong bg-surface pl-9 pr-3 text-small font-semibold tabular-nums text-ink-900 transition-[border-color,box-shadow] focus:border-teal-400 focus:shadow-[0_0_0_3px_var(--color-teal-100)] focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={pending || !dirty}
          className="inline-flex h-10 items-center justify-center rounded-md bg-teal-500 px-4 text-small font-medium text-white transition-colors hover:bg-teal-600 disabled:pointer-events-none disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      {feedback ? (
        <p
          className={cn(
            "mt-2 flex items-center gap-1.5 text-small",
            feedback.tone === "error" ? "text-danger-600" : "text-teal-700",
          )}
        >
          <Icon name={feedback.tone === "error" ? "ban" : "check"} size={14} />
          {feedback.text}
        </p>
      ) : null}
    </div>
  );
}
