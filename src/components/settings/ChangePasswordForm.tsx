"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { PasswordField } from "@/components/ui/PasswordField";
import { Button } from "@/components/ui/Button";
import { FormAlert } from "@/components/ui/FormAlert";
import { meetsPolicy } from "@/lib/password";
import { friendlyAuthError } from "@/lib/auth-errors";

export function ChangePasswordForm({ email }: { email: string }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<
    Partial<Record<"current" | "next" | "confirm", string>>
  >({});
  const [alert, setAlert] = useState<
    { tone: "error" | "success"; message: string } | null
  >(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setAlert(null);

    const found: typeof errors = {};
    if (!current) found.current = "Enter your current password.";
    if (!meetsPolicy(next))
      found.next = "Use at least 8 characters with a mix of letters and numbers.";
    if (confirm !== next) found.confirm = "Passwords don't match.";
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setLoading(true);
    const supabase = createClient();

    // Verify the current password before changing it.
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: current,
    });
    if (signInError) {
      setLoading(false);
      setErrors({ current: "That password isn't correct." });
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: next });
    setLoading(false);

    if (error) {
      setAlert({ tone: "error", message: friendlyAuthError(error.message) });
      return;
    }

    setCurrent("");
    setNext("");
    setConfirm("");
    setAlert({ tone: "success", message: "Password updated." });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {alert ? <FormAlert tone={alert.tone}>{alert.message}</FormAlert> : null}
      <div className="grid gap-4 sm:max-w-md">
        <PasswordField
          id="current-password"
          label="Current password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          error={errors.current}
        />
        <PasswordField
          id="new-password"
          label="New password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          error={errors.next}
          showStrength
        />
        <PasswordField
          id="confirm-password"
          label="Confirm new password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={errors.confirm}
        />
      </div>
      <div>
        <Button type="submit" size="md" disabled={loading}>
          {loading ? "Updating…" : "Update password"}
        </Button>
      </div>
    </form>
  );
}
