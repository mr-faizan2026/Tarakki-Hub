"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { TextField } from "@/components/ui/Field";
import { FormAlert } from "@/components/ui/FormAlert";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { isValidEmail } from "@/lib/password";
import { friendlyAuthError } from "@/lib/auth-errors";

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo: `${window.location.origin}/auth/callback?next=/reset-password` },
    );
    setLoading(false);

    if (resetError) {
      setSubmitError(friendlyAuthError(resetError.message));
      return;
    }
    // Always confirm without revealing whether the account exists.
    setSent(true);
  }

  if (sent) {
    return (
      <div className="rounded-xl border border-hairline bg-surface p-6 shadow-panel">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-teal-50 text-teal-600 ring-1 ring-inset ring-teal-100">
          <Icon name="check" size={22} />
        </span>
        <h2 className="mt-4 font-display text-h4 font-semibold text-ink-900">
          Check your inbox
        </h2>
        <p className="mt-2 text-body text-ink-600">
          If an account exists for{" "}
          <span className="font-medium text-ink-900">{email.trim()}</span>,
          we&apos;ve sent a link to reset your password. It expires in an hour.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {submitError ? <FormAlert>{submitError}</FormAlert> : null}
      <TextField
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={error}
        required
      />
      <Button type="submit" size="lg" block disabled={loading} className="mt-1">
        {loading ? "Sending link…" : "Send reset link"}
      </Button>
    </form>
  );
}
