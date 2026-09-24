import { requireAdminData } from "@/lib/admin";
import { Card } from "@/components/dashboard/Card";
import { StatTile } from "@/components/dashboard/StatTile";
import {
  RecentActivity,
  type ActivityItem,
} from "@/components/dashboard/RecentActivity";
import { Icon } from "@/components/ui/Icon";
import { formatNumber } from "@/lib/format";
import type { AdminUserRow, CreditEvent } from "@/lib/supabase/types";

export const metadata = { title: "Dashboard" };

function displayName(row?: { full_name: string | null; email: string | null }) {
  if (!row) return "A user";
  return row.full_name || row.email || "A user";
}

export default async function AdminDashboardPage() {
  const { db } = await requireAdminData();

  const [
    { count: totalUsers },
    { count: blockedUsers },
    { count: totalExports },
    { count: activeSubs },
    { data: usageRows },
    { data: recentSignups },
    { data: recentEvents },
  ] = await Promise.all([
    db.from("profiles").select("id", { count: "exact", head: true }),
    db.from("profiles").select("id", { count: "exact", head: true }).eq("status", "blocked"),
    db.from("image_exports").select("id", { count: "exact", head: true }),
    db.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "active"),
    db.from("usage").select("images_used"),
    db
      .from("admin_users")
      .select("id, full_name, email, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
    db
      .from("credit_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  const creditsUsed = (usageRows ?? []).reduce(
    (sum, r) => sum + (r.images_used ?? 0),
    0,
  );

  // Resolve names for the recent credit events (events only carry user_id).
  const events = (recentEvents ?? []) as CreditEvent[];
  const signups = (recentSignups ?? []) as Pick<
    AdminUserRow,
    "id" | "full_name" | "email" | "created_at"
  >[];

  const eventUserIds = [...new Set(events.map((e) => e.user_id))];
  const nameById = new Map<string, { full_name: string | null; email: string | null }>();
  if (eventUserIds.length > 0) {
    const { data: names } = await db
      .from("admin_users")
      .select("id, full_name, email")
      .in("id", eventUserIds);
    for (const n of names ?? []) {
      nameById.set(n.id, { full_name: n.full_name, email: n.email });
    }
  }

  const activity: ActivityItem[] = [
    ...signups.map((s) => ({
      id: `signup-${s.id}`,
      icon: "user" as const,
      text: `${displayName(s)} joined`,
      at: s.created_at,
    })),
    ...events.map((e) => ({
      id: `event-${e.id}`,
      icon: "spark" as const,
      text: `${displayName(nameById.get(e.user_id))} · ${e.action} · ${e.credits} credit${
        e.credits === 1 ? "" : "s"
      }`,
      at: e.created_at,
    })),
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 8);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="label-mono text-ink-400">Overview</p>
        <h1 className="mt-1 font-display text-h2 font-semibold tracking-[-0.02em] text-ink-900">
          Platform at a glance
        </h1>
        <p className="mt-2 max-w-xl text-body text-ink-500">
          The health of TarakkiHub — users, subscriptions, and usage. Revenue
          fills in once Cashfree billing is connected.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
        <StatTile
          icon="users"
          label="Total users"
          value={formatNumber(totalUsers ?? 0)}
          sub={
            (blockedUsers ?? 0) > 0
              ? `${formatNumber(blockedUsers ?? 0)} blocked`
              : "All active"
          }
        />
        <StatTile
          icon="refresh"
          tone="teal"
          label="Active subscriptions"
          value={formatNumber(activeSubs ?? 0)}
          sub="Cashfree-driven soon"
        />
        <StatTile
          icon="spark"
          label="Credits used"
          value={formatNumber(creditsUsed)}
          sub="All time"
        />
        <StatTile
          icon="image"
          label="Images exported"
          value={formatNumber(totalExports ?? 0)}
          sub="All time"
        />
        <StatTile
          icon="rupee"
          tone="amber"
          label="Revenue"
          value="—"
          sub="Awaiting Cashfree"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center gap-2.5">
            <Icon name="chart" size={18} className="text-ink-400" />
            <h2 className="font-display text-h4 font-semibold text-ink-900">
              Recent activity
            </h2>
          </div>
          <div className="mt-3">
            <RecentActivity items={activity} />
          </div>
        </Card>

        <Card>
          <h2 className="font-display text-h4 font-semibold text-ink-900">
            Quick links
          </h2>
          <div className="mt-4 flex flex-col gap-2">
            {[
              { href: "/admin/users", icon: "users" as const, label: "Manage users" },
              { href: "/admin/plans", icon: "layers" as const, label: "Edit plans" },
              {
                href: "/admin/credits",
                icon: "spark" as const,
                label: "Credits & usage",
              },
              {
                href: "/admin/settings",
                icon: "gear" as const,
                label: "Settings & logs",
              },
            ].map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="group flex items-center gap-3 rounded-lg border border-hairline px-3.5 py-3 transition-colors hover:border-teal-300 hover:bg-teal-50/40"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-canvas-sunk text-ink-500 group-hover:bg-teal-50 group-hover:text-teal-600">
                  <Icon name={link.icon} size={17} />
                </span>
                <span className="text-small font-medium text-ink-800">
                  {link.label}
                </span>
                <Icon
                  name="chevronRight"
                  size={16}
                  className="ml-auto text-ink-300 group-hover:text-ink-500"
                />
              </a>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
