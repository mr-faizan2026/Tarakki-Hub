"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { TextField } from "@/components/ui/Field";
import { PasswordField } from "@/components/ui/PasswordField";
import { FormAlert } from "@/components/ui/FormAlert";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { isValidEmail, meetsPolicy } from "@/lib/password";
import { friendlyAuthError } from "@/lib/auth-errors";

type Errors = Partial<Record<"fullName" | "email" | "password" | "confirm", string>>;

export function SignupForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  function validate(): Errors {
    const next: Errors = {};
    if (!fullName.trim()) next.fullName = "Please enter your name.";
    if (!isValidEmail(email)) next.email = "Enter a valid email address.";
    if (!meetsPolicy(password))
      next.password = "Use at least 8 characters with a mix of letters and numbers.";
    if (confirm !== password) next.confirm = "Passwords don't match.";
    return next;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName.trim() },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
      },
    });
    setLoading(false);

    if (error) {
      setSubmitError(friendlyAuthError(error.message));
      return;
    }

    // Confirmation on → no session yet. Show the check-your-email state.
    if (!data.session) {
      setSentTo(email.trim());
      return;
    }

    // Confirmation off → straight into the dashboard.
    router.push("/dashboard");
    router.refresh();
  }

  if (sentTo) {
    return (
      <div className="rounded-xl border border-hairline bg-surface p-6 shadow-panel">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-teal-50 text-teal-600 ring-1 ring-inset ring-teal-100">
          <Icon name="check" size={22} />
        </span>
        <h2 className="mt-4 font-display text-h4 font-semibold text-ink-900">
          Confirm your email
        </h2>
        <p className="mt-2 text-body text-ink-600">
          We&apos;ve sent a confirmation link to{" "}
          <span className="font-medium text-ink-900">{sentTo}</span>. Click it to
          activate your account, then you&apos;ll land in your dashboard.
        </p>
        <p className="mt-4 text-small text-ink-500">
          Didn&apos;t get it? Check spam, or{" "}
          <button
            type="button"
            onClick={() => setSentTo(null)}
            className="font-medium text-teal-700 underline underline-offset-2 hover:text-teal-800"
          >
            try a different email
          </button>
          .
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {submitError ? <FormAlert>{submitError}</FormAlert> : null}

      <TextField
        id="fullName"
        label="Full name"
        type="text"
        autoComplete="name"
        placeholder="Priya Sharma"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        error={errors.fullName}
        required
      />
      <TextField
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={errors.email}
        required
      />
      <PasswordField
        id="password"
        label="Password"
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
        label="Confirm password"
        autoComplete="new-password"
        placeholder="Re-enter your password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        error={errors.confirm}
        required
      />

      <Button type="submit" size="lg" block disabled={loading} className="mt-1">
        {loading ? "Creating your account…" : "Create account"}
      </Button>

      <p className="text-small leading-relaxed text-ink-400">
        By creating an account you agree to use Tarakki Hub to list your own
        catalog. We never ask for your marketplace password.
      </p>
    </form>
  );
}
