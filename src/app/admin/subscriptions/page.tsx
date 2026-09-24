import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminData } from "@/lib/admin";
import { Card, PageHeader } from "@/components/dashboard/Card";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { SubStatusPill } from "@/components/admin/Pills";
import { formatDate, initials, titleCase } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { AdminUserRow, Subscription } from "@/lib/supabase/types";

export const metadata: Metadata = { title: "Subscriptions" };

const STATUSES = ["all", "active", "expired", "cancelled"] as const;
type StatusFilter = (typeof STATUSES)[number];

export default async function AdminSubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { db } = await requireAdminData();
  const sp = await searchParams;
  const status: StatusFilter = STATUSES.includes(sp.status as StatusFilter)
    ? (sp.status as StatusFilter)
    : "all";

  const [{ count: active }, { count: expired }, { count: cancelled }] =
    await Promise.all([
      db.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "active"),
      db.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "expired"),
      db
        .from("subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("status", "cancelled"),
    ]);

  let query = db
    .from("subscriptions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (status !== "all") query = query.eq("status", status);
  const { data } = await query;
  const subs = (data ?? []) as Subscription[];

  // Resolve user names.
  const ids = [...new Set(subs.map((s) => s.user_id))];
  const userById = new Map<string, Pick<AdminUserRow, "full_name" | "email">>();
  if (ids.length > 0) {
    const { data: users } = await db
      .from("admin_users")
      .select("id, full_name, email")
      .in("id", ids);
    for (const u of users ?? []) {
      userById.set(u.id, { full_name: u.full_name, email: u.email });
    }
  }

  const counts: Record<StatusFilter, number> = {
    all: (active ?? 0) + (expired ?? 0) + (cancelled ?? 0),
    active: active ?? 0,
    expired: expired ?? 0,
    cancelled: cancelled ?? 0,
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Subscriptions"
        description="Subscriptions across the platform. These will be created and updated automatically by Cashfree webhooks once billing is connected."
      />

      {/* Status tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={s === "all" ? "/admin/subscriptions" : `/admin/subscriptions?status=${s}`}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-small font-medium ring-1 ring-inset transition-colors",
              status === s
                ? "bg-ink-800 text-white ring-transparent"
                : "bg-surface text-ink-600 ring-hairline-strong hover:border-ink-300 hover:text-ink-900",
            )}
          >
            {titleCase(s)}
            <span
              className={cn(
                "rounded-full px-1.5 text-micro tabular-nums",
                status === s ? "bg-white/15 text-white" : "bg-canvas-sunk text-ink-500",
              )}
            >
              {counts[s]}
            </span>
          </Link>
        ))}
      </div>

      {subs.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-canvas-sunk text-ink-400">
              <Icon name="refresh" size={22} />
            </span>
            <p className="mt-4 text-body font-medium text-ink-800">
              No subscriptions yet
            </p>
            <p className="mt-1 max-w-md text-small text-ink-500">
              Subscription records appear here once a user completes checkout.
              This screen is wired to read live data — it just has nothing to show
              until Cashfree billing is connected.
            </p>
            <Badge tone="outline" className="mt-4">
              Cashfree · Integration point
            </Badge>
          </div>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-hairline bg-surface">
          {/* header (md+) */}
          <div className="hidden grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_1fr] gap-4 border-b border-hairline bg-canvas-sunk/50 px-5 py-3 md:grid">
            <span className="label-mono text-ink-400">User</span>
            <span className="label-mono text-ink-400">Plan</span>
            <span className="label-mono text-ink-400">Status</span>
            <span className="label-mono text-ink-400">Started</span>
            <span className="label-mono text-ink-400">Renews</span>
          </div>
          <ul>
            {subs.map((s) => {
              const u = userById.get(s.user_id);
              return (
                <li key={s.id}>
                  <Link
                    href={`/admin/users/${s.user_id}`}
                    className="grid grid-cols-1 gap-2 border-b border-hairline px-5 py-4 transition-colors last:border-b-0 hover:bg-canvas-sunk/40 md:grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_1fr] md:items-center md:gap-4 md:py-3.5"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink-800 text-micro font-semibold text-teal-100">
                        {initials(u?.full_name, u?.email)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-small font-medium text-ink-900">
                          {u?.full_name || "—"}
                        </p>
                        <p className="truncate text-micro text-ink-500">{u?.email}</p>
                      </div>
                    </div>
                    <span className="text-small font-medium capitalize text-ink-800">
                      {s.plan}
                    </span>
                    <div>
                      <SubStatusPill status={s.status} />
                    </div>
                    <span className="text-small tabular-nums text-ink-500">
                      {formatDate(s.started_at)}
                    </span>
                    <span className="text-small tabular-nums text-ink-500">
                      {s.renewal_at ? formatDate(s.renewal_at) : "—"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Integration point */}
      <Card>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-canvas-sunk text-ink-500">
            <Icon name="refresh" size={18} />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-display text-h4 font-semibold text-ink-900">
                Cashfree integration point
              </h3>
              <Badge tone="outline">Coming soon</Badge>
            </div>
            <p className="mt-1 max-w-2xl text-small text-ink-500">
              When billing goes live, a Cashfree webhook handler will insert and
              update rows in the <code className="text-ink-700">subscriptions</code>{" "}
              table (active on payment, expired at period end, cancelled on
              cancellation). This page already reads that table, so it will fill
              in automatically — no mock data is shown in the meantime.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
