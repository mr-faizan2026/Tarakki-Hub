import type { ReactNode } from "react";
import type { Account } from "@/lib/account";
import { planLabel } from "@/lib/account";
import { Wordmark } from "../ui/Wordmark";
import { Icon } from "../ui/Icon";

/**
 * The panel header: who is signed in, their plan and credits, the overflow menu
 * (Part 3) and sign out.
 *
 * `menu` is a slot rather than a prop bundle so the header keeps knowing nothing
 * about devices, onboarding or the licence — it is still just a header.
 */
export function Header({
  account,
  onSignOut,
  menu,
}: {
  account: Account;
  onSignOut: () => void;
  menu?: ReactNode;
}) {
  const credits = account.usage.credits_remaining;
  return (
    <header className="header">
      <Wordmark />
      <div className="row" style={{ gap: 8 }}>
        <div className="header__meta">
          <span className="header__email">{account.user.email}</span>
          <span className="header__creds">
            <span className="plan-chip">{planLabel(account.profile.plan)}</span>
            <span className={credits <= 0 ? "credit-count zero" : "credit-count"}>
              {credits} {credits === 1 ? "credit" : "credits"}
            </span>
          </span>
        </div>
        {menu}
        <button
          type="button"
          className="btn btn-ghost btn--sm"
          onClick={onSignOut}
          title="Sign out"
          aria-label="Sign out"
          style={{ padding: "0 8px" }}
        >
          <Icon name="logout" size={17} />
        </button>
      </div>
    </header>
  );
}
