import { cn } from "@/lib/cn";

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  THE TH MONOGRAM
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  A teal T and a deep-ink H sharing a stroke, with an upward arrow knocked
 *  out of them — tarakki, growth.
 *
 *  ── WHY THIS IS SVG AND NOT THE SUPPLIED PNG ──────────────────────────────
 *  The brand file arrived as a 500px PNG. Three things it could not do:
 *
 *    1. The arrow is a HOLE, not a white shape. On the page's off-white it
 *       reads as a white arrow, which is the intent — but on the ink-900
 *       footer and the sign-in panel it would show dark, and the navy H would
 *       vanish into the background with it. Here the H is `currentColor`, so
 *       `onDark` turns it white and the mark survives any background.
 *    2. A favicon is 16px. A downscaled PNG of a mark this fine turns to mush;
 *       the same vector stays crisp.
 *    3. The PNG's teal is #04B69E, a shade off the site's own teal-500. Two
 *       near-identical teals sitting next to each other in the nav is the kind
 *       of thing that looks like a mistake rather than a decision, so the mark
 *       draws from the design token and there is only ever one teal.
 *
 *  The paths were traced from the supplied PNG's actual pixels rather than
 *  redrawn by eye — see the generator in the scratchpad notes — then simplified,
 *  which is why the diagonal of the arrow carries more points than a hand-drawn
 *  one would.
 *
 *  ── THE ARROW IS A KNOCKOUT, SO THE ORDER OF THESE PATHS MATTERS ──────────
 *  Nothing paints the arrow. It is the gap left between the two letterforms,
 *  which is what lets it pick up whatever the mark is sitting on.
 */
export function LogoMark({
  size = 30,
  onDark = false,
  className,
}: {
  size?: number;
  /** Ink-on-light flips to white-on-dark; the teal is unchanged either way. */
  onDark?: boolean;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size * (82.86 / 100)}
      viewBox="0 0 100 82.86"
      fill="none"
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <path
        d="M0.29 0.57L0.29 17.14L21.14 16.86L20.86 82.86L39.71 82.86L40 38.57L39.43 38.29L38.86 38.86L38 38.86L37.71 39.43L36.86 39.43L36 40.29L35.14 40.29L24.57 45.71L24.29 45.14L27.14 42.57L27.14 42L29.43 40L29.43 39.43L30.57 38.86L30.57 38.29L36.57 32.29L36.57 31.71L37.43 31.43L37.43 30.86L40.29 28.29L40.29 27.71L40.86 27.71L41.14 26.86L45.43 22.86L45.43 22.29L50.29 17.71L50.29 16.86L48.86 15.43L46 13.71L46.29 13.14L61.71 10.29L61.71 28L58.57 25.14L58.57 40L60.29 39.43L62.29 37.43L62.86 37.43L66.86 34L67.43 34L67.71 0.57Z"
        fill="var(--color-teal-500)"
      />
      <path
        d="M99.43 0L82 9.14L81.71 40.29L58.57 40L58.57 24.86L58 24L56.57 24.29L54.57 26.57L54 26.57L52.57 28.29L52 28.29L50.29 30.29L49.71 30.29L46 34L45.43 34L45.14 34.86L44 35.43L43.71 82.86L58.86 82.57L58.86 54.86L81.71 54.86L81.71 82.86L100 82.57L100 0.29Z"
        fill={onDark ? "#ffffff" : "var(--color-ink-900)"}
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
      <LogoMark size={size} onDark={onDark} />
      {variant === "full" &&
        (onDark ? (
          /* Single-colour context (dark / teal bg): spaced, one colour. */
          <span className="font-sans text-[1.18rem] font-bold leading-none tracking-[-0.02em] text-white">
            Tarakki Hub
          </span>
        ) : (
          /* Two-colour logotype: joined, Deep Ink + Teal — the same split the
             monogram uses, and the reason the wordmark stays live text rather
             than being baked into the image. */
          <span className="font-sans text-[1.18rem] font-bold leading-none tracking-[-0.02em] text-ink-800">
            Tarakki<span className="text-teal-500">Hub</span>
          </span>
        ))}
    </span>
  );
}
