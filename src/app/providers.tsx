"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Global motion behaviour. `reducedMotion="user"` makes every Framer Motion
 * animation honour the OS setting — transforms drop, opacity stays.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.55 }}>
      {children}
    </MotionConfig>
  );
}
