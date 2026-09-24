import { useState } from "react";
import { useAuth } from "./hooks/useAuth";
import { useTabState } from "./hooks/useTabState";
import { Header } from "./components/Header";
import { StatusPill } from "./components/StatusPill";
import { SignIn } from "./components/SignIn";
import { Blocked } from "./components/Blocked";
import { LiveShipping } from "./components/LiveShipping";
import { ImageGenerator } from "./components/ImageGenerator";
import { AutofillPlaceholder } from "./components/AutofillPlaceholder";

/**
 * Side panel root. Renders the right surface for the current state:
 *   loading → sign-in → blocked → the working panel.
 * The working panel stacks top-to-bottom for the narrow width:
 *   header · status · live shipping · image generator · locked autofill.
 */
export function App() {
  const auth = useAuth();
  const { state: tab, rereadShipping, applyImage } = useTabState();
  // A local override so a mid-session block (surfaced by consume_credit) flips
  // the UI immediately without waiting for a profile refetch.
  const [blockedOverride, setBlockedOverride] = useState(false);

  if (auth.loading) {
    return <div className="center-note">Loading…</div>;
  }

  if (!auth.account) {
    return <SignIn onSignIn={auth.signIn} />;
  }

  if (auth.account.blocked || blockedOverride) {
    return <Blocked onSignOut={auth.signOut} />;
  }

  return (
    <div className="app">
      <Header account={auth.account} onSignOut={auth.signOut} />
      <div className="app__body">
        <StatusPill tab={tab} />
        <LiveShipping tab={tab} onReread={rereadShipping} />
        <ImageGenerator
          account={auth.account}
          tab={tab}
          applyImage={applyImage}
          onUsage={auth.applyUsage}
          onBlocked={() => setBlockedOverride(true)}
        />
        <AutofillPlaceholder />
      </div>
    </div>
  );
}
