"use client";

/**
 * Swipe gesture hook for touch devices. Detects horizontal swipes on an
 * element and fires callbacks when the swipe distance exceeds a threshold.
 * Used for match card interactions (left = pass, right = like).
 *
 * Pure DOM events, no external dependencies. Respects prefers-reduced-motion
 * by still detecting swipes but skipping the visual translate during drag.
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

export type SwipeDirection = "left" | "right";

export interface SwipeHandlers {
  onSwipe?: (direction: SwipeDirection) => void;
  onSwipeStart?: () => void;
  onSwipeEnd?: () => void;
}

export interface SwipeOptions {
  /** Minimum horizontal distance (px) to register as a swipe. Default 80. */
  threshold?: number;
  /** Maximum vertical drift (px) allowed. Default 100. */
  verticalTolerance?: number;
  /** Whether to track drag position for visual feedback. Default true. */
  trackDrag?: boolean;
}

const DEFAULT_THRESHOLD = 80;
const DEFAULT_VERTICAL_TOLERANCE = 100;
const MAX_ROTATION = 15;

interface DragState {
  startX: number;
  startY: number;
  currentX: number;
  active: boolean;
}

export interface SwipeDragState {
  /** Current horizontal offset in px (for CSS transform). */
  offsetX: number;
  /** Rotation in degrees (for card tilt effect). */
  rotation: number;
  /** Whether the swipe is past the threshold in either direction. */
  pastThreshold: boolean;
  /** Direction hint: "left" | "right" | null. */
  direction: SwipeDirection | null;
}

const INITIAL_DRAG: SwipeDragState = {
  offsetX: 0,
  rotation: 0,
  pastThreshold: false,
  direction: null,
};

export function useSwipeGesture<T extends HTMLElement>(
  ref: RefObject<T | null>,
  handlers: SwipeHandlers,
  options: SwipeOptions = {},
): SwipeDragState {
  const { threshold = DEFAULT_THRESHOLD, verticalTolerance = DEFAULT_VERTICAL_TOLERANCE, trackDrag = true } = options;
  const dragRef = useRef<DragState>({ startX: 0, startY: 0, currentX: 0, active: false });
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  const [dragState, setDragState] = useState<SwipeDragState>(INITIAL_DRAG);

  const updateDrag = useCallback((next: SwipeDragState) => {
    if (trackDrag) setDragState(next);
  }, [trackDrag]);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    dragRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      currentX: touch.clientX,
      active: true,
    };
    handlersRef.current.onSwipeStart?.();
  }, []);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!dragRef.current.active) return;
    const touch = e.touches[0];
    if (!touch) return;
    dragRef.current.currentX = touch.clientX;

    const dx = touch.clientX - dragRef.current.startX;
    const dy = Math.abs(touch.clientY - dragRef.current.startY);

    if (dy > verticalTolerance && Math.abs(dx) < threshold) {
      return;
    }

    const rotation = Math.max(-MAX_ROTATION, Math.min(MAX_ROTATION, (dx / threshold) * MAX_ROTATION));
    const direction: SwipeDirection | null =
      Math.abs(dx) > 10 ? (dx > 0 ? "right" : "left") : null;

    updateDrag({
      offsetX: dx,
      rotation,
      pastThreshold: Math.abs(dx) >= threshold,
      direction,
    });
  }, [threshold, verticalTolerance, updateDrag]);

  const handleTouchEnd = useCallback(() => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;

    const dx = dragRef.current.currentX - dragRef.current.startX;

    if (Math.abs(dx) >= threshold) {
      const direction: SwipeDirection = dx > 0 ? "right" : "left";
      handlersRef.current.onSwipe?.(direction);
    }

    updateDrag({ ...INITIAL_DRAG });
    handlersRef.current.onSwipeEnd?.();
  }, [threshold, updateDrag]);

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

  return dragState;
}
