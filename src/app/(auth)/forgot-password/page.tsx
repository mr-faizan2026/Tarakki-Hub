import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { ForgotForm } from "@/components/auth/ForgotForm";

export const metadata: Metadata = {
  title: "Reset your password",
  description: "We'll email you a link to reset your Tarakki Hub password.",
};

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your email and we'll send you a reset link."
      footer={
        <span>
          Remembered it?{" "}
          <Link
            href="/login"
            className="font-medium text-teal-700 hover:text-teal-800"
          >
            Back to sign in
          </Link>
        </span>
      }
    >
      <ForgotForm />
    </AuthShell>
  );
}
