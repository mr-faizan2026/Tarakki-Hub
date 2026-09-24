import type { IconName } from "@/components/ui/Icon";

export type AdminNavItem = {
  label: string;
  href: string;
  icon: IconName;
  /** Match sub-routes too (e.g. /admin/users/<id>). */
  match: (pathname: string) => boolean;
};

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  {
    label: "Dashboard",
    href: "/admin",
    icon: "grid",
    match: (p) => p === "/admin",
  },
  {
    label: "Users",
    href: "/admin/users",
    icon: "users",
    match: (p) => p.startsWith("/admin/users"),
  },
  {
    label: "Plans",
    href: "/admin/plans",
    icon: "layers",
    match: (p) => p.startsWith("/admin/plans"),
  },
  {
    label: "Subscriptions",
    href: "/admin/subscriptions",
    icon: "refresh",
    match: (p) => p.startsWith("/admin/subscriptions"),
  },
  {
    label: "Credits & Usage",
    href: "/admin/credits",
    icon: "spark",
    match: (p) => p.startsWith("/admin/credits"),
  },
  {
    label: "Payments",
    href: "/admin/payments",
    icon: "receipt",
    match: (p) => p.startsWith("/admin/payments"),
  },
  {
    label: "Settings",
    href: "/admin/settings",
    icon: "gear",
    match: (p) => p.startsWith("/admin/settings"),
  },
];

export function activeAdminNav(pathname: string): AdminNavItem | undefined {
  // Longest, most-specific match wins so /admin doesn't shadow its children.
  return [...ADMIN_NAV_ITEMS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => item.match(pathname));
}
