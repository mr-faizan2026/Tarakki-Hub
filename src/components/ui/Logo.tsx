import { cn } from "@/lib/cn";

/** The mark: a precise upward arrow (tarakki = growth) in a teal tile. */
export function LogoMark({
  size = 30,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <rect width="40" height="40" rx="9" fill="var(--color-teal-500)" />
      {/* baseline origin dot */}
      <circle cx="12.6" cy="26.8" r="2" fill="white" fillOpacity="0.9" />
      {/* rising shaft */}
      <path
        d="M12.6 26.8 L26 13.8"
        stroke="white"
        strokeWidth="3.3"
        strokeLinecap="round"
      />
      {/* arrowhead */}
      <path
        d="M19.4 13.8 H26 V20.2"
        stroke="white"
        strokeWidth="3.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({
  variant = "full",
  onDark = false,
  size = 30,
  className,
}: {
  variant?: "full" | "mark";
  onDark?: boolean;
  size?: number;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={size} />
      {variant === "full" &&
        (onDark ? (
          /* Single-colour context (dark / teal bg): spaced, one colour. */
          <span className="font-sans text-[1.18rem] font-bold leading-none tracking-[-0.02em] text-white">
            Tarakki Hub
          </span>
        ) : (
          /* Two-colour logotype: joined, Deep Ink + Teal. */
          <span className="font-sans text-[1.18rem] font-bold leading-none tracking-[-0.02em] text-ink-800">
            Tarakki<span className="text-teal-500">Hub</span>
          </span>
        ))}
    </span>
  );
}
