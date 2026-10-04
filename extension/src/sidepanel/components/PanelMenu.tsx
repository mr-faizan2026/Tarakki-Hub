import { useEffect, useRef, useState } from "react";
import { deviceId } from "@/lib/device";
import { currentVersion } from "@/lib/version";
import { WEB_APP_URL } from "@/lib/config";
import type { ExtensionDeviceInfo } from "@/lib/backend-types";
import { Icon } from "../ui/Icon";
import { relativeTime } from "./DeviceLimit";

/**
 * The panel's overflow menu: reopen the getting-started guide, see which
 * computers are signed in, sign one out, and sign out of the account.
 *
 * ── WHY THE DEVICE LIST LIVES HERE AND NOT ONLY ON THE LIMIT SCREEN ───────
 * Because by the time a seller hits the limit they are already blocked and
 * annoyed. Someone who has just sold their old laptop should be able to sign it
 * out before that happens, and "where are my devices?" with no answer anywhere in
 * the product is a support message.
 *
 * ── KEYBOARD AND FOCUS ───────────────────────────────────────────────────
 * Escape closes it, a click outside closes it, and focus moves into the menu when
 * it opens. The trigger carries `aria-expanded` / `aria-haspopup` so a screen
 * reader announces it as a menu rather than as a mysterious button.
 */
export function PanelMenu({
  devices,
  deviceLimit,
  onReopenGuide,
  onSignOutDevice,
  onSignOut,
}: {
  devices: ExtensionDeviceInfo[];
  deviceLimit: number;
  onReopenGuide: () => void;
  onSignOutDevice: (deviceId: string) => Promise<string | null>;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [thisDevice, setThisDevice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    void deviceId().then((id) => active && setThisDevice(id));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  async function signOutOne(target: string) {
    setBusy(target);
    setError(null);
    try {
      const message = await onSignOutDevice(target);
      setError(message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        type="button"
        className="btn btn-ghost btn--sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="TarakkiHub menu"
        title="Menu"
        style={{ padding: "0 7px" }}
      >
        <Icon name="sliders" size={16} />
      </button>

      {open ? (
        <div
          ref={panelRef}
          role="menu"
          tabIndex={-1}
          aria-label="TarakkiHub menu"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 6px)",
            zIndex: 20,
            width: 270,
            maxWidth: "calc(100vw - 24px)",
            padding: 10,
            border: "1px solid var(--hairline-strong)",
            borderRadius: "var(--radius-lg)",
            background: "var(--surface)",
            boxShadow: "var(--shadow-panel)",
          }}
        >
          <button
            type="button"
            role="menuitem"
            className="btn btn-ghost btn--block btn--sm"
            style={{ justifyContent: "flex-start" }}
            onClick={() => {
              onReopenGuide();
              setOpen(false);
            }}
          >
            Show the getting-started guide
          </button>

          <div
            style={{
              marginTop: 8,
              paddingTop: 8,
              borderTop: "1px solid var(--hairline)",
            }}
          >
            <p className="eyebrow">
              Your computers ({devices.length} of {deviceLimit})
            </p>
            {error ? (
              <p className="error" style={{ marginTop: 4 }}>
                {error}
              </p>
            ) : null}
            {devices.length === 0 ? (
              <p className="hint" style={{ marginTop: 4 }}>
                Nothing to show yet.
              </p>
            ) : (
              <ul
                style={{
                  listStyle: "none",
                  margin: "6px 0 0",
                  padding: 0,
                  display: "grid",
                  gap: 6,
                }}
              >
                {devices.map((device) => {
                  const isThis = thisDevice != null && device.device_id === thisDevice;
                  return (
                    <li key={device.device_id} className="row" style={{ gap: 6 }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13 }}>
                          {device.label ?? "A computer"}
                          {isThis ? (
                            <span className="plan-chip" style={{ marginLeft: 5 }}>
                              This one
                            </span>
                          ) : null}
                        </div>
                        <div className="hint" style={{ fontSize: 11 }}>
                          {relativeTime(device.last_seen_at)}
                        </div>
                      </div>
                      {isThis ? null : (
                        <button
                          type="button"
                          className="btn btn-ghost btn--sm"
                          disabled={busy !== null}
                          onClick={() => void signOutOne(device.device_id)}
                          aria-label={`Sign out ${device.label ?? "this computer"}`}
                          style={{ padding: "0 6px", flexShrink: 0 }}
                        >
                          {busy === device.device_id ? "…" : "Sign out"}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div
            style={{
              marginTop: 8,
              paddingTop: 8,
              borderTop: "1px solid var(--hairline)",
            }}
          >
            <a
              role="menuitem"
              className="btn btn-ghost btn--block btn--sm"
              style={{ justifyContent: "flex-start" }}
              href={`${WEB_APP_URL}/dashboard`}
              target="_blank"
              rel="noreferrer"
            >
              Open the dashboard
            </a>
            <button
              type="button"
              role="menuitem"
              className="btn btn-ghost btn--block btn--sm"
              style={{ justifyContent: "flex-start" }}
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
            >
              Sign out of this account
            </button>
            <p className="hint" style={{ marginTop: 6, fontSize: 11 }}>
              Version {currentVersion()}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
