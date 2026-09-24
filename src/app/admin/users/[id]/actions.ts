"use server";

import { revalidatePath } from "next/cache";
import { authorizeAdminAction, logAdminAction } from "@/lib/admin";

type Result = { ok: true } | { ok: false; error: string };

const MAX_CREDITS = 1_000_000;

function revalidateUser(id: string) {
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${id}`);
  revalidatePath("/admin");
}

/** Change a user's plan (Free / Pro / Business / …). */
export async function setUserPlan(userId: string, plan: string): Promise<Result> {
  const gate = await authorizeAdminAction();
  if (!gate.ok) return gate;
  const { admin, db } = gate;

  const value = plan.trim();
  if (!value) return { ok: false, error: "Pick a plan." };

  // Only allow plans that actually exist.
  const { data: planRow } = await db
    .from("plans")
    .select("name")
    .ilike("name", value)
    .maybeSingle();
  if (!planRow) return { ok: false, error: "That plan doesn't exist." };

  const { error } = await db
    .from("profiles")
    .update({ plan: planRow.name.toLowerCase() })
    .eq("id", userId);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(db, admin, "plan.change", userId, { plan: planRow.name });
  revalidateUser(userId);
  return { ok: true };
}

/**
 * Adjust a user's credit balance. `mode: "set"` overwrites the balance,
 * `mode: "add"` increments it (a negative amount deducts). A short reason is
 * required and recorded in the admin audit log.
 */
export async function adjustUserCredits(
  userId: string,
  mode: "add" | "set",
  amount: number,
  reason: string,
): Promise<Result> {
  const gate = await authorizeAdminAction();
  if (!gate.ok) return gate;
  const { admin, db } = gate;

  if (!Number.isFinite(amount) || !Number.isInteger(amount)) {
    return { ok: false, error: "Enter a whole number." };
  }
  const note = reason.trim();
  if (!note) return { ok: false, error: "Add a short reason for this change." };
  if (note.length > 140) return { ok: false, error: "Reason is too long." };

  // Read the current balance (row may not exist for a pre-trigger account).
  const { data: usage } = await db
    .from("usage")
    .select("credits_remaining")
    .eq("user_id", userId)
    .maybeSingle();

  const current = usage?.credits_remaining ?? 0;
  const next = mode === "set" ? amount : current + amount;

  if (next < 0) return { ok: false, error: "That would drop credits below zero." };
  if (next > MAX_CREDITS) return { ok: false, error: "That's above the maximum." };

  const { error } = await db
    .from("usage")
    .upsert({ user_id: userId, credits_remaining: next }, { onConflict: "user_id" });
  if (error) return { ok: false, error: error.message };

  await logAdminAction(db, admin, "credits.adjust", userId, {
    mode,
    amount,
    from: current,
    to: next,
    reason: note,
  });
  revalidateUser(userId);
  return { ok: true };
}

/** Block or unblock a user. A blocked user can't sign in or spend credits. */
export async function setUserBlocked(
  userId: string,
  blocked: boolean,
): Promise<Result> {
  const gate = await authorizeAdminAction();
  if (!gate.ok) return gate;
  const { admin, db } = gate;

  if (userId === admin.user.id) {
    return { ok: false, error: "You can't block your own account." };
  }

  const { error } = await db
    .from("profiles")
    .update({ status: blocked ? "blocked" : "active" })
    .eq("id", userId);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(db, admin, blocked ? "user.block" : "user.unblock", userId, {});
  revalidateUser(userId);
  return { ok: true };
}

/** Grant or revoke admin. Guarded so you can't lock everyone out. */
export async function setUserRole(
  userId: string,
  role: "admin" | "user",
): Promise<Result> {
  const gate = await authorizeAdminAction();
  if (!gate.ok) return gate;
  const { admin, db } = gate;

  if (userId === admin.user.id) {
    return { ok: false, error: "You can't change your own role here." };
  }

  // Never remove the last remaining admin.
  if (role === "user") {
    const { count } = await db
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    if ((count ?? 0) <= 1) {
      return { ok: false, error: "There must be at least one admin." };
    }
  }

  const { error } = await db.from("profiles").update({ role }).eq("id", userId);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(
    db,
    admin,
    role === "admin" ? "role.grant" : "role.revoke",
    userId,
    { role },
  );
  revalidateUser(userId);
  return { ok: true };
}
