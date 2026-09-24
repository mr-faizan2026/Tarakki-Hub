import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminData } from "@/lib/admin";
import { Card } from "@/components/dashboard/Card";
import { StatTile } from "@/components/dashboard/StatTile";
import { CreditLog } from "@/components/credits/CreditLog";
import { UserActions } from "@/components/admin/UserActions";
import { StatusPill, RolePill, PlanPill } from "@/components/admin/Pills";
import { Icon } from "@/components/ui/Icon";
import { formatDate, formatDateTime, initials } from "@/lib/format";
import type {
  AdminUserRow,
  CreditEvent,
  Plan,
  Subscription,
} from "@/lib/supabase/types";

export const metadata: Metadata = { title: "User detail" };

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user: adminUser, db } = await requireAdminData();

  const { data: userData } = await db
    .from("admin_users")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!userData) notFound();
  const u = userData as AdminUserRow;

  const [
    { data: events },
    { count: exportCount },
    { data: planRows },
    { data: subRows },
  ] = await Promise.all([
    db
      .from("credit_events")
      .select("*")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(12),
    db
      .from("image_exports")
      .select("id", { count: "exact", head: true })
      .eq("user_id", id),
    db.from("plans").select("name").order("sort_order", { ascending: true }),
    db
      .from("subscriptions")
      .select("*")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const creditEvents = (events ?? []) as CreditEvent[];
  const planNames = (planRows as Pick<Plan, "name">[] | null)?.map((p) => p.name) ?? [];
  const subscription = (subRows as Subscription[] | null)?.[0] ?? null;
  const isSelf = u.id === adminUser.id;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/users"
        className="inline-flex w-fit items-center gap-1.5 text-small font-medium text-ink-500 transition-colors hover:text-ink-800"
      >
        <Icon name="arrowLeft" size={16} />
        All users
      </Link>

      {/* Identity header */}
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-ink-800 text-h4 font-semibold text-teal-100">
              {initials(u.full_name, u.email)}
            </span>
            <div className="min-w-0">
              <h1 className="truncate font-display text-h3 font-semibold text-ink-900">
                {u.full_name || "Unnamed user"}
              </h1>
              <p className="mt-0.5 flex items-center gap-1.5 truncate text-small text-ink-500">
                <Icon name="mail" size={14} className="shrink-0 text-ink-400" />
                {u.email}
                {isSelf ? (
                  <span className="ml-1 rounded-full bg-canvas-sunk px-2 py-0.5 text-micro font-medium text-ink-500">
                    You
                  </span>
                ) : null}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <PlanPill plan={u.plan} />
            <StatusPill status={u.status} />
            <RolePill role={u.role} />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-hairline pt-5 text-small sm:grid-cols-4">
          <div>
            <p className="label-mono text-ink-400">Joined</p>
            <p className="mt-1 font-medium text-ink-800">{formatDate(u.created_at)}</p>
          </div>
          <div>
            <p className="label-mono text-ink-400">Last sign-in</p>
            <p className="mt-1 font-medium text-ink-800">
              {u.last_sign_in_at ? formatDate(u.last_sign_in_at) : "Never"}
            </p>
          </div>
          <div>
            <p className="label-mono text-ink-400">Exports</p>
            <p className="mt-1 font-medium tabular-nums text-ink-800">
              {exportCount ?? 0}
            </p>
          </div>
          <div className="min-w-0">
            <p className="label-mono text-ink-400">User ID</p>
            <p className="mt-1 truncate font-mono text-micro text-ink-500" title={u.id}>
              {u.id}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatTile
          icon="spark"
          tone={u.credits_remaining <= 1 ? "amber" : "teal"}
          label="Credits remaining"
          value={u.credits_remaining}
        />
        <StatTile icon="sliders" label="Credits used" value={u.images_used} />
        <StatTile
          icon="creditCard"
          label="Plan"
          value={<span className="capitalize">{u.plan}</span>}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* Admin actions */}
        <Card>
          <div className="flex items-center gap-2.5">
            <Icon name="sliders" size={18} className="text-ink-400" />
            <h2 className="font-display text-h4 font-semibold text-ink-900">
              Admin actions
            </h2>
          </div>
          <p className="mt-1 text-small text-ink-500">
            Changes take effect immediately and are recorded in the admin log.
          </p>
          <div className="mt-5 border-t border-hairline pt-5">
            <UserActions
              userId={u.id}
              isSelf={isSelf}
              currentPlan={u.plan}
              currentStatus={u.status}
              currentRole={u.role}
              currentCredits={u.credits_remaining}
              plans={planNames}
            />
          </div>
        </Card>

        {/* Side column */}
        <div className="flex flex-col gap-6">
          <Card>
            <h2 className="font-display text-h4 font-semibold text-ink-900">
              Subscription
            </h2>
            {subscription ? (
              <dl className="mt-4 flex flex-col gap-2.5 text-small">
                <div className="flex items-center justify-between">
                  <dt className="text-ink-500">Plan</dt>
                  <dd className="font-medium capitalize text-ink-800">
                    {subscription.plan}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-ink-500">Status</dt>
                  <dd className="font-medium capitalize text-ink-800">
                    {subscription.status}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-ink-500">Renews</dt>
                  <dd className="font-medium text-ink-800">
                    {subscription.renewal_at
                      ? formatDate(subscription.renewal_at)
                      : "—"}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-3 text-small text-ink-500">
                No subscription record yet. These will populate once Cashfree
                billing is connected.
              </p>
            )}
          </Card>

          <Card>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-h4 font-semibold text-ink-900">
                Recent credit usage
              </h2>
              {creditEvents.length > 0 ? (
                <span className="text-small text-ink-400">Last {creditEvents.length}</span>
              ) : null}
            </div>
            <div className="mt-4">
              <CreditLog events={creditEvents} />
            </div>
          </Card>
        </div>
      </div>

      <p className="text-micro text-ink-400">
        Member since {formatDateTime(u.created_at)}.
      </p>
    </div>
  );
}
