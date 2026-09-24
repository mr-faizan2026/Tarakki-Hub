import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { StatusPill, RolePill, PlanPill } from "@/components/admin/Pills";
import { formatDate, initials } from "@/lib/format";
import type { AdminUserRow } from "@/lib/supabase/types";

const GRID =
  "grid-cols-[minmax(0,2.4fr)_0.9fr_0.7fr_0.7fr_0.9fr_0.9fr]";

function Avatar({ user }: { user: AdminUserRow }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink-800 text-small font-semibold text-teal-100">
      {initials(user.full_name, user.email)}
    </span>
  );
}

export function UsersTable({ users }: { users: AdminUserRow[] }) {
  if (users.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-hairline-strong px-6 py-16 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-canvas-sunk text-ink-400">
          <Icon name="users" size={20} />
        </span>
        <p className="mt-3 text-body font-medium text-ink-800">No users found</p>
        <p className="mt-1 max-w-xs text-small text-ink-500">
          No accounts match your search and filters. Try clearing them.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Desktop / tablet table */}
      <div className="hidden overflow-hidden rounded-xl border border-hairline bg-surface md:block">
        <div
          className={`grid ${GRID} gap-4 border-b border-hairline bg-canvas-sunk/50 px-5 py-3`}
        >
          <span className="label-mono text-ink-400">User</span>
          <span className="label-mono text-ink-400">Plan</span>
          <span className="label-mono text-right text-ink-400">Credits</span>
          <span className="label-mono text-right text-ink-400">Images</span>
          <span className="label-mono text-ink-400">Status</span>
          <span className="label-mono text-ink-400">Joined</span>
        </div>

        <ul>
          {users.map((u) => (
            <li key={u.id}>
              <Link
                href={`/admin/users/${u.id}`}
                className={`group grid ${GRID} items-center gap-4 border-b border-hairline px-5 py-3.5 transition-colors last:border-b-0 hover:bg-canvas-sunk/40`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar user={u} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-small font-medium text-ink-900">
                        {u.full_name || "—"}
                      </span>
                      {u.role === "admin" ? (
                        <span className="shrink-0 text-teal-600" title="Admin">
                          <Icon name="shield" size={13} />
                        </span>
                      ) : null}
                    </div>
                    <span className="truncate text-micro text-ink-500">
                      {u.email}
                    </span>
                  </div>
                </div>
                <div className="min-w-0">
                  <PlanPill plan={u.plan} />
                </div>
                <span className="text-right text-small font-semibold tabular-nums text-ink-900">
                  {u.credits_remaining}
                </span>
                <span className="text-right text-small tabular-nums text-ink-500">
                  {u.images_used}
                </span>
                <div className="min-w-0">
                  <StatusPill status={u.status} />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-small tabular-nums text-ink-500">
                    {formatDate(u.created_at)}
                  </span>
                  <Icon
                    name="chevronRight"
                    size={16}
                    className="shrink-0 text-ink-300 transition-colors group-hover:text-ink-500"
                  />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {/* Mobile cards */}
      <ul className="flex flex-col gap-3 md:hidden">
        {users.map((u) => (
          <li key={u.id}>
            <Link
              href={`/admin/users/${u.id}`}
              className="block rounded-xl border border-hairline bg-surface p-4 shadow-[0_1px_0_0_rgba(14,33,49,0.03)] transition-colors active:bg-canvas-sunk/50"
            >
              <div className="flex items-center gap-3">
                <Avatar user={u} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-small font-medium text-ink-900">
                    {u.full_name || "—"}
                  </p>
                  <p className="truncate text-micro text-ink-500">{u.email}</p>
                </div>
                <Icon name="chevronRight" size={16} className="shrink-0 text-ink-300" />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <PlanPill plan={u.plan} />
                <StatusPill status={u.status} />
                <RolePill role={u.role} />
              </div>
              <div className="mt-3 flex items-center gap-4 text-micro text-ink-500">
                <span className="tabular-nums">
                  <span className="font-semibold text-ink-800">
                    {u.credits_remaining}
                  </span>{" "}
                  credits
                </span>
                <span className="tabular-nums">
                  <span className="font-semibold text-ink-800">{u.images_used}</span>{" "}
                  images
                </span>
                <span className="ml-auto tabular-nums">{formatDate(u.created_at)}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
