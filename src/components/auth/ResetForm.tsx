"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PasswordField } from "@/components/ui/PasswordField";
import { FormAlert } from "@/components/ui/FormAlert";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { meetsPolicy } from "@/lib/password";
import { friendlyAuthError } from "@/lib/auth-errors";

type Phase = "checking" | "ready" | "invalid" | "success";

export function ResetForm() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Partial<Record<"password" | "confirm", string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let settled = false;

    // The recovery link either sets a session cookie (via /auth/callback) or
    // carries tokens in the URL hash that the client detects and turns into a
    // PASSWORD_RECOVERY event. Handle both.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || (session && !settled)) {
        settled = true;
        setPhase("ready");
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (settled) return;
      settled = true;
      setPhase(data.session ? "ready" : "invalid");
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    const found: typeof errors = {};
    if (!meetsPolicy(password))
      found.password = "Use at least 8 characters with a mix of letters and numbers.";
    if (confirm !== password) found.confirm = "Passwords don't match.";
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setLoading(false);
      setSubmitError(friendlyAuthError(error.message));
      return;
    }

    // Force a clean re-login with the new password.
    await supabase.auth.signOut();
    setLoading(false);
    setPhase("success");
    setTimeout(() => {
      router.push("/login?reset=1");
      router.refresh();
    }, 1800);
  }

  if (phase === "checking") {
    return (
      <div className="flex items-center gap-3 text-small text-ink-500">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-hairline-strong border-t-teal-500" />
        Verifying your reset link…
      </div>
    );
  }

  if (phase === "invalid") {
    return (
      <div className="rounded-xl border border-hairline bg-surface p-6 shadow-panel">
        <h2 className="font-display text-h4 font-semibold text-ink-900">
          Link expired or invalid
        </h2>
        <p className="mt-2 text-body text-ink-600">
          Reset links can only be used once and expire after an hour. Request a
          fresh one and we&apos;ll email it right over.
        </p>
        <Button href="/forgot-password" size="md" className="mt-5">
          Request a new link
        </Button>
      </div>
    );
  }

  if (phase === "success") {
    return (
      <div className="rounded-xl border border-hairline bg-surface p-6 shadow-panel">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-teal-50 text-teal-600 ring-1 ring-inset ring-teal-100">
          <Icon name="check" size={22} />
        </span>
        <h2 className="mt-4 font-display text-h4 font-semibold text-ink-900">
          Password updated
        </h2>
        <p className="mt-2 text-body text-ink-600">
          Taking you to sign in with your new password…
        </p>
        <Link
          href="/login?reset=1"
          className="mt-4 inline-block text-small font-medium text-teal-700 hover:text-teal-800"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {submitError ? <FormAlert>{submitError}</FormAlert> : null}
      <PasswordField
        id="password"
        label="New password"
        autoComplete="new-password"
        placeholder="At least 8 characters"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.password}
        showStrength
        required
      />
      <PasswordField
        id="confirm"
        label="Confirm new password"
        autoComplete="new-password"
        placeholder="Re-enter your new password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        error={errors.confirm}
        required
      />
      <Button type="submit" size="lg" block disabled={loading} className="mt-1">
        {loading ? "Updating password…" : "Update password"}
      </Button>
    </form>
  );
}
