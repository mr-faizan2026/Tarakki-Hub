import type { Metadata } from "next";
import { loadAccount } from "@/lib/account";
import { Card, PageHeader } from "@/components/dashboard/Card";
import { ProfileForm } from "@/components/settings/ProfileForm";
import { ChangePasswordForm } from "@/components/settings/ChangePasswordForm";
import { Icon } from "@/components/ui/Icon";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { user, profile } = await loadAccount();
  const email = user.email ?? "";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Settings"
        description="Manage your profile, password and session."
      />

      <Card>
        <h2 className="font-display text-h4 font-semibold text-ink-900">Profile</h2>
        <p className="mt-1 text-small text-ink-500">
          Member since {formatDate(profile.created_at)}.
        </p>
        <div className="mt-5">
          <ProfileForm initialName={profile.full_name ?? ""} email={email} />
        </div>
      </Card>

      <Card>
        <h2 className="font-display text-h4 font-semibold text-ink-900">
          Change password
        </h2>
        <p className="mt-1 text-small text-ink-500">
          Choose a strong password you don&apos;t use anywhere else.
        </p>
        <div className="mt-5">
          <ChangePasswordForm email={email} />
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-h4 font-semibold text-ink-900">
              Session
            </h2>
            <p className="mt-1 text-small text-ink-500">
              Signed in as {email}. Sign out on this device.
            </p>
          </div>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="inline-flex h-10 items-center gap-2 rounded-md border border-hairline-strong bg-surface px-4 text-small font-medium text-ink-800 transition-colors hover:border-ink-300"
            >
              <Icon name="logout" size={17} />
              Sign out
            </button>
          </form>
        </div>
      </Card>
    </div>
  );
}
