import { Icon } from "@/components/ui/Icon";
import { Badge } from "@/components/ui/Badge";

/**
 * Prompt for the (separate, upcoming) browser extension where the seller tools
 * now live — listing autofill, templates and the image tool. Placeholder until
 * that build ships and a download link is available.
 */
export function ChromeExtensionCard() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-hairline bg-ink-900 p-6 text-white">
      <div aria-hidden className="wash-ink absolute inset-0 opacity-80" />
      <div className="relative">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-teal-200 ring-1 ring-inset ring-white/15">
            <Icon name="puzzle" size={19} />
          </span>
          <Badge tone="ink">Coming soon</Badge>
        </div>
        <h3 className="mt-4 font-display text-h4 font-semibold text-white">
          Get the Chrome extension
        </h3>
        <p className="mt-1.5 text-small leading-relaxed text-ink-200">
          Listing autofill, templates and the image tool all run inside your
          browser, straight onto your supplier panel. We&apos;ll drop the
          download here the moment it&apos;s ready.
        </p>
        <button
          type="button"
          disabled
          className="mt-4 inline-flex h-10 cursor-not-allowed items-center gap-2 rounded-md bg-white/10 px-4 text-small font-medium text-white/70 ring-1 ring-inset ring-white/15"
        >
          <Icon name="download" size={16} />
          Add to Chrome
        </button>
      </div>
    </div>
  );
}
