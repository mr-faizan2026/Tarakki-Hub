import { Icon } from "@/components/ui/Icon";

/** Sign out via a server round-trip — clears the session cookies cleanly. */
export function SignOutForm({ className }: { className?: string }) {
  return (
    <form action="/auth/signout" method="post" className={className}>
      <button
        type="submit"
        className="group flex h-11 w-full items-center gap-3 rounded-lg px-3 text-small font-medium text-ink-600 transition-colors hover:bg-canvas-sunk hover:text-ink-900"
      >
        <Icon name="logout" size={20} className="text-ink-400 group-hover:text-ink-600" />
        Sign out
      </button>
    </form>
  );
}
