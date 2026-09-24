/**
 * Only ever redirect to a same-origin path. Rejects absolute URLs and
 * protocol-relative (`//evil.com`) values to avoid open-redirects.
 */
export function safeNext(value: string | null | undefined, fallback = "/dashboard"): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}
