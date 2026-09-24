"use server";

import { revalidatePath } from "next/cache";
import { authorizeAdminAction, logAdminAction } from "@/lib/admin";

type Result = { ok: true } | { ok: false; error: string };

export type PlanInput = {
  id?: string;
  name: string;
  price_placeholder: string;
  price_amount: string; // raw from the form; "" → null
  monthly_credits: string; // raw from the form
  features: string[];
  is_active: boolean;
  sort_order: number;
};

function revalidatePlans() {
  revalidatePath("/admin/plans");
  revalidatePath("/admin");
  revalidatePath("/dashboard/billing"); // the plans feed the user billing page
}

/** Create a new plan or update an existing one (by id). */
export async function savePlan(input: PlanInput): Promise<Result> {
  const gate = await authorizeAdminAction();
  if (!gate.ok) return gate;
  const { admin, db } = gate;

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Give the plan a name." };
  if (name.length > 40) return { ok: false, error: "Plan name is too long." };

  const monthlyCredits = Number.parseInt(input.monthly_credits, 10);
  if (!Number.isFinite(monthlyCredits) || monthlyCredits < 0) {
    return { ok: false, error: "Monthly credits must be zero or more." };
  }

  let priceAmount: number | null = null;
  if (input.price_amount.trim() !== "") {
    priceAmount = Number.parseFloat(input.price_amount);
    if (!Number.isFinite(priceAmount) || priceAmount < 0) {
      return { ok: false, error: "Price must be a positive number." };
    }
  }

  const features = input.features
    .map((f) => f.trim())
    .filter(Boolean)
    .slice(0, 20);

  const payload = {
    name,
    price_placeholder: input.price_placeholder.trim() || null,
    price_amount: priceAmount,
    monthly_credits: monthlyCredits,
    // Keep limits.credits in sync so the user-facing billing page stays correct.
    limits: { credits: monthlyCredits },
    features,
    is_active: input.is_active,
    sort_order: Number.isFinite(input.sort_order) ? input.sort_order : 0,
  };

  if (input.id) {
    const { error } = await db.from("plans").update(payload).eq("id", input.id);
    if (error) return { ok: false, error: friendly(error.message) };
    await logAdminAction(db, admin, "plan.update", null, { id: input.id, name });
  } else {
    const { error } = await db.from("plans").insert(payload);
    if (error) return { ok: false, error: friendly(error.message) };
    await logAdminAction(db, admin, "plan.create", null, { name });
  }

  revalidatePlans();
  return { ok: true };
}

/** Enable or disable a plan without deleting it. */
export async function setPlanActive(id: string, active: boolean): Promise<Result> {
  const gate = await authorizeAdminAction();
  if (!gate.ok) return gate;
  const { admin, db } = gate;

  const { error } = await db.from("plans").update({ is_active: active }).eq("id", id);
  if (error) return { ok: false, error: error.message };

  await logAdminAction(db, admin, active ? "plan.enable" : "plan.disable", null, { id });
  revalidatePlans();
  return { ok: true };
}

/** The global starter-credit grant new accounts receive on signup. */
export async function setStarterCredits(value: string): Promise<Result> {
  const gate = await authorizeAdminAction();
  if (!gate.ok) return gate;
  const { admin, db } = gate;

  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, error: "Enter zero or more credits." };
  }
  if (n > 10000) return { ok: false, error: "That's unusually high — keep it under 10,000." };

  const { error } = await db
    .from("app_settings")
    .upsert(
      { key: "starter_credits", value: n, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  if (error) return { ok: false, error: error.message };

  await logAdminAction(db, admin, "settings.starter_credits", null, { value: n });
  revalidatePath("/admin/plans");
  revalidatePath("/admin/settings");
  return { ok: true };
}

function friendly(message: string): string {
  if (message.includes("plans_name_key") || message.includes("duplicate")) {
    return "A plan with that name already exists.";
  }
  return message;
}
