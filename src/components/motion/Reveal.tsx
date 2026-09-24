"use client";

import { motion, type Variants } from "framer-motion";
import type { ReactNode } from "react";
import { fadeRise, inViewOnce, staggerParent } from "@/lib/motion";

type RevealProps = {
  children: ReactNode;
  className?: string;
  variants?: Variants;
  delay?: number;
  /** Render a stagger parent — children Reveals animate in sequence. */
  as?: "div" | "span" | "li" | "ul" | "section" | "figure";
};

/** Single element scroll entrance. */
export function Reveal({
  children,
  className,
  variants = fadeRise,
  delay = 0,
  as = "div",
}: RevealProps) {
  const MotionTag = motion[as];
  return (
    <MotionTag
      className={className}
      variants={variants}
      initial="hidden"
      whileInView="show"
      viewport={inViewOnce}
      transition={delay ? { delay } : undefined}
    >
      {children}
    </MotionTag>
  );
}

type GroupProps = {
  children: ReactNode;
  className?: string;
  stagger?: number;
  delay?: number;
  as?: "div" | "ul" | "section";
};

/** Parent wrapper that staggers any <Item> children inside it. */
export function RevealGroup({
  children,
  className,
  stagger = 0.055,
  delay = 0,
  as = "div",
}: GroupProps) {
  const MotionTag = motion[as];
  return (
    <MotionTag
      className={className}
      variants={staggerParent(stagger, delay)}
      initial="hidden"
      whileInView="show"
      viewport={inViewOnce}
    >
      {children}
    </MotionTag>
  );
}

/** Child of RevealGroup — inherits the parent's stagger timing. */
export function RevealItem({
  children,
  className,
  variants = fadeRise,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  variants?: Variants;
  as?: "div" | "li" | "span";
}) {
  const MotionTag = motion[as];
  return (
    <MotionTag className={className} variants={variants}>
      {children}
    </MotionTag>
  );
}
