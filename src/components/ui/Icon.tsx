import type { ReactElement, SVGProps } from "react";

/**
 * A small, consistent line-icon set. Stroke-based, currentColor, 24px grid.
 * No emoji anywhere on the site — these carry the meaning instead.
 */
export type IconName =
  | "bolt"
  | "template"
  | "mapping"
  | "bulk"
  | "image"
  | "draft"
  | "shipImage"
  | "label"
  | "scope"
  | "arrowRight"
  | "check"
  | "shield"
  | "rupee"
  | "spark"
  | "grid"
  | "gear"
  | "logout"
  | "menu"
  | "close"
  | "plus"
  | "trash"
  | "duplicate"
  | "edit"
  | "upload"
  | "download"
  | "chevronRight"
  | "chevronDown"
  | "puzzle"
  | "user"
  | "creditCard"
  | "sliders"
  | "sticker"
  | "users"
  | "layers"
  | "receipt"
  | "refresh"
  | "ban"
  | "search"
  | "filter"
  | "arrowLeft"
  | "chevronLeft"
  | "minus"
  | "calendar"
  | "chart"
  | "mail";

const paths: Record<IconName, ReactElement> = {
  bolt: (
    <path
      d="M13 2 4.5 13.2H11l-1 8.8L19.5 10.5H13z"
      strokeLinejoin="round"
    />
  ),
  template: (
    <>
      <rect x="3.5" y="3.5" width="10.5" height="10.5" rx="2" />
      <path d="M10 10h10.5v10.5H10z" />
    </>
  ),
  mapping: (
    <>
      <circle cx="5" cy="6" r="1.6" />
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="5" cy="18" r="1.6" />
      <circle cx="19" cy="8" r="1.6" />
      <circle cx="19" cy="16" r="1.6" />
      <path d="M6.6 6.2 17.4 7.8M6.6 12l10.8 3.4M6.6 17.8 17.4 16.4" />
    </>
  ),
  bulk: (
    <>
      <rect x="3.5" y="4" width="17" height="16" rx="2" />
      <path d="M3.5 9.5h17M3.5 15h17M9 4v16" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.6" />
      <path d="m4 17 4.5-4.2 3.5 3 3-2.6 5.5 5" strokeLinejoin="round" />
    </>
  ),
  draft: (
    <>
      <path d="M6 3h8l4 4v14H6z" strokeLinejoin="round" />
      <path d="M14 3v4h4" strokeLinejoin="round" />
      <path d="m8.5 14 2 2 4-4.2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  shipImage: (
    <>
      <rect x="3.5" y="4" width="17" height="12" rx="2" />
      <circle cx="8" cy="9" r="1.4" />
      <path d="m4 14 4-3.6 3 2.6" strokeLinejoin="round" />
      <path d="M17 15v6m0 0 2.4-2.4M17 21l-2.4-2.4" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  label: (
    <>
      <path
        d="M3.5 10.5 10.8 3.2a2 2 0 0 1 1.4-.6H19a1.6 1.6 0 0 1 1.6 1.6v6.8a2 2 0 0 1-.6 1.4l-7.3 7.3a1.6 1.6 0 0 1-2.3 0l-6.9-6.9a1.6 1.6 0 0 1 0-2.3Z"
        strokeLinejoin="round"
      />
      <circle cx="15.5" cy="8.5" r="1.3" />
    </>
  ),
  scope: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M11 4v3M11 15v3M4 11h3M15 11h3" strokeLinecap="round" />
      <circle cx="11" cy="11" r="1.6" />
      <path d="m17 17 4 4" strokeLinecap="round" />
    </>
  ),
  arrowRight: <path d="M4 12h15m0 0-6-6m6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />,
  check: (
    <path d="m4 12.5 5 5 11-11" strokeLinecap="round" strokeLinejoin="round" />
  ),
  shield: (
    <>
      <path d="M12 3 5 6v5.5c0 4.3 3 7.4 7 9 4-1.6 7-4.7 7-9V6z" strokeLinejoin="round" />
      <path d="m9 11.8 2 2 4-4.2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  rupee: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 7.5h6M9 10.5h6M9 7.5c3 0 3.6 3 0 3H9l4 6" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  spark: (
    <path
      d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"
      strokeLinecap="round"
    />
  ),
  grid: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.8" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.8" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.8" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.8" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path
        d="M12 2.5v2.2M12 19.3v2.2M4.2 7l1.9 1.1M17.9 15.9l1.9 1.1M4.2 17l1.9-1.1M17.9 8.1l1.9-1.1"
        strokeLinecap="round"
      />
    </>
  ),
  logout: (
    <>
      <path d="M15 4.5H6.5A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5H15" strokeLinecap="round" />
      <path d="M11 12h9m0 0-3.2-3.2M20 12l-3.2 3.2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />,
  close: <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />,
  plus: <path d="M12 5v14M5 12h14" strokeLinecap="round" />,
  trash: (
    <>
      <path d="M4.5 7h15M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 7l.8 12.1a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7" strokeLinejoin="round" />
    </>
  ),
  duplicate: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4H5.5A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" strokeLinejoin="round" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4L19 9l-4-4L4 16v4Z" strokeLinejoin="round" />
      <path d="m13.5 6.5 4 4" />
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
  chevronRight: <path d="m9 5 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />,
  chevronDown: <path d="m5 9 7 7 7-7" strokeLinecap="round" strokeLinejoin="round" />,
  puzzle: (
    <path
      d="M9 3.5a1.6 1.6 0 0 1 3.2 0c0 .5-.3.9-.3 1.4 0 .5.4.9.9.9h1.8c.6 0 1 .4 1 1v1.8c0 .5.4.9.9.9.5 0 .9-.3 1.4-.3a1.6 1.6 0 0 1 0 3.2c-.5 0-.9-.3-1.4-.3-.5 0-.9.4-.9.9v2.3c0 .6-.4 1-1 1h-2.3c-.5 0-.9-.4-.9-.9 0-.5.3-.9.3-1.4a1.6 1.6 0 0 0-3.2 0c0 .5.3.9.3 1.4 0 .5-.4.9-.9.9H5.6c-.6 0-1-.4-1-1v-1.8c0-.5-.4-.9-.9-.9-.5 0-.9.3-1.4.3"
      strokeLinejoin="round"
    />
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 19.5a7 7 0 0 1 14 0" strokeLinecap="round" />
    </>
  ),
  creditCard: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="M3 9.5h18M6.5 14.5h4" strokeLinecap="round" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 8h10M18 8h2M4 16h2M10 16h10" strokeLinecap="round" />
      <circle cx="16" cy="8" r="2.2" />
      <circle cx="8" cy="16" r="2.2" />
    </>
  ),
  sticker: (
    <>
      <path d="M13.5 3.5H6.5A2.5 2.5 0 0 0 4 6v12a2.5 2.5 0 0 0 2.5 2.5H13l7-7V6a2.5 2.5 0 0 0-2.5-2.5Z" strokeLinejoin="round" />
      <path d="M13 20.3V15a2 2 0 0 1 2-2h5.3" strokeLinejoin="round" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" strokeLinecap="round" />
      <path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M17.5 19.5a5.5 5.5 0 0 0-2.4-4.5" strokeLinecap="round" />
    </>
  ),
  layers: (
    <>
      <path d="M12 3 3.5 7.2 12 11.4l8.5-4.2z" strokeLinejoin="round" />
      <path d="m3.5 12 8.5 4.2 8.5-4.2M3.5 16.8 12 21l8.5-4.2" strokeLinejoin="round" />
    </>
  ),
  receipt: (
    <>
      <path d="M5 3.5h14v17l-2.3-1.4-2.4 1.4-2.3-1.4L9.7 20.5 7.3 19.1 5 20.5z" strokeLinejoin="round" />
      <path d="M8.5 8h7M8.5 12h7M8.5 15.5h4" strokeLinecap="round" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 6.5v4.5h-4.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 17.5V13h4.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18.4 11a6.5 6.5 0 0 0-11.1-3.1L4 11M5.6 13a6.5 6.5 0 0 0 11.1 3.1L20 13" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  ban: (
    <>
      <circle cx="12" cy="12" r="8.2" />
      <path d="m6.4 6.4 11.2 11.2" strokeLinecap="round" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 4 4" strokeLinecap="round" />
    </>
  ),
  filter: (
    <path d="M4 5.5h16l-6.2 7.4v5.1l-3.6 1.8v-6.9z" strokeLinecap="round" strokeLinejoin="round" />
  ),
  arrowLeft: <path d="M20 12H5m0 0 6-6m-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />,
  chevronLeft: <path d="m15 5-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />,
  minus: <path d="M5 12h14" strokeLinecap="round" />,
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" strokeLinecap="round" />
    </>
  ),
  chart: (
    <>
      <path d="M4 4v15.5a.5.5 0 0 0 .5.5H20" strokeLinecap="round" />
      <path d="M8 15.5v-3M12 15.5V8M16 15.5v-5" strokeLinecap="round" />
    </>
  ),
  mail: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <path d="m4.5 7 7.5 6 7.5-6" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
};

export function Icon({
  name,
  size = 22,
  className,
  ...rest
}: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
      className={className}
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}
