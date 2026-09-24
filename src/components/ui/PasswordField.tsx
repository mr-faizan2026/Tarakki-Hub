"use client";

import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Field, inputClass, fieldBorder } from "@/components/ui/Field";
import { PasswordStrength } from "@/components/ui/PasswordStrength";
import { cn } from "@/lib/cn";

type PasswordFieldProps = {
  id?: string;
  label: string;
  value: string;
  error?: string | null;
  hint?: ReactNode;
  labelAside?: ReactNode;
  /** Render the live strength meter under the field. */
  showStrength?: boolean;
  className?: string;
} & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "id" | "type" | "value" | "className"
>;

function EyeIcon({ off }: { off?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <path
        d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3.2" />
      {off ? <path d="M4 4l16 16" strokeLinecap="round" /> : null}
    </svg>
  );
}

/** Password input with a show/hide toggle and optional strength meter. */
export function PasswordField({
  id,
  label,
  value,
  error,
  hint,
  labelAside,
  showStrength = false,
  className,
  ...input
}: PasswordFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const [visible, setVisible] = useState(false);

  return (
    <Field
      id={fieldId}
      label={label}
      error={error}
      hint={hint}
      labelAside={labelAside}
      className={className}
    >
      <div className="relative">
        <input
          id={fieldId}
          type={visible ? "text" : "password"}
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
          className={cn(inputClass, fieldBorder(!!error), "pr-11")}
          {...input}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          tabIndex={-1}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-ink-400 transition-colors hover:text-ink-700 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-teal-600"
        >
          <EyeIcon off={visible} />
        </button>
      </div>
      {showStrength ? <PasswordStrength password={value} /> : null}
    </Field>
  );
}
