import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminData, getStarterCredits } from "@/lib/admin";
import { Card, PageHeader } from "@/components/dashboard/Card";
import { StarterCreditsForm } from "@/components/admin/StarterCreditsForm";
import { Icon, type IconName } from "@/components/ui/Icon";
import { PAYMENTS } from "@/lib/config";
import { formatDateTime } from "@/lib/format";
import type { AdminAction, AdminUserRow } from "@/lib/supabase/types";

export const metadata: Metadata = { title: "Settings" };

type Detail = Record<string, unknown>;

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

/** Turn an admin_actions row into a human-readable line + an icon. */
function describe(
  row: AdminAction,
  targetName: string,
): { icon: IconName; text: string } {
  const d = (row.detail ?? {}) as Detail;
  switch (row.action) {
    case "plan.change":
      return { icon: "creditCard", text: `Changed ${targetName} to the ${str(d.plan)} plan` };
    case "credits.adjust":
      return {
        icon: "spark",
        text: `Adjusted ${targetName}'s credits (${str(d.from)} → ${str(d.to)})${
          d.reason ? ` — ${str(d.reason)}` : ""
        }`,
      };
    case "user.block":
      return { icon: "ban", text: `Blocked ${targetName}` };
    case "user.unblock":
      return { icon: "check", text: `Unblocked ${targetName}` };
    case "role.grant":
      return { icon: "shield", text: `Granted admin to ${targetName}` };
    case "role.revoke":
      return { icon: "shield", text: `Revoked admin from ${targetName}` };
    case "plan.create":
      return { icon: "layers", text: `Created the ${str(d.name)} plan` };
    case "plan.update":
      return { icon: "layers", text: `Updated the ${str(d.name)} plan` };
    case "plan.enable":
      return { icon: "layers", text: "Enabled a plan" };
    case "plan.disable":
      return { icon: "layers", text: "Disabled a plan" };
    case "settings.starter_credits":
      return { icon: "gear", text: `Set starter credits to ${str(d.value)}` };
    default:
      return { icon: "sliders", text: row.action };
  }
}

export default async function AdminSettingsPage() {
  const { db } = await requireAdminData();

  const [starterCredits, { count: planCount }, { data: logRows }] = await Promise.all([
    getStarterCredits(db),
    db.from("plans").select("id", { count: "exact", head: true }),
    db
      .from("admin_actions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(40),
  ]);

  const log = (logRows ?? []) as AdminAction[];

  // Resolve target user names for the log.
  const targetIds = [...new Set(log.map((r) => r.target_user_id).filter(Boolean))] as string[];
  const nameById = new Map<string, string>();
  if (targetIds.length > 0) {
    const { data: users } = await db
      .from("admin_users")
      .select("id, full_name, email")
      .in("id", targetIds);
    for (const u of (users ?? []) as Pick<AdminUserRow, "id" | "full_name" | "email">[]) {
      nameById.set(u.id, u.full_name || u.email || "a user");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Settings"
        description="Global configuration and a log of recent admin activity."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Starter credits */}
        <Card>
          <div className="flex items-center gap-2.5">
            <Icon name="spark" size={18} className="text-ink-400" />
            <h2 className="font-display text-h4 font-semibold text-ink-900">
              Starter credits
            </h2>
          </div>
          <p className="mt-1 max-w-md text-small text-ink-500">
            Free credits granted to every new account on signup. This is the
            single global default.
          </p>
          <div className="mt-4">
            <StarterCreditsForm current={starterCredits} />
          </div>
        </Card>

        {/* System */}
        <Card>
          <div className="flex items-center gap-2.5">
            <Icon name="gear" size={18} className="text-ink-400" />
            <h2 className="font-display text-h4 font-semibold text-ink-900">System</h2>
          </div>
          <dl className="mt-4 flex flex-col gap-3 text-small">
            <div className="flex items-center justify-between">
              <dt className="text-ink-500">Payment gateway</dt>
              <dd className="font-medium capitalize text-ink-800">{PAYMENTS.provider}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-ink-500">Checkout</dt>
              <dd className="flex items-center gap-1.5 font-medium text-ink-800">
                <span
                  className={`h-2 w-2 rounded-full ${
                    PAYMENTS.enabled ? "bg-teal-500" : "bg-amber-500"
                  }`}
                />
                {PAYMENTS.enabled ? "Live" : "Not connected"}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-ink-500">Plans configured</dt>
              <dd className="font-medium tabular-nums text-ink-800">{planCount ?? 0}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-ink-500">Manage plans</dt>
              <dd>
                <Link
                  href="/admin/plans"
                  className="font-medium text-teal-700 hover:text-teal-800"
                >
                  Open plans →
                </Link>
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      {/* Admin activity log */}
      <Card>
        <div className="flex items-center gap-2.5">
          <Icon name="shield" size={18} className="text-ink-400" />
          <h2 className="font-display text-h4 font-semibold text-ink-900">
            Admin activity
          </h2>
        </div>
        <p className="mt-1 text-small text-ink-500">
          Every admin action is recorded here — who did what, and when.
        </p>

        {log.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-hairline-strong px-6 py-10 text-center">
            <p className="text-small text-ink-500">
              No admin actions recorded yet. Changes you make in the panel will
              appear here.
            </p>
          </div>
        ) : (
          <ul className="mt-4 flex flex-col">
            {log.map((row, i) => {
              const { icon, text } = describe(
                row,
                row.target_user_id ? nameById.get(row.target_user_id) ?? "a user" : "",
              );
              return (
                <li
                  key={row.id}
                  className="flex items-start gap-3 py-3"
                  style={{ borderTop: i === 0 ? undefined : "1px solid var(--color-hairline)" }}
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-canvas-sunk text-ink-500">
                    <Icon name={icon} size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-small text-ink-800">{text}</p>
                    <p className="mt-0.5 text-micro text-ink-500">
                      by {row.admin_email ?? "an admin"}
                    </p>
                  </div>
                  <time className="shrink-0 text-micro tabular-nums text-ink-400">
                    {formatDateTime(row.created_at)}
                  </time>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
