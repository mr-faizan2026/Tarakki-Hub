/** Maps raw Supabase auth error messages to clear, human copy. Mirrors the web
 *  app's src/lib/auth-errors.ts so the two surfaces read identically. */
export function friendlyAuthError(message: string | undefined): string {
  const m = (message ?? "").toLowerCase();

  if (m.includes("invalid login credentials")) {
    return "That email or password doesn't match our records.";
  }
  if (m.includes("email not confirmed")) {
    return "Please confirm your email first — check your inbox for the link.";
  }
  if (m.includes("password should be at least")) {
    return "Password is too short — use at least 8 characters.";
  }
  if (
    m.includes("for security purposes") ||
    m.includes("rate limit") ||
    m.includes("too many")
  ) {
    return "Too many attempts. Please wait a minute and try again.";
  }
  if (m.includes("unable to validate email address")) {
    return "That email address doesn't look right.";
  }
  if (m.includes("failed to fetch") || m.includes("network")) {
    return "Can't reach the server. Check your connection and try again.";
  }
  if (!message) return "Something went wrong. Please try again.";
  return message;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
