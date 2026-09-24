import type { SVGProps } from "react";

/**
 * The subset of the web app's line-icon set the panel needs. Stroke-based,
 * currentColor, 24px grid — identical language to src/components/ui/Icon.tsx.
 */
export type IconName =
  | "rupee"
  | "upload"
  | "download"
  | "spark"
  | "check"
  | "logout"
  | "puzzle"
  | "lock"
  | "image"
  | "refresh"
  | "arrowRight"
  | "alert"
  | "sticker"
  | "sliders";

const paths: Record<IconName, React.ReactElement> = {
  rupee: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path
        d="M9 7.5h6M9 10.5h6M9 7.5c3 0 3.6 3 0 3H9l4 6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  upload: (
    <>
      <path d="M12 15V4m0 0L8.5 7.5M12 4l3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 14v3.5A2 2 0 0 0 6.5 19.5h11a2 2 0 0 0 2-2V14" strokeLinecap="round" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v11m0 0 3.5-3.5M12 15l-3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 15v2.5A2 2 0 0 0 6.5 19.5h11a2 2 0 0 0 2-2V15" strokeLinecap="round" />
    </>
  ),
  spark: (
    <path
      d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"
      strokeLinecap="round"
    />
  ),
  check: <path d="m4 12.5 5 5 11-11" strokeLinecap="round" strokeLinejoin="round" />,
  logout: (
    <>
      <path d="M15 4.5H6.5A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5H15" strokeLinecap="round" />
      <path d="M11 12h9m0 0-3.2-3.2M20 12l-3.2 3.2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  puzzle: (
    <path
      d="M9 3.5a1.6 1.6 0 0 1 3.2 0c0 .5-.3.9-.3 1.4 0 .5.4.9.9.9h1.8c.6 0 1 .4 1 1v1.8c0 .5.4.9.9.9.5 0 .9-.3 1.4-.3a1.6 1.6 0 0 1 0 3.2c-.5 0-.9-.3-1.4-.3-.5 0-.9.4-.9.9v2.3c0 .6-.4 1-1 1h-2.3c-.5 0-.9-.4-.9-.9 0-.5.3-.9.3-1.4a1.6 1.6 0 0 0-3.2 0c0 .5.3.9.3 1.4 0 .5-.4.9-.9.9H5.6c-.6 0-1-.4-1-1v-1.8c0-.5-.4-.9-.9-.9-.5 0-.9.3-1.4.3"
      strokeLinejoin="round"
    />
  ),
  lock: (
    <>
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" />
      <path d="M7.5 10.5V8a4.5 4.5 0 0 1 9 0v2.5" strokeLinecap="round" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.6" />
      <path d="m4 17 4.5-4.2 3.5 3 3-2.6 5.5 5" strokeLinejoin="round" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 6.5v4.5h-4.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 17.5V13h4.5" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M18.4 11a6.5 6.5 0 0 0-11.1-3.1L4 11M5.6 13a6.5 6.5 0 0 0 11.1 3.1L20 13"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  arrowRight: <path d="M4 12h15m0 0-6-6m6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />,
  alert: (
    <>
      <path d="M12 3.5 21 19H3z" strokeLinejoin="round" />
      <path d="M12 9.5v4M12 16.4v.1" strokeLinecap="round" />
    </>
  ),
  sticker: (
    <>
      <path
        d="M13.5 3.5H6.5A2.5 2.5 0 0 0 4 6v12a2.5 2.5 0 0 0 2.5 2.5H13l7-7V6a2.5 2.5 0 0 0-2.5-2.5Z"
        strokeLinejoin="round"
      />
      <path d="M13 20.3V15a2 2 0 0 1 2-2h5.3" strokeLinejoin="round" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 8h10M18 8h2M4 16h2M10 16h10" strokeLinecap="round" />
      <circle cx="16" cy="8" r="2.2" />
      <circle cx="8" cy="16" r="2.2" />
    </>
  ),
};

export function Icon({
  name,
  size = 20,
  ...rest
}: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}
