import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";
import { safeNext } from "@/lib/safe-next";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your Tarakki Hub dashboard.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reset?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const notice = sp.reset ? "reset" : sp.error === "link" ? "link" : null;

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to pick up where you left off."
      footer={
        <span>
          New to Tarakki Hub?{" "}
          <Link
            href="/signup"
            className="font-medium text-teal-700 hover:text-teal-800"
          >
            Create an account
          </Link>
        </span>
      }
    >
      <LoginForm next={next} notice={notice} />
    </AuthShell>
  );
}
