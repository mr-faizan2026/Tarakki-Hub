import { WEB_APP_URL } from "@/lib/config";
import { Wordmark } from "../ui/Wordmark";
import { Icon } from "../ui/Icon";

/** Shown when the admin panel has blocked this account. */
export function Blocked({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div className="auth">
      <div className="auth__head">
        <Wordmark size={30} />
      </div>
      <div className="section" style={{ textAlign: "center" }}>
        <div style={{ color: "var(--danger-500)", display: "flex", justifyContent: "center" }}>
          <Icon name="lock" size={30} />
        </div>
        <h2 style={{ marginTop: 10, fontSize: 18 }}>Account paused</h2>
        <p className="hint" style={{ marginTop: 6 }}>
          This account is currently blocked, so the tools are unavailable. If you
          think this is a mistake, please reach out from the web dashboard.
        </p>
        <div className="stack" style={{ marginTop: 14 }}>
          <a
            className="btn btn-primary btn--block"
            href={`${WEB_APP_URL}/dashboard`}
            target="_blank"
            rel="noreferrer"
          >
            Open the dashboard
          </a>
          <button type="button" className="btn btn-ghost btn--block" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
