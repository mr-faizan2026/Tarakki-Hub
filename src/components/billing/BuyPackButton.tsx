"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  BUY — the browser half of checkout
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  It knows a pack's SLUG and nothing about its price. The amount is decided in
 *  /api/checkout from the database; nothing here could change it if it tried,
 *  which is the point — a price that exists in the client is a price a buyer can
 *  edit.
 *
 *  ── THE PHONE STEP ────────────────────────────────────────────────────────
 *  Cashfree requires a 10-digit number on every order and the account may not
 *  have one yet. Rather than a separate "complete your profile" page, the server
 *  answers `phone_required` and the button grows one field in place. The number
 *  is stored on first use, so this appears once per seller, not once per
 *  purchase.
 *
 *  ── WHY THE SDK IS LOADED ON CLICK ────────────────────────────────────────
 *  A script tag in the layout would make every page — including the signed-out
 *  marketing pages — fetch a payments SDK nobody has asked for. Injected on the
 *  first click, it costs one short pause on the one interaction that needs it,
 *  and the promise is cached so a second attempt is instant.
 */

type CashfreeCheckout = {
  checkout: (opts: {
    paymentSessionId: string;
    redirectTarget?: "_self" | "_blank" | "_modal";
  }) => Promise<unknown>;
};

declare global {
  interface Window {
    Cashfree?: (opts: { mode: "sandbox" | "production" }) => CashfreeCheckout;
  }
}

const SDK_URL = "https://sdk.cashfree.com/js/v3/cashfree.js";
let sdkPromise: Promise<void> | null = null;

function loadSdk(): Promise<void> {
  if (window.Cashfree) return Promise.resolve();
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SDK_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      // Let a later click try again rather than caching the failure forever.
      sdkPromise = null;
      reject(new Error("sdk_failed"));
    };
    document.head.appendChild(script);
  });

  return sdkPromise;
}

export function BuyPackButton({
  slug,
  label = "Buy credits",
  variant = "primary",
  block = true,
  signedIn,
}: {
  slug: string;
  label?: string;
  variant?: "primary" | "secondary";
  block?: boolean;
  /** Signed-out visitors are sent to sign up instead of to a 401. */
  signedIn: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsPhone, setNeedsPhone] = useState(false);
  const [phone, setPhone] = useState("");

  if (!signedIn) {
    return (
      <Button href={`/signup?next=/dashboard/billing`} variant={variant} block={block}>
        {label}
      </Button>
    );
  }

  async function start() {
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pack: slug, ...(phone ? { phone } : {}) }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        code?: string;
        paymentSessionId?: string;
        mode?: "sandbox" | "production";
      };

      if (!res.ok || !data.ok) {
        if (data.code === "phone_required") {
          setNeedsPhone(true);
          // Only an error once they have actually tried a number.
          setError(phone ? "Enter a valid 10-digit mobile number." : null);
        } else {
          setError(data.error ?? "Couldn't start the payment.");
        }
        return;
      }

      await loadSdk();
      const cashfree = window.Cashfree?.({ mode: data.mode ?? "sandbox" });
      if (!cashfree || !data.paymentSessionId) {
        setError("Couldn't open the payment page. Please try again.");
        return;
      }

      // Full-page redirect rather than a modal: it survives a mobile browser
      // backgrounding the tab mid-payment, and Cashfree brings the buyer back to
      // the return_url, which knows how to settle the order.
      await cashfree.checkout({
        paymentSessionId: data.paymentSessionId,
        redirectTarget: "_self",
      });
    } catch {
      setError("Couldn't reach the payment page. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {needsPhone && (
        <label className="flex flex-col gap-1.5 text-left">
          <span className="text-micro font-semibold uppercase tracking-[0.1em] text-ink-500">
            Mobile number
          </span>
          <input
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            maxLength={10}
            placeholder="10-digit number"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
            className="h-11 rounded-md border border-hairline-strong bg-surface px-3 text-body text-ink-900 outline-none focus-visible:border-teal-400 focus-visible:ring-2 focus-visible:ring-teal-100"
          />
          <span className="text-micro text-ink-400">
            Required by the payment gateway. Saved for next time.
          </span>
        </label>
      )}

      <Button
        type="button"
        variant={variant}
        block={block}
        disabled={busy || (needsPhone && phone.length !== 10)}
        onClick={() => void start()}
      >
        {busy ? (
          <>
            <Icon name="refresh" className="h-4 w-4 animate-spin" />
            Opening…
          </>
        ) : (
          label
        )}
      </Button>

      {error && <p className="text-micro text-danger-600">{error}</p>}
    </div>
  );
}
