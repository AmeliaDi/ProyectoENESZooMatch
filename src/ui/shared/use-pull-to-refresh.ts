"use client";

/**
 * Pull-to-refresh hook for the result view. Detects a downward pull gesture
 * on a scrollable container when scrollTop is 0, then triggers a refresh
 * callback. Visual feedback is handled via CSS on the container element.
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

export interface PullToRefreshOptions {
  /** Distance (px) the user must pull down to trigger refresh. Default 80. */
  threshold?: number;
  /** Maximum pull distance (px). Default 120. */
  maxPull?: number;
  /** Called when the user releases past the threshold. Should return a promise. */
  onRefresh: () => Promise<void>;
}

export type PullState = "idle" | "pulling" | "ready" | "refreshing";

export interface PullToRefreshState {
  /** Current pull distance in px (for CSS transform). */
  pullDistance: number;
  /** Whether the refresh indicator should be visible. */
  visible: boolean;
  /** Current state of the pull gesture. */
  state: PullState;
}

export function usePullToRefresh(
  ref: RefObject<HTMLElement | null>,
  options: PullToRefreshOptions,
): PullToRefreshState {
  const { threshold = 80, maxPull = 120, onRefresh } = options;
  const [pullDistance, setPullDistance] = useState(0);
  const [state, setState] = useState<PullState>("idle");
  const startY = useRef(0);
  const pulling = useRef(false);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const el = ref.current;
    if (!el || el.scrollTop > 0 || state === "refreshing") return;
    const touch = e.touches[0];
    if (!touch) return;
    startY.current = touch.clientY;
    pulling.current = true;
  }, [ref, state]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!pulling.current || state === "refreshing") return;
    const touch = e.touches[0];
    if (!touch) return;
    const dy = Math.max(0, touch.clientY - startY.current);
    // Resistance: the further you pull, the harder it gets.
    const resisted = Math.min(dy * 0.5, maxPull);
    setPullDistance(resisted);
    setState(resisted >= threshold ? "ready" : "pulling");
  }, [state, threshold, maxPull]);

  const handleTouchEnd = useCallback(async () => {
    if (!pulling.current) return;
    pulling.current = false;

    if (state === "ready") {
      setState("refreshing");
      setPullDistance(threshold * 0.6);
      try {
        await onRefresh();
      } finally {
        setState("idle");
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
      setState("idle");
    }
  }, [state, threshold, onRefresh]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: true });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [ref, handleTouchStart, handleTouchMove, handleTouchEnd]);

  return {
    pullDistance,
    visible: pullDistance > 0 || state === "refreshing",
    state,
  };
}
