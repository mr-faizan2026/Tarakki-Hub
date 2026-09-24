import { clsx, type ClassValue } from "clsx";

/** Tiny className combiner. Keep it dependency-light for Lighthouse. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
