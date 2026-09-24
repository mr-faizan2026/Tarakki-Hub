import { loadAccount } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/dashboard/Card";
import { StatTile } from "@/components/dashboard/StatTile";
import { LicenseCard } from "@/components/dashboard/LicenseCard";
import { ChromeExtensionCard } from "@/components/dashboard/ChromeExtensionCard";
import {
  RecentActivity,
  type ActivityItem,
} from "@/components/dashboard/RecentActivity";
import { Icon } from "@/components/ui/Icon";
import { firstName, titleCase } from "@/lib/format";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function OverviewPage() {
  const { user, profile, usage } = await loadAccount();
  const supabase = await createClient();

  const { data: recentEvents } = await supabase
    .from("credit_events")
    .select("id, action, credits, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(6);

  const activity: ActivityItem[] = (recentEvents ?? []).map((e) => ({
    id: `credit-${e.id}`,
    icon: "spark" as const,
    text: `${e.action} · ${e.credits} credit${e.credits === 1 ? "" : "s"}`,
    at: e.created_at,
  }));

  const planActive = profile.plan.toLowerCase() !== "free";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="label-mono text-ink-400">{greeting()}</p>
        <h1 className="mt-1 font-display text-h2 font-semibold tracking-[-0.02em] text-ink-900">
          Welcome back, {firstName(profile.full_name)}
        </h1>
        <p className="mt-2 max-w-xl text-body text-ink-500">
          Your account, credits and plan live here. The seller tools run in the
          Chrome extension.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatTile
          icon="creditCard"
          label="Current plan"
          value={titleCase(profile.plan)}
          sub="Pricing launching soon"
        />
        <StatTile
          icon="spark"
          tone={usage.credits_remaining <= 1 ? "amber" : "teal"}
          label="Credits remaining"
          value={usage.credits_remaining}
          sub={
            usage.credits_remaining === 0
              ? "Out of credits"
              : "Used inside the extension"
          }
        />
        <StatTile
          icon="sliders"
          label="Credits used"
          value={usage.images_used}
          sub="This period"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center gap-2.5">
            <Icon name="spark" size={18} className="text-ink-400" />
            <h2 className="font-display text-h4 font-semibold text-ink-900">
              Recent activity
            </h2>
          </div>
          <div className="mt-3">
            <RecentActivity items={activity} />
          </div>
        </Card>

        <div className="flex flex-col gap-6">
          <LicenseCard plan={profile.plan} active={planActive} />
          <ChromeExtensionCard />
        </div>
      </div>
    </div>
  );
}
