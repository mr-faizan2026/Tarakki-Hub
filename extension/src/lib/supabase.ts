import {
  createClient,
  type SupabaseClient,
  type SupportedStorage,
} from "@supabase/supabase-js";
import type { Database } from "./db-types";
import { SESSION_STORAGE_KEY, SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

/**
 * A Supabase auth-storage adapter backed by `chrome.storage.local`.
 *
 * Why not the default localStorage: the session must survive the side panel
 * closing and the browser restarting, and be readable from any extension
 * context. chrome.storage.local does all three. It's async — supabase-js
 * supports async storage adapters, so we return Promises.
 */
const chromeStorageAdapter: SupportedStorage = {
  async getItem(key) {
    try {
      const res = await chrome.storage.local.get(key);
      return (res?.[key] as string | undefined) ?? null;
    } catch {
      return null;
    }
  },
  async setItem(key, value) {
    try {
      await chrome.storage.local.set({ [key]: value });
    } catch {
      /* storage full / unavailable — auth just won't persist this write */
    }
  },
  async removeItem(key) {
    try {
      await chrome.storage.local.remove(key);
    } catch {
      /* ignore */
    }
  },
};

let cached: SupabaseClient<Database> | null = null;

/**
 * The single Supabase client for the extension. Auth session lives in
 * chrome.storage.local; tokens auto-refresh while the panel is open. There is
 * NO service-role key here — privileged writes go through the consume_credit
 * RPC (see credits.ts), which runs server-side with definer privileges.
 */
export function getSupabase(): SupabaseClient<Database> {
  if (cached) return cached;
  cached = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: chromeStorageAdapter,
      storageKey: SESSION_STORAGE_KEY,
      persistSession: true,
      autoRefreshToken: true,
      // No URL-based auth in an extension page.
      detectSessionInUrl: false,
    },
  });
  return cached;
}
