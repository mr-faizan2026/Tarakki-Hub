import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { loadAccount, type Account } from "@/lib/account";
import { friendlyAuthError } from "@/lib/auth-errors";
import type { Usage } from "@/lib/db-types";

export type AuthApi = {
  loading: boolean;
  account: Account | null;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  refreshAccount: () => Promise<void>;
  /** Apply a fresh usage row (e.g. after spending a credit). */
  applyUsage: (usage: Usage) => void;
};

/**
 * Owns the Supabase session + the signed-in account (profile + usage). The
 * session lives in chrome.storage.local via the client's storage adapter, so it
 * survives the panel closing and the browser restarting.
 */
export function useAuth(): AuthApi {
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<Account | null>(null);

  useEffect(() => {
    let active = true;
    const supabase = getSupabase();

    const hydrate = () => {
      // Deferred: Supabase warns against calling its methods synchronously
      // inside the auth-change callback (can deadlock the internal lock).
      setTimeout(() => {
        if (!active) return;
        loadAccount()
          .then((acc) => active && setAccount(acc))
          .catch(() => active && setAccount(null))
          .finally(() => active && setLoading(false));
      }, 0);
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (session?.user) {
        hydrate();
      } else {
        setAccount(null);
        setLoading(false);
      }
    });

    // Fallback in case no INITIAL_SESSION event arrives promptly.
    supabase.auth.getSession().then(({ data }) => {
      if (active && !data.session) setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await getSupabase().auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) return friendlyAuthError(error.message);
    return null; // account hydrates via onAuthStateChange
  }, []);

  const signOut = useCallback(async () => {
    await getSupabase().auth.signOut();
    setAccount(null);
  }, []);

  const refreshAccount = useCallback(async () => {
    const acc = await loadAccount();
    setAccount(acc);
  }, []);

  const applyUsage = useCallback((usage: Usage) => {
    setAccount((prev) => (prev ? { ...prev, usage } : prev));
  }, []);

  return { loading, account, signIn, signOut, refreshAccount, applyUsage };
}
