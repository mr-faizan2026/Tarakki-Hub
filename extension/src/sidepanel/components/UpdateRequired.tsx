import { currentVersion } from "@/lib/version";
import { WEB_APP_URL } from "@/lib/config";
import { Wordmark } from "../ui/Wordmark";
import { Icon } from "../ui/Icon";

/**
 * The hard version floor: this build is below `min_version`, so nothing else runs.
 *
 * ── WHY A BLOCKING SCREEN AND NOT A BANNER ────────────────────────────────
 * The floor is only ever raised for a build that is WRONG about something —
 * selectors that misread a figure, a quote that doesn't match the panel. Letting
 * it keep working behind a dismissible banner means letting it keep being wrong
 * about a seller's live listing, which is the exact failure the ₹288 incident was.
 * A tool that refuses to answer is recoverable; one that answers incorrectly with
 * a confident badge is not.
 *
 * ── WHY THE STEPS ARE SPELLED OUT ─────────────────────────────────────────
 * Chrome updates extensions on its own schedule, which can be hours. "Please
 * update" with no instructions leaves a seller with work to do and nothing to do
 * it with. The three steps below force the update in about twenty seconds, and
 * the Developer-mode caveat is stated rather than assumed, because most sellers
 * will not have that toggle on and the button genuinely will not appear.
 */
export function UpdateRequired({ minVersion }: { minVersion: string }) {
  return (
    <div className="auth" role="alert">
      <div className="auth__head">
        <Wordmark size={30} />
      </div>

      <div className="section">
        <div
          style={{
            color: "var(--amber-500)",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <Icon name="refresh" size={28} />
        </div>
        <h2 style={{ marginTop: 10, fontSize: 17, textAlign: "center" }}>
          Please update TarakkiHub
        </h2>
        <p className="hint" style={{ marginTop: 6, textAlign: "center" }}>
          This version ({currentVersion()}) is no longer safe to use — it can show
          shipping figures that don&rsquo;t match your supplier panel. Version{" "}
          {minVersion} or newer is required.
        </p>

        <ol
          className="hint"
          style={{ marginTop: 14, paddingLeft: 18, display: "grid", gap: 8 }}
        >
          <li>
            Open <strong>chrome://extensions</strong> in a new tab.
          </li>
          <li>
            Turn on <strong>Developer mode</strong> (top right), then press{" "}
            <strong>Update</strong>. If you don&rsquo;t see that switch, skip this
            step.
          </li>
          <li>
            Otherwise just restart Chrome — it installs pending updates on restart.
          </li>
        </ol>

        <p className="hint" style={{ marginTop: 12 }}>
          Your account, credits and saved profiles are untouched.
        </p>

        <div className="stack" style={{ marginTop: 14 }}>
          <a
            className="btn btn-primary btn--block"
            href={`${WEB_APP_URL}/dashboard`}
            target="_blank"
            rel="noreferrer"
          >
            Open the dashboard instead
          </a>
          <button
            type="button"
            className="btn btn-ghost btn--block"
            onClick={() => location.reload()}
          >
            I&rsquo;ve updated — check again
          </button>
        </div>
      </div>
    </div>
  );
}
