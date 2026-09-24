import type { IconName } from "@/components/ui/Icon";

export type NavItem = {
  label: string;
  href: string;
  icon: IconName;
  /** Match sub-routes too (e.g. /dashboard/billing/...). */
  match: (pathname: string) => boolean;
};

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Overview",
    href: "/dashboard",
    icon: "grid",
    match: (p) => p === "/dashboard",
  },
  {
    label: "Credits",
    href: "/dashboard/credits",
    icon: "spark",
    match: (p) => p.startsWith("/dashboard/credits"),
  },
  {
    label: "Billing & Plan",
    href: "/dashboard/billing",
    icon: "creditCard",
    match: (p) => p.startsWith("/dashboard/billing"),
  },
  {
    label: "Settings",
    href: "/dashboard/settings",
    icon: "gear",
    match: (p) => p.startsWith("/dashboard/settings"),
  },
];

export function activeNav(pathname: string): NavItem | undefined {
  // Longest, most-specific match wins so /dashboard doesn't shadow children.
  return [...NAV_ITEMS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => item.match(pathname));
}
