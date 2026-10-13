import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DashboardChrome } from "@/components/dashboard/DashboardChrome";
import { loadAccount, creditsTotal, accessStatus } from "@/lib/account";

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
  // Resolved here rather than in the sidebar: accessStatus is server-only, and
  // a client component deriving the rule again is how the four surfaces
  // disagreed in the first place.
  const access = accessStatus(profile, usage);

  return (
    <DashboardChrome
      fullName={profile.full_name}
      email={user.email ?? null}
      planLabel={access.label}
      isAdmin={profile.role === "admin"}
      creditsRemaining={usage.credits_remaining}
      creditsTotal={creditsTotal(usage)}
      paidUntil={access.until}
    >
      {children}
    </DashboardChrome>
  );
}
