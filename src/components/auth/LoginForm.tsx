"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { TextField } from "@/components/ui/Field";
import { PasswordField } from "@/components/ui/PasswordField";
import { FormAlert } from "@/components/ui/FormAlert";
import { Button } from "@/components/ui/Button";
import { isValidEmail } from "@/lib/password";
import { friendlyAuthError } from "@/lib/auth-errors";

type Errors = Partial<Record<"email" | "password", string>>;

export function LoginForm({
  next = "/dashboard",
  notice,
}: {
  next?: string;
  notice?: "reset" | "link" | null;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [submitError, setSubmitError] = useState<string | null>(
    notice === "link" ? "This link has expired or already been used. Please sign in." : null,
  );
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    const found: Errors = {};
    if (!isValidEmail(email)) found.email = "Enter a valid email address.";
    if (!password) found.password = "Enter your password.";
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);

    if (error) {
      setSubmitError(friendlyAuthError(error.message));
      return;
    }

    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {notice === "reset" ? (
        <FormAlert tone="success">
          Password updated. Sign in with your new password.
        </FormAlert>
      ) : null}
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
        error={errors.email}
        required
      />
      <PasswordField
        id="password"
        label="Password"
        autoComplete="current-password"
        placeholder="Your password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.password}
        labelAside={
          <Link
            href="/forgot-password"
            className="text-small font-medium text-teal-700 hover:text-teal-800"
          >
            Forgot password?
          </Link>
        }
        required
      />

      <Button type="submit" size="lg" block disabled={loading} className="mt-1">
        {loading ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
