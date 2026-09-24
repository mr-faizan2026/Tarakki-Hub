import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Shared input chrome, so every field on the site looks identical. */
export const inputClass =
  "h-11 w-full rounded-md border bg-surface px-3.5 text-body text-ink-900 placeholder:text-ink-400 transition-[border-color,box-shadow] duration-150 focus:outline-none focus-visible:outline-none";

export function fieldBorder(hasError?: boolean): string {
  return hasError
    ? "border-danger-500 focus:border-danger-600 focus:shadow-[0_0_0_3px_var(--color-danger-100)]"
    : "border-hairline-strong focus:border-teal-400 focus:shadow-[0_0_0_3px_var(--color-teal-100)]";
}

type FieldProps = {
  id: string;
  label: string;
  error?: string | null;
  hint?: ReactNode;
  /** Optional element rendered to the right of the label (e.g. a link). */
  labelAside?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** Label + control + hint/error, wired for accessibility. */
export function Field({
  id,
  label,
  error,
  hint,
  labelAside,
  children,
  className,
}: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-small font-medium text-ink-800">
          {label}
        </label>
        {labelAside}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-small text-danger-600">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-small text-ink-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type TextFieldProps = {
  id: string;
  label: string;
  error?: string | null;
  hint?: ReactNode;
  labelAside?: ReactNode;
  className?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "className">;

/** A labeled text input with inline error handling. */
export function TextField({
  id,
  label,
  error,
  hint,
  labelAside,
  className,
  ...input
}: TextFieldProps) {
  return (
    <Field
      id={id}
      label={label}
      error={error}
      hint={hint}
      labelAside={labelAside}
      className={className}
    >
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={cn(inputClass, fieldBorder(!!error))}
        {...input}
      />
    </Field>
  );
}
