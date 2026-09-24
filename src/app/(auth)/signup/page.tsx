import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { SignupForm } from "@/components/auth/SignupForm";
import { STARTER_CREDITS } from "@/lib/config";

export const metadata: Metadata = {
  title: "Create your account",
  description: "Create a Tarakki Hub account and start listing faster.",
};

export default function SignupPage() {
  return (
    <AuthShell
      title="Create your account"
      subtitle={`Start with ${STARTER_CREDITS} free credits — no card needed.`}
      footer={
        <span>
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-teal-700 hover:text-teal-800"
          >
            Sign in
          </Link>
        </span>
      }
    >
      <SignupForm />
    </AuthShell>
  );
}
