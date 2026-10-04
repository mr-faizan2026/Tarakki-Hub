import { useCallback, useEffect, useRef, useState } from "react";
import type { CapturedField } from "@/lib/autofill-types";
import {
  AutofillError,
  createProfile,
  deleteProfile,
  duplicateProfile,
  listProfiles,
  planActive,
  recordFill,
  renameProfile,
  saveProfileFields,
  type AutofillProfile,
} from "@/lib/autofill-store";

/**
 * Owns the seller's autofill profiles and whether their plan allows them.
 *
 * The plan is re-checked every time this hook mounts — which is every time the
 * panel is opened — and again whenever a write comes back with `plan_required`.
 * So a plan that lapses mid-session does not leave a working-looking UI: the next
 * load is refused by RLS and the section falls back to its locked state.
 */

export type AutofillApi = {
  loading: boolean;
  /** Does the account have an active paid plan? Mirrors has_active_plan() in SQL. */
  planActive: boolean;
  profiles: AutofillProfile[];
  error: string | null;
  clearError: () => void;
  refresh: () => Promise<void>;
  save: (
    name: string,
    categoryPath: string | null,
    fields: CapturedField[],
  ) => Promise<AutofillProfile | null>;
  rename: (id: string, name: string) => Promise<void>;
  duplicate: (profile: AutofillProfile) => Promise<void>;
  remove: (id: string) => Promise<void>;
  saveFields: (id: string, fields: CapturedField[]) => Promise<void>;
  /** Log a completed run (fill_events + used_count). Never throws. */
  logRun: (
    profileId: string,
    filled: number,
    skipped: number,
    failed: number,
  ) => Promise<void>;
};

export function useAutofill(userId: string | undefined): AutofillApi {
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(false);
  const [profiles, setProfiles] = useState<AutofillProfile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /** One place that turns a store error into a message — and re-locks the UI
   *  when the database says the plan no longer allows this. */
  const handle = useCallback((err: unknown) => {
    if (err instanceof AutofillError) {
      setError(err.message);
      if (err.kind === "plan_required") {
        setActive(false);
        setProfiles([]);
      }
      return;
    }
    setError("Something went wrong. Try again.");
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const allowed = await planActive();
      if (!alive.current) return;
      setActive(allowed);
      if (!allowed) {
        setProfiles([]);
        return;
      }
      const rows = await listProfiles();
      if (!alive.current) return;
      setProfiles(rows);
      setError(null);
    } catch (err) {
      if (!alive.current) return;
      handle(err);
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [handle]);

  // Re-runs on sign-in (userId changes) and on every panel open (mount).
  useEffect(() => {
    if (!userId) {
      setActive(false);
      setProfiles([]);
      setLoading(false);
      return;
    }
    void refresh();
  }, [userId, refresh]);

  const save = useCallback(
    async (name: string, categoryPath: string | null, fields: CapturedField[]) => {
      try {
        const created = await createProfile(name, categoryPath, fields);
        if (alive.current) {
          setProfiles((prev) => [created, ...prev]);
          setError(null);
        }
        return created;
      } catch (err) {
        handle(err);
        return null;
      }
    },
    [handle],
  );

  const rename = useCallback(
    async (id: string, name: string) => {
      try {
        const updated = await renameProfile(id, name);
        if (alive.current) {
          setProfiles((prev) => prev.map((p) => (p.id === id ? updated : p)));
          setError(null);
        }
      } catch (err) {
        handle(err);
      }
    },
    [handle],
  );

  const duplicate = useCallback(
    async (profile: AutofillProfile) => {
      try {
        const copy = await duplicateProfile(profile);
        if (alive.current) {
          setProfiles((prev) => [copy, ...prev]);
          setError(null);
        }
      } catch (err) {
        handle(err);
      }
    },
    [handle],
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        await deleteProfile(id);
        if (alive.current) {
          setProfiles((prev) => prev.filter((p) => p.id !== id));
          setError(null);
        }
      } catch (err) {
        handle(err);
      }
    },
    [handle],
  );

  const saveFields = useCallback(
    async (id: string, fields: CapturedField[]) => {
      try {
        const updated = await saveProfileFields(id, fields);
        if (alive.current) {
          setProfiles((prev) => prev.map((p) => (p.id === id ? updated : p)));
          setError(null);
        }
      } catch (err) {
        handle(err);
      }
    },
    [handle],
  );

  const logRun = useCallback(
    async (profileId: string, filled: number, skipped: number, failed: number) => {
      const updated = await recordFill(profileId, filled, skipped, failed);
      if (updated && alive.current) {
        setProfiles((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      }
    },
    [],
  );

  return {
    loading,
    planActive: active,
    profiles,
    error,
    clearError: () => setError(null),
    refresh,
    save,
    rename,
    duplicate,
    remove,
    saveFields,
    logRun,
  };
}
