import type { Testimonial as T } from "@/content/testimonials";
import { cn } from "@/lib/cn";

function initials(name: string) {
  const parts = name.replace(/[^A-Za-z .]/g, "").trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const second = parts[1]?.[0] ?? "";
  return (first + second).toUpperCase();
}

export function TestimonialCard({
  t,
  className,
}: {
  t: T;
  className?: string;
}) {
  return (
    <figure
      className={cn(
        "flex break-inside-avoid flex-col rounded-lg border border-hairline bg-surface p-5",
        t.featured && "bg-teal-50/40 ring-1 ring-teal-100",
        className,
      )}
    >
      <blockquote
        className={cn(
          "text-ink-800",
          t.featured ? "text-lead" : "text-body",
        )}
      >
        {t.quote}
      </blockquote>

      <figcaption className="mt-5 flex items-center gap-3">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-micro font-bold",
            t.featured ? "bg-teal-500 text-white" : "bg-ink-800 text-teal-100",
          )}
          aria-hidden
        >
          {initials(t.name)}
        </span>
        <div className="min-w-0">
          <div className="truncate text-small font-semibold text-ink-900">
            {t.name}
          </div>
          <div className="truncate text-micro text-ink-500">
            {t.trade} · {t.city}
          </div>
        </div>
        <span className="ml-auto shrink-0 rounded-full border border-hairline-strong px-2 py-0.5 text-micro font-medium text-ink-500">
          {t.skus}
        </span>
      </figcaption>
    </figure>
  );
}
