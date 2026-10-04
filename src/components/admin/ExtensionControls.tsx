"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import {
  saveAdapterConfig,
  saveKillSwitches,
  saveVersionGates,
} from "@/app/admin/extension/actions";
import type { KillSwitchMap } from "@/lib/extension-protocol";

/**
 * The three forms on /admin/extension. Grouped in one file because they share
 * the same tiny feedback pattern and nothing else imports them.
 *
 * All three change the behaviour of every INSTALLED extension, so each says
 * plainly what its blast radius is. The adapter config is the one that matters
 * most: it is how a Meesho UI change gets fixed without a Web Store review.
 */

type Feedback = { tone: "success" | "error"; text: string } | null;

function Note({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  return (
    <p
      className={cn(
        "mt-2 flex items-start gap-1.5 text-small",
        feedback.tone === "error" ? "text-danger-600" : "text-teal-700",
      )}
    >
      <Icon
        name={feedback.tone === "error" ? "ban" : "check"}
        size={14}
        className="mt-0.5 shrink-0"
      />
      <span>{feedback.text}</span>
    </p>
  );
}

const inputClass =
  "h-10 w-full rounded-md border border-hairline-strong bg-surface px-3 text-small text-ink-900 transition-[border-color,box-shadow] focus:border-teal-400 focus:shadow-[0_0_0_3px_var(--color-teal-100)] focus:outline-none";

const buttonClass =
  "inline-flex h-10 items-center justify-center rounded-md bg-teal-500 px-4 text-small font-medium text-white transition-colors hover:bg-teal-600 disabled:pointer-events-none disabled:opacity-50";

/* ─── adapter config ───────────────────────────────────────────────────── */

export function AdapterConfigForm({
  current,
  version,
}: {
  current: string;
  version: number;
}) {
  const router = useRouter();
  const [value, setValue] = useState(current);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);

  function submit() {
    setFeedback(null);
    startTransition(async () => {
      const res = await saveAdapterConfig(value);
      if (!res.ok) {
        setFeedback({ tone: "error", text: res.error });
        return;
      }
      setFeedback({
        tone: "success",
        text: `Saved as version ${version + 1}. Installed extensions pick it up at their next heartbeat (within about 15 minutes).`,
      });
      router.refresh();
    });
  }

  return (
    <div>
      <label htmlFor="adapter-config" className="sr-only">
        Adapter configuration JSON
      </label>
      <textarea
        id="adapter-config"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setFeedback(null);
        }}
        spellCheck={false}
        rows={18}
        className="w-full rounded-md border border-hairline-strong bg-canvas-sunk p-3 font-mono text-micro leading-relaxed text-ink-900 transition-[border-color,box-shadow] focus:border-teal-400 focus:shadow-[0_0_0_3px_var(--color-teal-100)] focus:outline-none"
      />
      <div className="mt-3 flex items-center gap-3">
        <button type="button" onClick={submit} disabled={pending} className={buttonClass}>
          {pending ? "Saving…" : "Save and bump version"}
        </button>
        <span className="text-micro text-ink-500">Current version: {version}</span>
      </div>
      <Note feedback={feedback} />
    </div>
  );
}

/* ─── kill switches ────────────────────────────────────────────────────── */

const FEATURES: { id: string; label: string; blurb: string }[] = [
  {
    id: "live_shipping",
    label: "Live shipping read",
    blurb: "Reading the rupee figure off the supplier panel, and the live quotes.",
  },
  {
    id: "image_generator",
    label: "Low-shipping images",
    blurb: "Generating, quoting, downloading and applying variant images.",
  },
  {
    id: "autofill",
    label: "Listing autofill",
    blurb: "Capturing a form into a profile, and filling one back in.",
  },
];

export function KillSwitchForm({ current }: { current: KillSwitchMap }) {
  const router = useRouter();
  const [rows, setRows] = useState(() =>
    FEATURES.map((f) => ({
      feature: f.id,
      enabled: current[f.id]?.enabled !== false,
      message: current[f.id]?.message ?? "",
    })),
  );
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);

  function patch(feature: string, changes: Partial<(typeof rows)[number]>) {
    setRows((prev) => prev.map((r) => (r.feature === feature ? { ...r, ...changes } : r)));
    setFeedback(null);
  }

  function submit() {
    setFeedback(null);
    startTransition(async () => {
      const res = await saveKillSwitches(rows);
      if (!res.ok) {
        setFeedback({ tone: "error", text: res.error });
        return;
      }
      setFeedback({ tone: "success", text: "Kill switches saved." });
      router.refresh();
    });
  }

  return (
    <div>
      <ul className="flex flex-col gap-4">
        {FEATURES.map((f) => {
          const row = rows.find((r) => r.feature === f.id)!;
          return (
            <li key={f.id} className="rounded-lg border border-hairline p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-small font-medium text-ink-900">{f.label}</p>
                  <p className="mt-0.5 text-micro text-ink-500">{f.blurb}</p>
                </div>
                <label className="flex shrink-0 cursor-pointer items-center gap-2 text-micro font-medium text-ink-700">
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    onChange={(e) => patch(f.id, { enabled: e.target.checked })}
                    className="h-4 w-4 accent-teal-500"
                  />
                  {row.enabled ? "On" : "Off"}
                </label>
              </div>
              <div className="mt-2">
                <label
                  htmlFor={`msg-${f.id}`}
                  className="text-micro font-medium text-ink-600"
                >
                  Message shown in the panel when off
                </label>
                <input
                  id={`msg-${f.id}`}
                  type="text"
                  value={row.message}
                  maxLength={300}
                  placeholder="Paused while Meesho changes its panel. Nothing else is affected."
                  onChange={(e) => patch(f.id, { message: e.target.value })}
                  className={cn(inputClass, "mt-1")}
                />
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-4">
        <button type="button" onClick={submit} disabled={pending} className={buttonClass}>
          {pending ? "Saving…" : "Save kill switches"}
        </button>
      </div>
      <Note feedback={feedback} />
    </div>
  );
}

/* ─── versions + device limit ──────────────────────────────────────────── */

export function VersionGatesForm({
  minVersion,
  latestVersion,
  deviceLimit,
}: {
  minVersion: string;
  latestVersion: string;
  deviceLimit: number;
}) {
  const router = useRouter();
  const [min, setMin] = useState(minVersion);
  const [latest, setLatest] = useState(latestVersion);
  const [limit, setLimit] = useState(String(deviceLimit));
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);

  function submit() {
    setFeedback(null);
    startTransition(async () => {
      const res = await saveVersionGates({
        minVersion: min,
        latestVersion: latest,
        deviceLimit: limit,
      });
      if (!res.ok) {
        setFeedback({ tone: "error", text: res.error });
        return;
      }
      setFeedback({ tone: "success", text: "Saved." });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label htmlFor="min-version" className="text-micro font-medium text-ink-600">
          Minimum version (hard block below this)
        </label>
        <input
          id="min-version"
          type="text"
          inputMode="decimal"
          value={min}
          onChange={(e) => {
            setMin(e.target.value);
            setFeedback(null);
          }}
          className={cn(inputClass, "mt-1")}
        />
        <p className="mt-1 text-micro text-ink-500">
          Older installs show a blocking &ldquo;please update&rdquo; screen and do
          nothing else. Raise this only for a build that is actually wrong.
        </p>
      </div>
      <div>
        <label htmlFor="latest-version" className="text-micro font-medium text-ink-600">
          Latest published version (quiet notice above this)
        </label>
        <input
          id="latest-version"
          type="text"
          inputMode="decimal"
          value={latest}
          onChange={(e) => {
            setLatest(e.target.value);
            setFeedback(null);
          }}
          className={cn(inputClass, "mt-1")}
        />
        <p className="mt-1 text-micro text-ink-500">
          Set this <strong>after</strong> the Web Store approves the build — pointing
          sellers at a version that isn&rsquo;t published yet is worse than silence.
        </p>
      </div>
      <div>
        <label htmlFor="device-limit" className="text-micro font-medium text-ink-600">
          Devices per account (global default)
        </label>
        <input
          id="device-limit"
          type="number"
          min={1}
          max={50}
          value={limit}
          onChange={(e) => {
            setLimit(e.target.value);
            setFeedback(null);
          }}
          className={cn(inputClass, "mt-1 w-32 tabular-nums")}
        />
        <p className="mt-1 text-micro text-ink-500">
          A plan can override this with <code>limits.devices</code>.
        </p>
      </div>
      <div>
        <button type="button" onClick={submit} disabled={pending} className={buttonClass}>
          {pending ? "Saving…" : "Save"}
        </button>
        <Note feedback={feedback} />
      </div>
    </div>
  );
}
