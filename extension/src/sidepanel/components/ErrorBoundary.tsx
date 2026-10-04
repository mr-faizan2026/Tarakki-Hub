import { Component, type ErrorInfo, type ReactNode } from "react";
import { Wordmark } from "../ui/Wordmark";
import { Icon } from "../ui/Icon";

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  THE PANEL'S LAST LINE OF DEFENCE
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  A React render error in a side panel is uniquely nasty: the panel goes WHITE
 *  and stays white, with no address bar to reload and no obvious way out. The
 *  seller's reasonable conclusion is that the extension is broken, and they
 *  uninstall it. A reload button is the whole difference.
 *
 *  ── WHY IT WRAPS EVERYTHING, INCLUDING THE SIGN-IN SCREEN ─────────────────
 *  Because the most likely source of a render throw is data: a licence row, a
 *  cached config, a saved profile with a shape this build did not expect. All of
 *  that is read before the panel knows whether anyone is signed in.
 *
 *  ── WHAT "RELOAD PANEL" DOES ──────────────────────────────────────────────
 *  `location.reload()` on the panel document — it re-runs the panel and nothing
 *  else. It does NOT reload the extension (that would kill the content scripts on
 *  the seller's Meesho tabs mid-work) and it does not sign anybody out.
 *
 *  The error text is shown rather than hidden. The audience is a seller who will
 *  paste it into a support message, and "something went wrong" wastes that.
 */

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // The panel's own console, which is reachable from the extension's DevTools.
    // Not sent anywhere: a React stack can name props, and props here can hold a
    // seller's own field values. Health events carry no such thing by design, and
    // this must not become the exception (see lib/health.ts).
    console.error("[TarakkiHub] Panel render error", error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="auth" role="alert">
        <div className="auth__head">
          <Wordmark size={30} />
        </div>
        <div className="section" style={{ textAlign: "center" }}>
          <div
            style={{
              color: "var(--danger-500)",
              display: "flex",
              justifyContent: "center",
            }}
          >
            <Icon name="alert" size={28} />
          </div>
          <h2 style={{ marginTop: 10, fontSize: 17 }}>This panel hit a problem</h2>
          <p className="hint" style={{ marginTop: 6 }}>
            Nothing was changed or charged. Reloading usually clears it.
          </p>
          <div className="stack" style={{ marginTop: 14 }}>
            <button
              type="button"
              className="btn btn-primary btn--block"
              onClick={() => location.reload()}
            >
              Reload panel
            </button>
          </div>
          <details style={{ marginTop: 14, textAlign: "left" }}>
            <summary
              className="hint"
              style={{ cursor: "pointer", listStyle: "revert" }}
            >
              Technical details
            </summary>
            <pre
              style={{
                marginTop: 8,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--ink-500)",
              }}
            >
              {error.name}: {error.message}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
