import type { User } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";
import type { Plan, Profile, Usage } from "./db-types";

export type Account = {
  user: User;
  profile: Profile;
  usage: Usage;
  /** Whether the admin panel has blocked this account. */
  blocked: boolean;
};

/**
 * Loads the signed-in user's profile + usage, respecting RLS (a user reads only
 * their own rows). Mirrors the web app's loadAccount(): synthesises safe display
 * defaults if the trigger-created rows are somehow missing, so the UI never
 * crashes on a null row. Returns null when there is no session.
 */
export async function loadAccount(): Promise<Account | null> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [{ data: profile }, { data: usage }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("usage").select("*").eq("user_id", user.id).maybeSingle(),
  ]);

  const safeProfile: Profile = profile ?? {
    id: user.id,
    full_name:
      (user.user_metadata?.full_name as string | undefined) ?? null,
    role: "user",
    plan: "free",
    status: "active",
    created_at: user.created_at ?? new Date().toISOString(),
  };

  const safeUsage: Usage = usage ?? {
    id: "",
    user_id: user.id,
    credits_remaining: 0,
    images_used: 0,
    period_start: new Date().toISOString(),
    period_end: new Date().toISOString(),
  };

  return {
    user,
    profile: safeProfile,
    usage: safeUsage,
    blocked: safeProfile.status === "blocked",
  };
}

/** The period's starting allotment — the credit meter's denominator. */
export function creditsTotal(usage: Usage): number {
  return Math.max(usage.credits_remaining + usage.images_used, 1);
}

/** Human label for the current plan, title-cased. */
export function planLabel(plan: string): string {
  if (!plan) return "Free";
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

/** Fetches the active plans (public read) — used only for the upgrade hint. */
export async function loadPlans(): Promise<Plan[]> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("plans")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  return data ?? [];
}
