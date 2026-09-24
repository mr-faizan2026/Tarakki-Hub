import type { Variants, Transition } from "framer-motion";

/** Engineered, not floaty. Fast entrances, restrained travel. */
export const EASE_OUT_EXPO: [number, number, number, number] = [0.22, 1, 0.36, 1];

export const entrance: Transition = {
  duration: 0.55,
  ease: EASE_OUT_EXPO,
};

/** Fade + short rise. The house entrance. */
export const fadeRise: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: entrance,
  },
};

/** Same, but from the side — for alternating rows. */
export const fadeInLeft: Variants = {
  hidden: { opacity: 0, x: -16 },
  show: { opacity: 1, x: 0, transition: entrance },
};

export const fadeInRight: Variants = {
  hidden: { opacity: 0, x: 16 },
  show: { opacity: 1, x: 0, transition: entrance },
};

/** Parent that staggers its children 40–60ms apart. */
export const staggerParent = (stagger = 0.05, delay = 0): Variants => ({
  hidden: {},
  show: {
    transition: {
      staggerChildren: stagger,
      delayChildren: delay,
    },
  },
});

/** Shared viewport config so entrances only fire once, slightly early. */
export const inViewOnce = {
  once: true,
  margin: "0px 0px -12% 0px",
} as const;
