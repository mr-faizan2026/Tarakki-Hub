import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminChrome } from "@/components/admin/AdminChrome";
import { requireAdmin } from "@/lib/admin";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin · Tarakki Hub" },
  robots: { index: false, follow: false },
};

// Admin data is per-request and privileged; never statically cache the shell.
export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Airtight gate: no session → /login, blocked → /blocked, non-admin →
  // /dashboard. Every page below this layout is guaranteed an admin caller.
  const { user, profile } = await requireAdmin();

  return (
    <AdminChrome fullName={profile.full_name} email={user.email ?? null}>
      {children}
    </AdminChrome>
  );
}
