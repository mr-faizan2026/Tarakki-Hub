import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "./types";

/**
 * Server-side Supabase client bound to the request cookies. Use in Server
 * Components, Server Actions, and Route Handlers.
 *
 * In a Server Component render, cookies cannot be written — the `setAll`
 * try/catch swallows that case. Token refresh is handled in `proxy.ts`, so
 * this is safe: reads always work, and writes only matter in actions/handlers.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component render — ignore. proxy.ts refreshes.
          }
        },
      },
    },
  );
}
