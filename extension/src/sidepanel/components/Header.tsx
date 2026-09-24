import type { Account } from "@/lib/account";
import { planLabel } from "@/lib/account";
import { Wordmark } from "../ui/Wordmark";
import { Icon } from "../ui/Icon";

export function Header({
  account,
  onSignOut,
}: {
  account: Account;
  onSignOut: () => void;
}) {
  const credits = account.usage.credits_remaining;
  return (
    <header className="header">
      <Wordmark />
      <div className="row" style={{ gap: 10 }}>
        <div className="header__meta">
          <span className="header__email">{account.user.email}</span>
          <span className="header__creds">
            <span className="plan-chip">{planLabel(account.profile.plan)}</span>
            <span className={credits <= 0 ? "credit-count zero" : "credit-count"}>
              {credits} {credits === 1 ? "credit" : "credits"}
            </span>
          </span>
        </div>
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
