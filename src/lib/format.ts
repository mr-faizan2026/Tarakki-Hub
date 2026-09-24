/** Small display helpers shared across the dashboard. */

export function firstName(fullName?: string | null, fallback = "there"): string {
  const name = (fullName ?? "").trim();
  if (!name) return fallback;
  return name.split(/\s+/)[0];
}

export function initials(fullName?: string | null, email?: string | null): string {
  const name = (fullName ?? "").trim();
  if (name) {
    const parts = name.split(/\s+/);
    const first = parts[0]?.[0] ?? "";
    const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
    return (first + last).toUpperCase();
  }
  return (email?.[0] ?? "?").toUpperCase();
}

/** e.g. "18 Sep 2026". */
export function formatDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Compact relative time, e.g. "just now", "3h ago", "2d ago". */
export function relativeTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(date);
}

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** e.g. "18 Sep 2026, 4:32 pm". */
export function formatDateTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** Grouped integer, e.g. 12,540. */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-IN").format(value);
}

/** Rupee amount, e.g. "₹1,999" (or "₹1,999.50" when it has paise). */
export function formatMoney(amount: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
