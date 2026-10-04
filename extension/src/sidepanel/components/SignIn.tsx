import { useState, type FormEvent } from "react";
import { WEB_APP_URL } from "@/lib/config";
import { isValidEmail } from "@/lib/auth-errors";
import { Wordmark } from "../ui/Wordmark";

/**
 * Sign-in screen — email + password against the same Supabase project as the
 * web app. The extension never creates accounts or handles password resets
 * (those are prohibited/side-effectful flows) — it links out to the web app.
 *
 * ── `reason`: WHY THIS SCREEN IS BACK ─────────────────────────────────────
 * Part 3 can sign a seller out without them asking: the account was blocked, or
 * this computer was signed out from another one. A sign-in form reappearing with
 * no explanation is the most alarming thing a paid tool can do — the seller's
 * first guess is that their data is gone. So the reason is shown once, above the
 * form, and then consumed (see takeSignOutReason in lib/license.ts).
 */
export function SignIn({
  onSignIn,
  reason,
}: {
  onSignIn: (email: string, password: string) => Promise<string | null>;
  /** Plain-English explanation for an involuntary sign-out, if there was one. */
  reason?: string | null;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    const found: typeof errors = {};
    if (!isValidEmail(email)) found.email = "Enter a valid email address.";
    if (!password) found.password = "Enter your password.";
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setLoading(true);
    const err = await onSignIn(email, password);
    setLoading(false);
    if (err) setSubmitError(err);
  }

  return (
    <div className="auth">
      <div className="auth__head">
        <Wordmark size={34} />
        <h1 className="auth__title">Sign in</h1>
        <p className="auth__sub">Use your TarakkiHub account.</p>
      </div>

      {reason ? (
        <div className="alert" role="status" style={{ marginBottom: 12 }}>
          {reason}
        </div>
      ) : null}

      <form onSubmit={onSubmit} noValidate>
        {submitError ? <div className="alert">{submitError}</div> : null}

        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {errors.email ? <span className="error">{errors.email}</span> : null}
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="Your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {errors.password ? (
            <span className="error">{errors.password}</span>
          ) : null}
        </div>

        <button
          type="submit"
          className="btn btn-primary btn--block"
          disabled={loading}
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="auth__foot">
        No account?{" "}
        <a href={`${WEB_APP_URL}/signup`} target="_blank" rel="noreferrer">
          Create one
        </a>
      </p>
    </div>
  );
}
