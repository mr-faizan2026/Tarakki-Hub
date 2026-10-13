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
    phone: null,
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
    // Never paid — the fallback must not accidentally unlock a paid feature
    // for an account whose usage row failed to load.
    paid_until: null,
  };

  return { user, profile: safeProfile, usage: safeUsage };
}

/** The period's starting allotment — used as the credit meter's denominator. */
export function creditsTotal(usage: Usage): number {
  return Math.max(usage.credits_remaining + usage.images_used, 1);
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  IS THIS ACCOUNT PAID, AND UNTIL WHEN — the one place that answers it
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 *  Four surfaces asked that question and three got it wrong. A seller who had
 *  just paid ₹99 saw, on one screen: "PAID" on the billing card, "FREE PLAN" in
 *  the sidebar, "Current plan: Free — Pricing launching soon" on the overview,
 *  and an "Extension license: FREE" card telling them a subscription would
 *  unlock things "once paid plans launch".
 *
 *  Every one of those read `profiles.plan`, which buying a credit pack
 *  deliberately does NOT change — a pack is not a plan, and that column still
 *  belongs to the admin panel's "grant a plan by hand" feature.
 *
 *  So the answer lives here, once, and mirrors `has_active_plan()` in
 *  0005_billing.sql exactly: an unexpired pack OR an admin-granted paid plan.
 *  If that SQL changes, change this with it.
 */
export type AccessStatus = {
  /** Paid access is live right now. */
  paid: boolean;
  /** When paid access ends (ISO), or null for an account that never bought. */
  until: string | null;
  /** The status word for a badge or tile: "Paid", "Pro", "Free". */
  label: string;
};

export function accessStatus(profile: Profile, usage: Usage): AccessStatus {
  const until = usage.paid_until;
  const packActive = until != null && new Date(until).getTime() > Date.now();

  // An admin can still grant a plan directly; that path predates packs and has
  // to keep working. Mirrors is_paid_plan() — anything that isn't "free".
  const grantedPlan = profile.plan.trim().toLowerCase();
  const grantedActive = grantedPlan !== "" && grantedPlan !== "free";

  if (packActive) return { paid: true, until, label: "Paid" };
  if (grantedActive) {
    return {
      paid: true,
      until: null,
      label: profile.plan.charAt(0).toUpperCase() + profile.plan.slice(1),
    };
  }
  return { paid: false, until: null, label: "Free" };
}
