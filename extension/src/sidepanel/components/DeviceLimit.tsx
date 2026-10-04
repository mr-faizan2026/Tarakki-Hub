import { useEffect, useState } from "react";
import { deviceId } from "@/lib/device";
import type { ExtensionDeviceInfo } from "@/lib/backend-types";
import { Wordmark } from "../ui/Wordmark";
import { Icon } from "../ui/Icon";

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  AT THE DEVICE LIMIT — the seller decides, and there is no way past
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Reached only when registration came back `device_limit`. The seller signs one
 *  install out, and registration is retried.
 *
 *  ── THE RULE THIS SCREEN KEEPS ────────────────────────────────────────────
 *  "Never silently bypass the limit." It is kept by there being nothing here to
 *  bypass: the count is made in SQL, and the endpoint that would have to grant an
 *  extra slot is the one doing the counting. This screen cannot let anybody
 *  through, only help them free a slot.
 *
 *  ── WHY THE LIST READS THE WAY IT DOES ────────────────────────────────────
 *  A seller cannot act on four UUIDs. They can act on "Chrome on Windows · last
 *  used 2 days ago", and on knowing which row is the computer in front of them —
 *  which is marked, because signing THAT one out is the one choice that achieves
 *  nothing.
 */
export function DeviceLimit({
  limit,
  devices,
  onSignOutDevice,
  onSignOut,
}: {
  limit: number;
  devices: ExtensionDeviceInfo[];
  /** Resolves with an error message, or null on success. */
  onSignOutDevice: (deviceId: string) => Promise<string | null>;
  onSignOut: () => void;
}) {
  const [thisDevice, setThisDevice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void deviceId().then((id) => active && setThisDevice(id));
    return () => {
      active = false;
    };
  }, []);

  async function signOutOne(target: string) {
    setBusy(target);
    setError(null);
    try {
      const message = await onSignOutDevice(target);
      if (message) setError(message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="auth" role="alert">
      <div className="auth__head">
        <Wordmark size={30} />
      </div>

      <div className="section">
        <div
          style={{ color: "var(--amber-500)", display: "flex", justifyContent: "center" }}
        >
          <Icon name="lock" size={26} />
        </div>
        <h2 style={{ marginTop: 10, fontSize: 17, textAlign: "center" }}>
          Too many computers
        </h2>
        <p className="hint" style={{ marginTop: 6, textAlign: "center" }}>
          Your plan allows TarakkiHub on {limit}{" "}
          {limit === 1 ? "computer" : "computers"} at a time. Sign one out to use it
          here.
        </p>

        {error ? (
          <div className="alert" style={{ marginTop: 12 }}>
            {error}
          </div>
        ) : null}

        <ul
          style={{
            listStyle: "none",
            margin: "14px 0 0",
            padding: 0,
            display: "grid",
            gap: 8,
          }}
        >
          {devices.map((device) => {
            const isThis = thisDevice != null && device.device_id === thisDevice;
            return (
              <li
                key={device.device_id}
                style={{
                  border: "1px solid var(--hairline)",
                  borderRadius: "var(--radius-lg)",
                  padding: "10px 12px",
                  background: "var(--surface)",
                }}
              >
                <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 500 }}>
                      {device.label ?? "A computer"}
                      {isThis ? (
                        <span className="plan-chip" style={{ marginLeft: 6 }}>
                          This one
                        </span>
                      ) : null}
                    </div>
                    <div className="hint" style={{ marginTop: 2 }}>
                      Last used {relativeTime(device.last_seen_at)}
                      {device.ext_version ? ` · v${device.ext_version}` : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn--sm"
                    disabled={busy !== null}
                    onClick={() => void signOutOne(device.device_id)}
                    aria-label={`Sign out ${device.label ?? "this computer"}`}
                  >
                    {busy === device.device_id ? "Signing out…" : "Sign out"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        {devices.length === 0 ? (
          <p className="hint" style={{ marginTop: 12 }}>
            We couldn&rsquo;t list your computers just now. Check your connection and
            reopen this panel.
          </p>
        ) : null}

        <div className="stack" style={{ marginTop: 14 }}>
          <button
            type="button"
            className="btn btn-ghost btn--block"
            onClick={onSignOut}
          >
            Sign out of this account
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * "2 days ago". Deliberately coarse — the point is to help a seller recognise
 * which computer they haven't touched in a while, not to timestamp their day.
 */
export function relativeTime(iso: string): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "recently";
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 90) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} ${days === 1 ? "day" : "days"} ago`;
  const months = Math.round(days / 30);
  return `${months} ${months === 1 ? "month" : "months"} ago`;
}
