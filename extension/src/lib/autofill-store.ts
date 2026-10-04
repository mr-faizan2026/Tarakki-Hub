/**
 * Autofill profiles — reading and writing them, and nothing else.
 *
 * ── WHERE THE GATE ACTUALLY IS ─────────────────────────────────────────────
 * Not here. `public.autofill_profiles` has RLS policies that require
 * `has_active_plan(auth.uid())` on select, insert, update AND delete, so a free,
 * expired or blocked account gets an empty list and a rejected write no matter
 * what this file — or a tampered build of it — asks for. The `planActive()` call
 * below exists to render the right UI, not to protect anything.
 *
 * That is why the locked state is honest: it is showing the seller a decision the
 * database has already made.
 *
 * Autofill spends NO credits. Credits stay reserved for the low-shipping image
 * (see credits.ts). Access is by plan alone.
 */

import type { CapturedField } from "./autofill-types";
import type { AutofillProfileRow, Json } from "./db-types";
import { getSupabase } from "./supabase";

/** A profile with its fields parsed back into the shape the panel works with. */
export type AutofillProfile = Omit<AutofillProfileRow, "fields"> & {
  fields: CapturedField[];
};

export type AutofillErrorKind =
  /** RLS said no: the plan is free, expired, or the account is blocked. */
  | "plan_required"
  /** The plan caps how many profiles may be kept. */
  | "limit_reached"
  | "not_authenticated"
  | "not_found"
  | "unknown";

export class AutofillError extends Error {
  kind: AutofillErrorKind;
  constructor(kind: AutofillErrorKind, message: string) {
    super(message);
    this.name = "AutofillError";
    this.kind = kind;
  }
}

/** Postgres/PostgREST errors, translated once so every caller reads the same. */
function classify(error: { message?: string; code?: string } | null): AutofillError {
  const message = (error?.message ?? "").toLowerCase();
  const code = error?.code ?? "";

  if (message.includes("profile_limit_reached")) {
    return new AutofillError(
      "limit_reached",
      "Your plan's profile limit is full. Delete one to save another.",
    );
  }
  if (message.includes("plan_required")) {
    return new AutofillError("plan_required", PLAN_MESSAGE);
  }
  if (message.includes("profile_not_found")) {
    return new AutofillError("not_found", "That profile no longer exists.");
  }
  if (message.includes("not_authenticated")) {
    return new AutofillError("not_authenticated", "Sign in again to continue.");
  }
  // 42501 = insufficient_privilege: an RLS policy refused the row. With these
  // tables that means exactly one thing — no active paid plan.
  if (code === "42501" || message.includes("row-level security")) {
    return new AutofillError("plan_required", PLAN_MESSAGE);
  }
  return new AutofillError("unknown", error?.message || "Something went wrong.");
}

const PLAN_MESSAGE = "Autofill is included in the paid plans. Upgrade to use it.";

/* ─── plan status ──────────────────────────────────────────────────────── */

/**
 * Does this account have an active paid plan? Asks the database function that the
 * policies themselves use, so the UI can never disagree with what a write will do.
 * A failure answers false: locked is the safe direction to be wrong in.
 */
export async function planActive(): Promise<boolean> {
  const { data, error } = await getSupabase().rpc("has_active_plan", {});
  if (error) return false;
  return data === true;
}

/* ─── reads ────────────────────────────────────────────────────────────── */

function toProfile(row: AutofillProfileRow): AutofillProfile {
  return { ...row, fields: parseFields(row.fields) };
}

/** `fields` is jsonb, so it arrives as unknown JSON — validate before trusting. */
function parseFields(value: Json): CapturedField[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isCapturedField);
}

function isCapturedField(value: unknown): value is CapturedField {
  if (!value || typeof value !== "object") return false;
  const f = value as Partial<CapturedField>;
  return (
    typeof f.key === "string" &&
    typeof f.label === "string" &&
    typeof f.section === "string" &&
    typeof f.type === "string" &&
    typeof f.normalizedLabel === "string" &&
    typeof f.occurrence === "number" &&
    (typeof f.value === "string" || typeof f.value === "boolean" || Array.isArray(f.value))
  );
}

/** The seller's profiles, most recently used first. */
export async function listProfiles(): Promise<AutofillProfile[]> {
  const { data, error } = await getSupabase()
    .from("autofill_profiles")
    .select("*")
    .order("last_used_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false });

  if (error) throw classify(error);
  return (data ?? []).map(toProfile);
}

/* ─── writes ───────────────────────────────────────────────────────────── */

export async function createProfile(
  name: string,
  categoryPath: string | null,
  fields: CapturedField[],
): Promise<AutofillProfile> {
  const supabase = getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AutofillError("not_authenticated", "Sign in again to continue.");

  const { data, error } = await supabase
    .from("autofill_profiles")
    .insert({
      user_id: user.id,
      name: name.trim() || "Untitled profile",
      category_path: categoryPath,
      fields: fields as unknown as Json,
      field_count: fields.length,
    })
    .select("*")
    .single();

  if (error) throw classify(error);
  return toProfile(data);
}

export async function renameProfile(id: string, name: string): Promise<AutofillProfile> {
  const { data, error } = await getSupabase()
    .from("autofill_profiles")
    .update({ name: name.trim() || "Untitled profile" })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw classify(error);
  return toProfile(data);
}

/** Save an edited field list (the field editor, and "also save my overrides"). */
export async function saveProfileFields(
  id: string,
  fields: CapturedField[],
): Promise<AutofillProfile> {
  const { data, error } = await getSupabase()
    .from("autofill_profiles")
    .update({ fields: fields as unknown as Json, field_count: fields.length })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw classify(error);
  return toProfile(data);
}

/** A copy, so a seller can branch a profile for a similar category. */
export async function duplicateProfile(
  profile: AutofillProfile,
): Promise<AutofillProfile> {
  return createProfile(`${profile.name} copy`, profile.category_path, profile.fields);
}

export async function deleteProfile(id: string): Promise<void> {
  const { error } = await getSupabase().from("autofill_profiles").delete().eq("id", id);
  if (error) throw classify(error);
}

/**
 * Log a completed run: one fill_events row, plus used_count / last_used_at on the
 * profile. One RPC so the two can never drift apart.
 */
export async function recordFill(
  profileId: string,
  filled: number,
  skipped: number,
  failed: number,
): Promise<AutofillProfile | null> {
  const { data, error } = await getSupabase().rpc("record_fill_event", {
    p_profile_id: profileId,
    p_filled: filled,
    p_skipped: skipped,
    p_failed: failed,
  });
  // A failed log must never look like a failed fill — the seller's form is
  // already filled. Swallow it and let the next list() refresh the counters.
  if (error || !data) return null;
  const row = (Array.isArray(data) ? data[0] : data) as AutofillProfileRow;
  return toProfile(row);
}
