import { NextResponse, type NextRequest } from "next/server";
import { updateSession, copyAuthCookies } from "@/lib/supabase/proxy";

/**
 * Next.js 16 renamed `middleware` → `proxy`. Runs before rendering to keep the
 * Supabase session fresh and to gate the dashboard behind auth.
 */
export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  // Gate the protected areas: no session → send to login (remember target).
  // The /admin role check happens server-side in requireAdmin(); this is just
  // the first, cheap "must be signed in" gate.
  const protectedArea =
    pathname.startsWith("/dashboard") || pathname.startsWith("/admin");
  if (protectedArea && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", pathname);
    return copyAuthCookies(response, NextResponse.redirect(url));
  }

  // Signed-in users shouldn't sit on login/signup/forgot. `reset-password` is
  // intentionally excluded — the recovery link lands there *with* a session.
  const bounceFrom = ["/login", "/signup", "/forgot-password"];
  if (user && bounceFrom.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return copyAuthCookies(response, NextResponse.redirect(url));
  }

  return response;
}

export const config = {
  // Run on everything except static assets and image files.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?)$).*)",
  ],
};
