/**
 * Comparing two category breadcrumbs.
 *
 * Three places need the same answer — the autofill profile's saved category vs
 * the form on screen, the image tool's picked category vs the form on screen,
 * and the leaf name a warning names — and each had grown its own copy. One
 * implementation, one rule:
 *
 *   WARN ONLY WHEN WE ARE CONFIDENT THEY DIFFER. An unknown category on either
 *   side means silence. A false alarm on every listing teaches the seller to
 *   click past the warning, which is worse than having no warning at all.
 *
 * Nothing here imports anything: the content script uses it too.
 */

/** Separators Meesho uses between breadcrumb levels, plus our own display "›". */
const SEPARATOR = /\s*(?:›|>|\/|»|→)\s*/;

/** Split a breadcrumb into its levels, outermost first. */
export function levelsOf(path: string | null | undefined): string[] {
  if (!path) return [];
  return path
    .split(SEPARATOR)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** The leaf of a breadcrumb: "Women Western › Kurtis" → "Kurtis". "" if unknown. */
export function leafOf(path: string | null | undefined): string {
  const levels = levelsOf(path);
  return levels[levels.length - 1] ?? "";
}

/**
 * True when both breadcrumbs are known AND their leaves clearly name different
 * things. Containment counts as a match, so "Kurtis" and "Kurtis & Kurtas" do
 * not trip the warning.
 */
export function pathsDiffer(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = leafOf(a).toLowerCase();
  const right = leafOf(b).toLowerCase();
  if (!left || !right) return false;
  return !(left === right || left.includes(right) || right.includes(left));
}
