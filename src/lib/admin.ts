import "server-only";

import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database, Profile } from "@/lib/supabase/types";

export type AdminIdentity = { user: User; profile: Profile };

/**
 * The single source of truth for "is the caller an admin right now".
 *
 * Reads the caller's own profile through the *cookie-bound* server client
 * (so it's subject to the caller's session + RLS — a client can never spoof
 * this), then checks the role and block status. Returns the identity when the
 * caller is a live admin, otherwise `null`. Never uses the service role — this
 * is the gate that decides whether the service role is allowed to run at all.
 */
export async function getAdminIdentity(): Promise<AdminIdentity | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) return null;
  if (profile.status === "blocked") return null;
  if (profile.role !== "admin") return null;

  return { user, profile };
}

/**
 * Page/layout guard. Redirects away anyone who isn't a live admin:
 *   • no session      → /login
 *   • blocked account → /blocked
 *   • not an admin     → /dashboard
 * Returns the admin identity for the rest of the render.
 */
export async function requireAdmin(): Promise<AdminIdentity> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.status === "blocked") redirect("/blocked");
  if (!profile || profile.role !== "admin") redirect("/dashboard");

  return { user, profile };
}

/**
 * Page data guard: enforces admin (redirecting non-admins) and then hands back
 * the privileged service-role client for reads. Use at the top of every admin
 * page that needs to read cross-user data.
 */
export async function requireAdminData(): Promise<
  AdminIdentity & { db: SupabaseClient<Database> }
> {
  const { user, profile } = await requireAdmin();
  return { user, profile, db: createAdminClient() };
}

export type AdminActionError = { ok: false; error: string };

/**
 * Server-action guard. Re-checks admin status on every mutation and, only then,
 * hands back the privileged service-role client. Returns a typed error result
 * when the caller isn't an admin so the action can bail cleanly.
 *
 * Usage:
 *   const gate = await authorizeAdminAction();
 *   if (!gate.ok) return gate;              // { ok: false, error }
 *   const { admin, db } = gate;             // proceed with the service role
 */
export async function authorizeAdminAction(): Promise<
  | { ok: true; admin: AdminIdentity; db: SupabaseClient<Database> }
  | AdminActionError
> {
  const admin = await getAdminIdentity();
  if (!admin) {
    return { ok: false, error: "You don't have permission to do that." };
  }
  return { ok: true, admin, db: createAdminClient() };
}

/** Read the numeric starter-credit setting (falls back to 3 like the DB). */
export async function getStarterCredits(
  db: SupabaseClient<Database>,
): Promise<number> {
  const { data } = await db
    .from("app_settings")
    .select("value")
    .eq("key", "starter_credits")
    .maybeSingle();
  const raw = data?.value;
  const n = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) ? n : 3;
}

/**
 * Append one row to the admin_actions audit log. Best-effort — a logging
 * failure must never block the actual mutation, so errors are swallowed.
 */
export async function logAdminAction(
  db: SupabaseClient<Database>,
  admin: AdminIdentity,
  action: string,
  targetUserId: string | null,
  detail: Record<string, unknown> = {},
): Promise<void> {
  try {
    await db.from("admin_actions").insert({
      admin_id: admin.user.id,
      admin_email: admin.user.email ?? null,
      action,
      target_user_id: targetUserId,
      detail: detail as Database["public"]["Tables"]["admin_actions"]["Insert"]["detail"],
    });
  } catch {
    // Non-fatal: the audit log is a convenience, not a correctness guarantee.
  }
}
