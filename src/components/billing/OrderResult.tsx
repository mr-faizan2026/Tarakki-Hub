"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  "Did my payment go through?" — shown when Cashfree sends the buyer back
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Cashfree redirects to /dashboard/billing?order_id=… the moment the payment
 *  finishes. At that instant the webhook may not have landed — it is a separate
 *  server-to-server call, it can be seconds late, and in local development it
 *  never arrives at all because Cashfree cannot reach localhost.
 *
 *  So the buyer must not be shown a stale balance and left to guess. This polls
 *  /api/checkout/status, which settles the order itself if the webhook has not.
 *  Whichever gets there first wins; `grant_credit_pack` is latched, so the other
 *  one adds nothing.
 *
 *  ── IT GIVES UP, ON PURPOSE ───────────────────────────────────────────────
 *  After ~40 seconds it stops and says the credits will appear shortly. A
 *  spinner that never resolves is worse than an honest "this is taking longer
 *  than usual" — the money is in, the webhook will retry for hours, and the
 *  seller needs to know they can close the tab.
 */

const POLL_MS = 2500;
const MAX_ATTEMPTS = 16;

type Phase = "checking" | "granted" | "pending" | "failed";

export function OrderResult({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("checking");
  const [credits, setCredits] = useState<number | null>(null);
  const attempts = useRef(0);

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      attempts.current += 1;
      try {
        const res = await fetch(
          `/api/checkout/status?order_id=${encodeURIComponent(orderId)}`,
          { cache: "no-store" },
        );
        const data = (await res.json()) as {
          ok?: boolean;
          status?: string;
          granted?: boolean;
          credits?: number | null;
        };

        if (!live) return;

        if (data.granted) {
          setCredits(data.credits ?? null);
          setPhase("granted");
          // Re-render the server component above so the new balance shows
          // without the seller reloading.
          router.refresh();
          return;
        }

        if (data.status === "failed") {
          setPhase("failed");
          return;
        }
      } catch {
        // Network blip — just try again until the attempt budget runs out.
      }

      if (!live) return;
      if (attempts.current >= MAX_ATTEMPTS) {
        setPhase("pending");
        return;
      }
      timer = setTimeout(() => void poll(), POLL_MS);
    }

    void poll();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [orderId, router]);

  if (phase === "granted") {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-teal-200 bg-teal-50 p-4">
        <span className="mt-0.5 shrink-0 text-teal-700">
          <Icon name="check" size={18} />
        </span>
        <div className="text-small text-ink-700">
          <strong className="text-ink-900">Payment received.</strong>{" "}
          {credits ? `${credits} credits have been added to your account.` : "Your credits have been added."}
        </div>
      </div>
    );
  }

  if (phase === "failed") {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-danger-100 bg-danger-50 p-4">
        <span className="mt-0.5 shrink-0 text-danger-600">
          <Icon name="ban" size={18} />
        </span>
        <div className="text-small text-danger-700">
          <strong>That payment didn&rsquo;t go through.</strong> Nothing was charged.
          You can try again below.
        </div>
      </div>
    );
  }

  if (phase === "pending") {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-hairline bg-surface p-4">
        <span className="mt-0.5 shrink-0 text-ink-400">
          <Icon name="refresh" size={18} />
        </span>
        <div className="text-small text-ink-600">
          <strong className="text-ink-900">This is taking longer than usual.</strong>{" "}
          If the payment went through, your credits will appear here shortly — you
          can close this page. Message us if they haven&rsquo;t within an hour.
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-hairline bg-surface p-4">
      <Icon name="refresh" size={18} className="animate-spin text-ink-400" />
      <span className="text-small text-ink-600">Confirming your payment…</span>
    </div>
  );
}
