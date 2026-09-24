import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminData } from "@/lib/admin";
import { Card, PageHeader } from "@/components/dashboard/Card";
import { StatTile } from "@/components/dashboard/StatTile";
import { Icon } from "@/components/ui/Icon";
import { formatNumber, initials, relativeTime } from "@/lib/format";
import type { AdminUserRow, CreditEvent } from "@/lib/supabase/types";

export const metadata: Metadata = { title: "Credits & Usage" };

function displayName(row?: { full_name: string | null; email: string | null }) {
  if (!row) return "A user";
  return row.full_name || row.email || "A user";
}

/** ISO timestamp N days before now (kept out of the component body so the
 * render stays pure per the react-hooks/purity lint rule). */
function daysAgoISO(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export default async function AdminCreditsPage() {
  const { db } = await requireAdminData();

  const sevenDaysAgo = daysAgoISO(7);

  const [
    { data: usageRows },
    { count: totalExports },
    { count: exports7d },
    { data: topUsers },
    { data: recentEvents },
  ] = await Promise.all([
    db.from("usage").select("credits_remaining, images_used"),
    db.from("image_exports").select("id", { count: "exact", head: true }),
    db
      .from("image_exports")
      .select("id", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgo),
    db
      .from("admin_users")
      .select("id, full_name, email, plan, images_used, credits_remaining")
      .order("images_used", { ascending: false })
      .limit(8),
    db
      .from("credit_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(15),
  ]);

  const creditsUsed = (usageRows ?? []).reduce((s, r) => s + (r.images_used ?? 0), 0);
  const creditsRemaining = (usageRows ?? []).reduce(
    (s, r) => s + (r.credits_remaining ?? 0),
    0,
  );

  const top = (topUsers ?? []) as Pick<
    AdminUserRow,
    "id" | "full_name" | "email" | "plan" | "images_used" | "credits_remaining"
  >[];
  const events = (recentEvents ?? []) as CreditEvent[];

  // Resolve names for the recent events.
  const ids = [...new Set(events.map((e) => e.user_id))];
  const nameById = new Map<string, { full_name: string | null; email: string | null }>();
  if (ids.length > 0) {
    const { data: names } = await db
      .from("admin_users")
      .select("id, full_name, email")
      .in("id", ids);
    for (const n of names ?? []) {
      nameById.set(n.id, { full_name: n.full_name, email: n.email });
    }
  }

  const maxUsed = Math.max(1, ...top.map((u) => u.images_used));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Credits & Usage"
        description="How credits are being consumed across all accounts. Spends are logged by the Chrome extension in real time."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          icon="spark"
          tone="teal"
          label="Credits used"
          value={formatNumber(creditsUsed)}
          sub="All accounts, all time"
        />
        <StatTile
          icon="sliders"
          label="Credits remaining"
          value={formatNumber(creditsRemaining)}
          sub="Across all accounts"
        />
        <StatTile
          icon="image"
          label="Images exported"
          value={formatNumber(totalExports ?? 0)}
          sub="All time"
        />
        <StatTile
          icon="calendar"
          label="Exports · 7 days"
          value={formatNumber(exports7d ?? 0)}
          sub="Last week"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top consumers */}
        <Card>
          <div className="flex items-center gap-2.5">
            <Icon name="chart" size={18} className="text-ink-400" />
            <h2 className="font-display text-h4 font-semibold text-ink-900">
              Top consumers
            </h2>
          </div>
          {top.length === 0 ? (
            <p className="mt-4 text-small text-ink-500">No usage yet.</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {top.map((u) => (
                <li key={u.id}>
                  <Link
                    href={`/admin/users/${u.id}`}
                    className="group flex items-center gap-3"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink-800 text-micro font-semibold text-teal-100">
                      {initials(u.full_name, u.email)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-small font-medium text-ink-900 group-hover:text-teal-700">
                          {displayName(u)}
                        </span>
                        <span className="shrink-0 text-small font-semibold tabular-nums text-ink-900">
                          {formatNumber(u.images_used)}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-hairline-strong">
                        <div
                          className="h-full rounded-full bg-teal-500"
                          style={{ width: `${(u.images_used / maxUsed) * 100}%` }}
                        />
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Recent usage */}
        <Card>
          <div className="flex items-center gap-2.5">
            <Icon name="spark" size={18} className="text-ink-400" />
            <h2 className="font-display text-h4 font-semibold text-ink-900">
              Recent credit usage
            </h2>
          </div>
          {events.length === 0 ? (
            <p className="mt-4 text-small text-ink-500">
              No credit spends recorded yet.
            </p>
          ) : (
            <ul className="mt-4 flex flex-col">
              {events.map((e, i) => (
                <li
                  key={e.id}
                  className="flex items-center gap-3 py-2.5"
                  style={{ borderTop: i === 0 ? undefined : "1px solid var(--color-hairline)" }}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-canvas-sunk text-ink-500">
                    <Icon name="spark" size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-small text-ink-800">
                      <Link
                        href={`/admin/users/${e.user_id}`}
                        className="font-medium hover:text-teal-700"
                      >
                        {displayName(nameById.get(e.user_id))}
                      </Link>{" "}
                      <span className="text-ink-500">· {e.action}</span>
                    </p>
                  </div>
                  <span className="shrink-0 text-small font-semibold tabular-nums text-ink-900">
                    −{e.credits}
                  </span>
                  <time className="w-16 shrink-0 text-right text-micro tabular-nums text-ink-400">
                    {relativeTime(e.created_at)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
