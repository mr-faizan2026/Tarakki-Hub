import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

const base =
  "group/btn relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-[transform,background-color,border-color,box-shadow,color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 disabled:pointer-events-none disabled:opacity-55";

const variants: Record<Variant, string> = {
  primary:
    "bg-teal-500 text-white shadow-[0_1px_0_0_rgba(11,124,109,0.9),0_10px_24px_-14px_rgba(15,156,136,0.9)] hover:-translate-y-px hover:bg-teal-600 active:translate-y-0 active:bg-teal-700",
  secondary:
    "border border-hairline-strong bg-surface text-ink-800 hover:-translate-y-px hover:border-teal-300 hover:text-ink-900 active:translate-y-0 active:bg-teal-50",
  ghost:
    "text-ink-700 hover:bg-teal-50 hover:text-ink-900 active:bg-teal-100",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 text-small",
  md: "h-11 px-5 text-small",
  lg: "h-12 px-6 text-body",
};

type CommonProps = {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
  block?: boolean;
};

type ButtonAsButton = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof CommonProps> & {
    href?: undefined;
  };

type ButtonAsLink = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof CommonProps> & {
    href: string;
  };

export function Button(props: ButtonAsButton | ButtonAsLink) {
  const {
    variant = "primary",
    size = "md",
    className,
    children,
    block,
    ...rest
  } = props;

  const classes = cn(
    base,
    variants[variant],
    sizes[size],
    block && "w-full",
    className,
  );

  if ("href" in props && props.href !== undefined) {
    const { href, ...anchorRest } = rest as AnchorHTMLAttributes<HTMLAnchorElement>;
    return (
      <a href={href} className={classes} {...anchorRest}>
        {children}
      </a>
    );
  }

  return (
    <button className={classes} {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}>
      {children}
    </button>
  );
}
