import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles.css";

/**
 * The boundary wraps App rather than living inside it, so a throw in App's own
 * render — including in the licence and auth reads it does before deciding what to
 * show — is still caught. A side panel that goes white has no address bar and no
 * obvious way back; see ErrorBoundary.tsx.
 */
const container = document.getElementById("root");
if (!container) throw new Error("Missing #root");

/**
 * An unhandled rejection anywhere in the panel. React's boundary above only sees
 * render-time throws, so a floating promise that rejects would otherwise end up as
 * a console warning nobody reads — and in a side panel there is no console in view.
 * Logged, deliberately not surfaced: by definition nothing is waiting on it, so
 * interrupting the seller would be noise.
 */
window.addEventListener("unhandledrejection", (event) => {
  console.error("[TarakkiHub] Unhandled promise rejection in the panel", event.reason);
});

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
