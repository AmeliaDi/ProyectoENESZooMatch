"use client";

/**
 * Constellation render layer — small client hooks.
 *
 * Kept in one module so the components stay readable, and so the two pieces of
 * browser plumbing the canvas needs (reduced-motion detection and container
 * measurement) are each implemented exactly once.
 */

import { useEffect, useRef, useState, type RefObject } from "react";

/** Media query used everywhere reduced motion matters. */
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Live `prefers-reduced-motion` flag.
 *
 * The first render always reports `false` (even on the client) so the server and
 * client HTML match during hydration; the real value is read in an effect and
 * kept in sync if the user changes the OS setting mid-session. Pass `override`
 * to force a value — `ConstellationView` uses it for its `reducedMotion` prop.
 */
export function useReducedMotionPreference(override?: boolean): boolean {
  const [prefers, setPrefers] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(REDUCED_MOTION_QUERY);
    const onChange = (): void => setPrefers(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return override ?? prefers;
}

/**
 * Measures an element with `ResizeObserver` and reports integer CSS pixel sizes.
 *
 * `width === 0` means "not measured yet"; callers must not build a layout until
 * it is non-zero. Updates are suppressed when the rounded size has not changed,
 * so scrollbars and sub-pixel jitter never trigger a (very expensive) rebuild.
 */
export function useElementSize<T extends HTMLElement = HTMLDivElement>(): {
  ref: RefObject<T | null>;
  width: number;
  height: number;
} {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const apply = (nextWidth: number, nextHeight: number): void => {
      const width = Math.round(nextWidth);
      const height = Math.round(nextHeight);
      setSize((current) =>
        current.width === width && current.height === height ? current : { width, height },
      );
    };

    const box = element.getBoundingClientRect();
    apply(box.width, box.height);

    if (typeof ResizeObserver !== "function") {
      const onResize = (): void => {
        const rect = element.getBoundingClientRect();
        apply(rect.width, rect.height);
      };
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) apply(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, width: size.width, height: size.height };
}
