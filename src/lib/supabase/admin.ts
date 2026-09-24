import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * Privileged, service-role client. **Server-only** — the `server-only` import
 * above makes the build fail if this is ever pulled into a client bundle.
 * It bypasses RLS, so use it sparingly and only for trusted server operations.
 */
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }

  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
