/**
 * The TarakkiHub wordmark — the teal arrow tile + the two-colour joined
 * logotype (Tarakki in Ink, Hub in Teal), matching src/components/ui/Logo.tsx.
 */
export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <rect width="40" height="40" rx="9" fill="var(--teal-500)" />
      <circle cx="12.6" cy="26.8" r="2" fill="white" fillOpacity="0.9" />
      <path d="M12.6 26.8 L26 13.8" stroke="white" strokeWidth="3.3" strokeLinecap="round" />
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
