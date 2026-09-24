"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

/**
 * Browser-side Supabase client. Reads/writes the auth session from cookies
 * (via @supabase/ssr) so the server can see the same session. Create a fresh
 * instance where you need it — the underlying singleton is memoised by the lib.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
