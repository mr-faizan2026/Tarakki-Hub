import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminData } from "@/lib/admin";
import { Card, PageHeader } from "@/components/dashboard/Card";
import { StatTile } from "@/components/dashboard/StatTile";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { PaymentStatusPill } from "@/components/admin/Pills";
import { formatDate, formatMoney, initials } from "@/lib/format";
import type { AdminUserRow, Payment } from "@/lib/supabase/types";

export const metadata: Metadata = { title: "Payments" };

export default async function AdminPaymentsPage() {
  const { db } = await requireAdminData();

  const [{ data, count }, { data: successRows }] = await Promise.all([
    db
      .from("payments")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(100),
    db.from("payments").select("amount").eq("status", "success"),
  ]);

  const payments = (data ?? []) as Payment[];
  const totalRevenue = (successRows ?? []).reduce((s, r) => s + (r.amount ?? 0), 0);

  // Resolve names for any existing rows.
  const ids = [...new Set(payments.map((p) => p.user_id))];
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Payments"
        description="Transactions across the platform. Payments are processed by Cashfree — this ledger fills in once checkout is live."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatTile
          icon="rupee"
          tone="amber"
          label="Total revenue"
          value={payments.length === 0 ? "—" : formatMoney(totalRevenue)}
          sub="Successful payments"
        />
        <StatTile
          icon="receipt"
          label="Transactions"
          value={count ?? 0}
          sub="All statuses"
        />
        <StatTile
          icon="creditCard"
          label="Gateway"
          value={<span className="text-h4">Cashfree</span>}
          sub="Not yet connected"
        />
      </div>

      {payments.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-canvas-sunk text-ink-400">
              <Icon name="receipt" size={22} />
            </span>
            <p className="mt-4 text-body font-medium text-ink-800">
              No transactions yet
            </p>
            <p className="mt-1 max-w-md text-small text-ink-500">
              Payments will show up here once Cashfree checkout is connected. We
              deliberately show no mock or sample transactions — this ledger only
              ever reflects real payments.
            </p>
            <Badge tone="outline" className="mt-4">
              Cashfree · Integration point
            </Badge>
          </div>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-hairline bg-surface">
          <div className="hidden grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_1fr] gap-4 border-b border-hairline bg-canvas-sunk/50 px-5 py-3 md:grid">
            <span className="label-mono text-ink-400">User</span>
            <span className="label-mono text-ink-400">Plan</span>
            <span className="label-mono text-right text-ink-400">Amount</span>
            <span className="label-mono text-ink-400">Status</span>
            <span className="label-mono text-ink-400">Date</span>
          </div>
          <ul>
            {payments.map((p) => {
              const u = userById.get(p.user_id);
              return (
                <li
                  key={p.id}
                  className="grid grid-cols-1 gap-2 border-b border-hairline px-5 py-4 last:border-b-0 md:grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_1fr] md:items-center md:gap-4 md:py-3.5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink-800 text-micro font-semibold text-teal-100">
                      {initials(u?.full_name, u?.email)}
                    </span>
                    <Link
                      href={`/admin/users/${p.user_id}`}
                      className="min-w-0 truncate text-small font-medium text-ink-900 hover:text-teal-700"
                    >
                      {u?.full_name || u?.email || "—"}
                    </Link>
                  </div>
                  <span className="text-small capitalize text-ink-700">
                    {p.plan || "—"}
                  </span>
                  <span className="text-right text-small font-semibold tabular-nums text-ink-900">
                    {formatMoney(p.amount, p.currency)}
                  </span>
                  <div>
                    <PaymentStatusPill status={p.status} />
                  </div>
                  <span className="text-small tabular-nums text-ink-500">
                    {formatDate(p.created_at)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <Card>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-canvas-sunk text-ink-500">
            <Icon name="shield" size={18} />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-display text-h4 font-semibold text-ink-900">
                Cashfree integration point
              </h3>
              <Badge tone="outline">Coming soon</Badge>
            </div>
            <p className="mt-1 max-w-2xl text-small text-ink-500">
              A Cashfree webhook will write each transaction into the{" "}
              <code className="text-ink-700">payments</code> table (amount, plan,
              status, reference). This page reads that table directly, so real
              transactions will appear here automatically. Nothing is charged and
              no payment data is fabricated in the meantime.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
