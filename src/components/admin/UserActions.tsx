"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import {
  setUserPlan,
  adjustUserCredits,
  setUserBlocked,
  setUserRole,
} from "@/app/admin/users/[id]/actions";

type Result = { ok: true } | { ok: false; error: string };

const inputBase =
  "h-10 w-full rounded-md border border-hairline-strong bg-surface px-3 text-small text-ink-900 placeholder:text-ink-400 transition-[border-color,box-shadow] focus:border-teal-400 focus:shadow-[0_0_0_3px_var(--color-teal-100)] focus:outline-none";

function Row({
  title,
  description,
  children,
}: {
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 py-5 first:pt-0 last:pb-0 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
      <div className="lg:max-w-xs">
        <h3 className="text-small font-semibold text-ink-900">{title}</h3>
        <p className="mt-1 text-small text-ink-500">{description}</p>
      </div>
      <div className="w-full lg:max-w-sm">{children}</div>
    </div>
  );
}

type Feedback = { tone: "success" | "error"; text: string } | null;

function Note({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  return feedback.tone === "error" ? (
    <p className="mt-2 flex items-center gap-1.5 text-small text-danger-600">
      <Icon name="ban" size={14} />
      {feedback.text}
    </p>
  ) : (
    <p className="mt-2 flex items-center gap-1.5 text-small text-teal-700">
      <Icon name="check" size={14} />
      {feedback.text}
    </p>
  );
}

export function UserActions({
  userId,
  isSelf,
  currentPlan,
  currentStatus,
  currentRole,
  plans,
}: {
  userId: string;
  isSelf: boolean;
  currentPlan: string;
  currentStatus: "active" | "blocked";
  currentRole: "user" | "admin";
  currentCredits: number;
  plans: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Which sub-action is running, so only its button shows a spinner.
  const [busy, setBusy] = useState<string | null>(null);

  const [plan, setPlan] = useState(currentPlan.toLowerCase());
  const [planNote, setPlanNote] = useState<Feedback>(null);

  const [mode, setMode] = useState<"add" | "set">("add");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [creditNote, setCreditNote] = useState<Feedback>(null);

  const [accessNote, setAccessNote] = useState<Feedback>(null);
  const [roleNote, setRoleNote] = useState<Feedback>(null);

  function run(
    key: string,
    fn: () => Promise<Result>,
    onOk: (setter: (f: Feedback) => void) => void,
    setter: (f: Feedback) => void,
  ) {
    setter(null);
    setBusy(key);
    startTransition(async () => {
      const res = await fn();
      setBusy(null);
      if (!res.ok) {
        setter({ tone: "error", text: res.error });
        return;
      }
      onOk(setter);
      router.refresh();
    });
  }

  const planDirty = plan !== currentPlan.toLowerCase();

  return (
    <div className="divide-y divide-hairline">
      {/* Plan */}
      <Row
        title="Plan"
        description="Move this account between the Free, Pro and Business tiers."
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            value={plan}
            onChange={(e) => {
              setPlan(e.target.value);
              setPlanNote(null);
            }}
            aria-label="Plan"
            className={cn(inputBase, "sm:flex-1")}
          >
            {plans.map((p) => (
              <option key={p} value={p.toLowerCase()}>
                {p}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={pending || !planDirty}
            onClick={() =>
              run(
                "plan",
                () => setUserPlan(userId, plan),
                (s) => s({ tone: "success", text: "Plan updated." }),
                setPlanNote,
              )
            }
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-teal-500 px-4 text-small font-medium text-white transition-colors hover:bg-teal-600 disabled:pointer-events-none disabled:opacity-50"
          >
            {busy === "plan" ? "Saving…" : "Save plan"}
          </button>
        </div>
        <Note feedback={planNote} />
      </Row>

      {/* Credits */}
      <Row
        title="Credits"
        description="Add credits (use a negative number to deduct) or set the balance to an exact amount. A reason is required and logged."
      >
        <div className="inline-flex rounded-md border border-hairline-strong p-0.5">
          {(["add", "set"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "h-8 rounded px-3 text-small font-medium transition-colors",
                mode === m
                  ? "bg-ink-800 text-white"
                  : "text-ink-600 hover:text-ink-900",
              )}
            >
              {m === "add" ? "Add / deduct" : "Set to"}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-col gap-2">
          <input
            type="number"
            inputMode="numeric"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setCreditNote(null);
            }}
            placeholder={mode === "add" ? "e.g. 50 or -10" : "e.g. 200"}
            aria-label="Credit amount"
            className={inputBase}
          />
          <input
            type="text"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setCreditNote(null);
            }}
            placeholder="Reason (e.g. support top-up)"
            aria-label="Reason"
            maxLength={140}
            className={inputBase}
          />
          <button
            type="button"
            disabled={pending || amount.trim() === "" || reason.trim() === ""}
            onClick={() =>
              run(
                "credits",
                () =>
                  adjustUserCredits(
                    userId,
                    mode,
                    Number.parseInt(amount, 10),
                    reason,
                  ),
                (s) => {
                  s({ tone: "success", text: "Credits updated." });
                  setAmount("");
                  setReason("");
                },
                setCreditNote,
              )
            }
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-hairline-strong bg-surface px-4 text-small font-medium text-ink-800 transition-colors hover:border-teal-300 disabled:pointer-events-none disabled:opacity-50"
          >
            <Icon name={mode === "add" ? "plus" : "sliders"} size={15} />
            {busy === "credits" ? "Applying…" : "Apply"}
          </button>
        </div>
        <Note feedback={creditNote} />
      </Row>

      {/* Access */}
      <Row
        title="Access"
        description={
          currentStatus === "blocked"
            ? "This account is blocked — it can't sign in or spend credits. Unblock to restore access."
            : "Block this account to immediately revoke dashboard and extension access."
        }
      >
        {isSelf ? (
          <p className="text-small text-ink-400">
            You can&apos;t change access on your own account.
          </p>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              const blocking = currentStatus === "active";
              if (
                blocking &&
                !window.confirm(
                  "Block this user? They'll be signed out and can't use the extension until unblocked.",
                )
              ) {
                return;
              }
              run(
                "access",
                () => setUserBlocked(userId, blocking),
                (s) =>
                  s({
                    tone: "success",
                    text: blocking ? "User blocked." : "User unblocked.",
                  }),
                setAccessNote,
              );
            }}
            className={cn(
              "inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-small font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
              currentStatus === "blocked"
                ? "bg-teal-500 text-white hover:bg-teal-600"
                : "border border-danger-500/40 bg-danger-50 text-danger-700 hover:bg-danger-100",
            )}
          >
            <Icon name={currentStatus === "blocked" ? "check" : "ban"} size={15} />
            {busy === "access"
              ? "Working…"
              : currentStatus === "blocked"
                ? "Unblock user"
                : "Block user"}
          </button>
        )}
        <Note feedback={accessNote} />
      </Row>

      {/* Role */}
      <Row
        title="Role"
        description={
          currentRole === "admin"
            ? "This user is an admin with full access to this panel. Revoke to make them a regular user."
            : "Grant admin access so this user can manage the whole platform. Do this carefully."
        }
      >
        {isSelf ? (
          <p className="text-small text-ink-400">
            You can&apos;t change your own role.
          </p>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              const granting = currentRole === "user";
              if (
                !window.confirm(
                  granting
                    ? "Make this user an admin? They'll get full access to the admin panel."
                    : "Remove admin access from this user?",
                )
              ) {
                return;
              }
              run(
                "role",
                () => setUserRole(userId, granting ? "admin" : "user"),
                (s) =>
                  s({
                    tone: "success",
                    text: granting ? "Admin granted." : "Admin revoked.",
                  }),
                setRoleNote,
              );
            }}
            className={cn(
              "inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-small font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
              currentRole === "admin"
                ? "border border-hairline-strong bg-surface text-ink-800 hover:border-ink-300"
                : "bg-ink-800 text-white hover:bg-ink-900",
            )}
          >
            <Icon name="shield" size={15} />
            {busy === "role"
              ? "Working…"
              : currentRole === "admin"
                ? "Remove admin"
                : "Make admin"}
          </button>
        )}
        <Note feedback={roleNote} />
      </Row>
    </div>
  );
}
