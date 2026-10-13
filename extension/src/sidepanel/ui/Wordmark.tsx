/**
 * The TarakkiHub wordmark — the TH monogram plus the two-colour joined
 * logotype (Tarakki in Ink, Hub in Teal).
 *
 * The geometry is the same two polygons the web app uses in
 * src/components/ui/Logo.tsx and the icon generator in scripts/gen-icons.mjs,
 * traced from the brand artwork rather than redrawn. If the mark ever changes,
 * all three move together — there is no fourth copy.
 *
 * The arrow is unpainted on purpose: it is the gap between the T and the H, so
 * it picks up the panel's own surface colour.
 */
export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size * (82.86 / 100)}
      viewBox="0 0 100 82.86"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M0.29 0.57L0.29 17.14L21.14 16.86L20.86 82.86L39.71 82.86L40 38.57L39.43 38.29L38.86 38.86L38 38.86L37.71 39.43L36.86 39.43L36 40.29L35.14 40.29L24.57 45.71L24.29 45.14L27.14 42.57L27.14 42L29.43 40L29.43 39.43L30.57 38.86L30.57 38.29L36.57 32.29L36.57 31.71L37.43 31.43L37.43 30.86L40.29 28.29L40.29 27.71L40.86 27.71L41.14 26.86L45.43 22.86L45.43 22.29L50.29 17.71L50.29 16.86L48.86 15.43L46 13.71L46.29 13.14L61.71 10.29L61.71 28L58.57 25.14L58.57 40L60.29 39.43L62.29 37.43L62.86 37.43L66.86 34L67.43 34L67.71 0.57Z"
        fill="var(--teal-500)"
      />
      <path
        d="M99.43 0L82 9.14L81.71 40.29L58.57 40L58.57 24.86L58 24L56.57 24.29L54.57 26.57L54 26.57L52.57 28.29L52 28.29L50.29 30.29L49.71 30.29L46 34L45.43 34L45.14 34.86L44 35.43L43.71 82.86L58.86 82.57L58.86 54.86L81.71 54.86L81.71 82.86L100 82.57L100 0.29Z"
        fill="var(--ink-900)"
      />
    </svg>
  );
}

export function Wordmark({ size = 26 }: { size?: number }) {
  return (
    <span className="wordmark">
      <LogoMark size={size} />
      <span>
        Tarakki<span className="accent">Hub</span>
      </span>
    </span>
  );
}
