/** Maps raw Supabase auth error messages to clear, human copy. */
export function friendlyAuthError(message: string | undefined): string {
  const m = (message ?? "").toLowerCase();

  if (m.includes("invalid login credentials")) {
    return "That email or password doesn't match our records.";
  }
  if (m.includes("email not confirmed")) {
    return "Please confirm your email first — check your inbox for the link.";
  }
  if (m.includes("user already registered") || m.includes("already been registered")) {
    return "An account with this email already exists. Try signing in instead.";
  }
  if (m.includes("password should be at least")) {
    return "Password is too short — use at least 8 characters.";
  }
  if (m.includes("new password should be different")) {
    return "Your new password must be different from the current one.";
  }
  if (m.includes("for security purposes") || m.includes("rate limit") || m.includes("too many")) {
    return "Too many attempts. Please wait a minute and try again.";
  }
  if (m.includes("unable to validate email address")) {
    return "That email address doesn't look right.";
  }
  if (m.includes("token has expired") || m.includes("invalid") && m.includes("token")) {
    return "This link has expired or already been used. Request a new one.";
  }
  if (!message) return "Something went wrong. Please try again.";
  return message;
}
