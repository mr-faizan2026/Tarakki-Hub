import "server-only";

import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Usage } from "@/lib/supabase/types";

export type Account = {
  user: User;
  profile: Profile;
  usage: Usage;
};

/**
 * Loads the signed-in user with their profile + usage. Redirects to /login if
 * there's no session. If the trigger-created rows are somehow missing (e.g. a
 * pre-trigger account), sensible display defaults are synthesised so the UI
 * never crashes on a null row.
 */
export async function loadAccount(): Promise<Account> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: profile }, { data: usage }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("usage").select("*").eq("user_id", user.id).maybeSingle(),
  ]);

  // A blocked account can't use the dashboard (and can't spend credits — the
  // consume_credit() DB function refuses them too). Bounce to the notice page.
  if (profile?.status === "blocked") {
    redirect("/blocked");
  }

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

  return { user, profile: safeProfile, usage: safeUsage };
}

/** The period's starting allotment — used as the credit meter's denominator. */
export function creditsTotal(usage: Usage): number {
  return Math.max(usage.credits_remaining + usage.images_used, 1);
}
