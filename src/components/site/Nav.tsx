"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Container } from "@/components/ui/Container";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

const links = [
  { label: "How it works", href: "#how" },
  { label: "Features", href: "#features" },
  { label: "Pricing", href: "#pricing" },
];

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Lock body scroll while the mobile menu is open.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,box-shadow] duration-300",
        scrolled || open
          ? "border-b border-hairline bg-canvas/85 backdrop-blur-md"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <Container className="flex h-16 items-center justify-between gap-4">
        <a
          href="#top"
          className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-600"
          aria-label="Tarakki Hub home"
        >
          <Logo />
        </a>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="relative rounded-md px-3 py-2 text-small font-medium text-ink-600 transition-colors hover:text-ink-900"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Button variant="ghost" size="sm" href="/login">
            Sign in
          </Button>
          <Button size="sm" href="/signup">
            Start free
          </Button>
        </div>

        {/* Mobile toggle — a crafted morphing mark, not a stock hamburger */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          className="relative flex h-11 w-11 items-center justify-center rounded-md border border-hairline-strong bg-surface/70 md:hidden"
        >
          <span className="relative block h-3 w-[18px]">
            <motion.span
              className="absolute left-0 top-0 block h-0.5 w-full rounded-full bg-ink-800"
              animate={open ? { rotate: 45, y: 5 } : { rotate: 0, y: 0 }}
              transition={{ duration: reduce ? 0 : 0.2 }}
            />
            <motion.span
              className="absolute bottom-0 left-0 block h-0.5 w-full rounded-full bg-ink-800"
              animate={open ? { rotate: -45, y: -5 } : { rotate: 0, y: 0 }}
              transition={{ duration: reduce ? 0 : 0.2 }}
            />
          </span>
        </button>
      </Container>

      {/* Mobile menu — full-height overlay below the bar */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="mobile-menu"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: reduce ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-x-0 top-16 z-40 h-[calc(100dvh-4rem)] overflow-y-auto border-t border-hairline bg-canvas md:hidden"
          >
            <Container className="flex min-h-full flex-col py-6">
              <div className="flex flex-col">
                {links.map((l, i) => (
                  <motion.a
                    key={l.href}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: reduce ? 0 : 0.04 * i + 0.05 }}
                    className="flex items-center justify-between border-b border-hairline py-4 text-h3 font-medium text-ink-800"
                  >
                    {l.label}
                    <span aria-hidden className="text-ink-300">
                      →
                    </span>
                  </motion.a>
                ))}
              </div>

              <div className="mt-8 grid grid-cols-1 gap-2.5">
                <Button href="/signup" size="lg" block>
                  Start free
                </Button>
                <Button href="/login" variant="secondary" size="lg" block>
                  Sign in
                </Button>
              </div>

              <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-10 text-small text-ink-500">
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
                  No password sharing
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
                  Made for Indian sellers
                </span>
              </div>
            </Container>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
