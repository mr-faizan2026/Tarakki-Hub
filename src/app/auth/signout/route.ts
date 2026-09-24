import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Server-side sign out. POST to clear the session cookies, then back to login. */
export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
