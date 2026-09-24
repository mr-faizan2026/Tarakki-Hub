"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { TextField } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { FormAlert } from "@/components/ui/FormAlert";
import { Icon } from "@/components/ui/Icon";
import { updateProfileName } from "@/app/dashboard/settings/actions";

export function ProfileForm({
  initialName,
  email,
}: {
  initialName: string;
  email: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await updateProfileName(name);
      if (!res.ok) return setError(res.error);
      setSaved(true);
      router.refresh();
    });
  }

  const dirty = name.trim() !== initialName.trim();

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {error ? <FormAlert>{error}</FormAlert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="full-name"
          label="Full name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
          autoComplete="name"
        />
        <TextField
          id="email"
          label="Email"
          value={email}
          readOnly
          disabled
          hint="Contact support to change your email."
        />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" size="md" disabled={pending || !dirty}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
        {saved && !dirty ? (
          <span className="flex items-center gap-1.5 text-small text-teal-700">
            <Icon name="check" size={16} />
            Saved
          </span>
        ) : null}
      </div>
    </form>
  );
}
