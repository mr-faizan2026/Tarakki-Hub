"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

export async function updateProfileName(fullName: string): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const trimmed = fullName.trim();
  if (!trimmed) return { ok: false, error: "Please enter your name." };
  if (trimmed.length > 80) return { ok: false, error: "That name is too long." };

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: trimmed })
    .eq("id", user.id);
  if (error) return { ok: false, error: error.message };

  // Keep the auth metadata copy in sync (used before the profile row loads).
  await supabase.auth.updateUser({ data: { full_name: trimmed } });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
  return { ok: true };
}
