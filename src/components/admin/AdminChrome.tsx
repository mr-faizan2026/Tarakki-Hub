"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { Icon } from "@/components/ui/Icon";

type Props = {
  fullName: string | null;
  email: string | null;
  children: ReactNode;
};

export function AdminChrome({ fullName, email, children }: Props) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      {/* Desktop rail */}
      <aside className="sticky top-0 hidden h-dvh border-r border-hairline bg-surface lg:block">
        <AdminSidebar fullName={fullName} email={email} />
      </aside>

      {/* Content column */}
      <div className="flex min-h-dvh min-w-0 flex-col">
        <AdminTopbar
          fullName={fullName}
          email={email}
          onOpenMenu={() => setOpen(true)}
        />
        <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>

      {/* Mobile drawer */}
      <AnimatePresence>
        {open ? (
          <div className="lg:hidden">
            <motion.div
              key="scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.2 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-ink-900/40 backdrop-blur-[2px]"
            />
            <motion.aside
              key="drawer"
              initial={{ x: reduce ? 0 : "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: reduce ? 0 : "-100%" }}
              transition={{ duration: reduce ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="fixed inset-y-0 left-0 z-50 flex w-[17rem] max-w-[85vw] flex-col border-r border-hairline bg-surface"
            >
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="absolute right-3 top-4 flex h-9 w-9 items-center justify-center rounded-lg text-ink-500 hover:bg-canvas-sunk hover:text-ink-800"
              >
                <Icon name="close" size={18} />
              </button>
              <AdminSidebar
                fullName={fullName}
                email={email}
                onNavigate={() => setOpen(false)}
              />
            </motion.aside>
          </div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
