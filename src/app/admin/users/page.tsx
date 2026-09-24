import type { Metadata } from "next";
import { requireAdminData } from "@/lib/admin";
import { Card, PageHeader } from "@/components/dashboard/Card";
import { UserFilters } from "@/components/admin/UserFilters";
import { UsersTable } from "@/components/admin/UsersTable";
import { Pagination } from "@/components/admin/Pagination";
import type { AdminUserRow, Plan } from "@/lib/supabase/types";

export const metadata: Metadata = { title: "Users" };

const PAGE_SIZE = 20;

/** Strip characters that would break PostgREST's `.or()` / ilike filter. */
function sanitizeSearch(raw: string): string {
  return raw.replace(/[,()*%\\]/g, " ").trim().slice(0, 80);
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    plan?: string;
    status?: string;
    page?: string;
  }>;
}) {
  const { db } = await requireAdminData();
  const sp = await searchParams;

  const q = sanitizeSearch(sp.q ?? "");
  const plan = (sp.plan ?? "all").toLowerCase();
  const status = sp.status === "blocked" || sp.status === "active" ? sp.status : "all";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  // Plan names for the filter dropdown (kept in sync with the plans table).
  const { data: planRows } = await db
    .from("plans")
    .select("name")
    .order("sort_order", { ascending: true });
  const planNames = (planRows as Pick<Plan, "name">[] | null)?.map((p) => p.name) ?? [];

  let query = db
    .from("admin_users")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });

  if (q) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`);
  if (plan !== "all") query = query.eq("plan", plan);
  if (status !== "all") query = query.eq("status", status);

  const from = (page - 1) * PAGE_SIZE;
  const { data, count } = await query.range(from, from + PAGE_SIZE - 1);

  const users = (data ?? []) as AdminUserRow[];
  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Users"
        description="Every account on TarakkiHub. Search, filter, and open a user to manage their plan, credits, role, and access."
      />

      <Card padded={false} className="p-4 sm:p-5">
        <UserFilters plans={planNames} />
      </Card>

      <UsersTable users={users} />

      {total > 0 ? (
        <Pagination
          page={page}
          pageCount={pageCount}
          total={total}
          pageSize={PAGE_SIZE}
        />
      ) : null}
    </div>
  );
}
