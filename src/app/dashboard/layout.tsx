import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DashboardChrome } from "@/components/dashboard/DashboardChrome";
import { loadAccount, creditsTotal } from "@/lib/account";

export const metadata: Metadata = {
  title: { default: "Dashboard", template: "%s · Tarakki Hub" },
  robots: { index: false, follow: false },
};

// The session is per-request; never statically cache the dashboard shell.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { user, profile, usage } = await loadAccount();

  return (
    <DashboardChrome
      fullName={profile.full_name}
      email={user.email ?? null}
      plan={profile.plan}
      isAdmin={profile.role === "admin"}
      creditsRemaining={usage.credits_remaining}
      creditsTotal={creditsTotal(usage)}
    >
      {children}
    </DashboardChrome>
  );
}
