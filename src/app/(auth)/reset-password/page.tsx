import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { ResetForm } from "@/components/auth/ResetForm";

export const metadata: Metadata = {
  title: "Set a new password",
  description: "Choose a new password for your Tarakki Hub account.",
};

export default function ResetPasswordPage() {
  return (
    <AuthShell
      title="Set a new password"
      subtitle="Choose a strong password you don't use anywhere else."
      footer={
        <span>
          Back to{" "}
          <Link
            href="/login"
            className="font-medium text-teal-700 hover:text-teal-800"
          >
            sign in
          </Link>
        </span>
      }
    >
      <ResetForm />
    </AuthShell>
  );
}
