/**
 * Password policy + strength scoring. Deliberately dependency-free so it runs
 * identically on the signup, reset, and change-password screens.
 */

export const PASSWORD_MIN_LENGTH = 8;

export type StrengthLevel = 0 | 1 | 2 | 3 | 4;

export type StrengthResult = {
  /** 0–4. 0 = empty/awful, 4 = strong. */
  score: StrengthLevel;
  label: "Too short" | "Weak" | "Fair" | "Good" | "Strong";
  /** The single most useful next improvement, or null when strong. */
  hint: string | null;
};

const LABELS: StrengthResult["label"][] = [
  "Too short",
  "Weak",
  "Fair",
  "Good",
  "Strong",
];

/**
 * A pragmatic score: length does most of the work, character variety adds the
 * rest, and a few obvious weak patterns are penalised. Not a crypto oracle —
 * just an honest nudge toward a better password.
 */
export function scorePassword(password: string): StrengthResult {
  if (!password) {
    return { score: 0, label: "Too short", hint: "Add at least 8 characters" };
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      score: 0,
      label: "Too short",
      hint: `Use at least ${PASSWORD_MIN_LENGTH} characters`,
    };
  }

  let points = 0;
  if (password.length >= 8) points += 1;
  if (password.length >= 12) points += 1;
  if (password.length >= 16) points += 1;

  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);
  const variety = [hasLower, hasUpper, hasDigit, hasSymbol].filter(
    Boolean,
  ).length;
  points += Math.max(0, variety - 1);

  // Penalise low-entropy patterns.
  if (/^(.)\1+$/.test(password)) points -= 2; // all one char
  if (/^[0-9]+$/.test(password)) points -= 1; // digits only
  if (/(?:1234|abcd|qwer|password|0000)/i.test(password)) points -= 2;

  const score = Math.max(1, Math.min(4, points)) as StrengthLevel;

  let hint: string | null = null;
  if (score < 4) {
    if (password.length < 12) hint = "Longer is stronger — aim for 12+";
    else if (!hasUpper || !hasLower) hint = "Mix upper- and lower-case letters";
    else if (!hasDigit) hint = "Add a number";
    else if (!hasSymbol) hint = "Add a symbol like ! or #";
    else hint = "Avoid common words and sequences";
  }

  return { score, label: LABELS[score], hint };
}

/** True when the password clears the minimum policy for submission. */
export function meetsPolicy(password: string): boolean {
  return (
    password.length >= PASSWORD_MIN_LENGTH && scorePassword(password).score >= 2
  );
}

export function isValidEmail(email: string): boolean {
  // Intentionally simple + permissive; the server is the real gate.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
