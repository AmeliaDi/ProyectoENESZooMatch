/**
 * Short vibration through `navigator.vibrate`, guarded: no-op on the server,
 * on browsers without the API (iOS Safari), and when the person asked the OS
 * for reduced motion — a buzz is motion too.
 */

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  try {
    return window.matchMedia(REDUCED_MOTION_QUERY).matches;
  } catch {
    return true;
  }
}

/** Returns whether a vibration was actually requested. */
export function vibrate(pattern: readonly number[]): boolean {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return false;
  if (prefersReducedMotion()) return false;
  try {
    return navigator.vibrate([...pattern]);
  } catch {
    return false;
  }
}
