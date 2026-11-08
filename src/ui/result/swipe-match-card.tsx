"use client";

/**
 * Swipeable match card wrapper. Adds touch gesture support to match cards
 * on mobile: swipe left to pass, swipe right to like.
 *
 * Desktop users still see the regular buttons; the swipe layer only activates
 * on touch devices (detected via `touch-action` and pointer events).
 */

import { useRef, useState, type ReactNode } from "react";

import { useSwipeGesture, type SwipeDirection } from "@/ui/shared/use-swipe-gesture";
import { vibrate } from "@/ui/feedback/haptics";
import { emitSound } from "@/ui/feedback/feedback";

export interface SwipeMatchCardProps {
  children: ReactNode;
  /** Called when the user swipes right (like). */
  onLike?: () => void;
  /** Called when the user swipes left (pass). */
  onPass?: () => void;
  /** Whether swipe gestures are enabled. Default true. */
  enabled?: boolean;
}

export function SwipeMatchCard({
  children,
  onLike,
  onPass,
  enabled = true,
}: SwipeMatchCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [swipeOut, setSwipeOut] = useState<SwipeDirection | null>(null);
  const [dragging, setDragging] = useState(false);

  const dragState = useSwipeGesture(
    cardRef,
    {
      onSwipe: (direction) => {
        setSwipeOut(direction);
        vibrate([20]);
        if (direction === "right") {
          emitSound("match_nuevo");
          onLike?.();
        } else {
          emitSound("tap");
          onPass?.();
        }
        // Reset after animation completes.
        setTimeout(() => setSwipeOut(null), 400);
      },
      onSwipeStart: () => setDragging(true),
      onSwipeEnd: () => setDragging(false),
    },
    { threshold: 80, trackDrag: enabled },
  );

  if (!enabled) {
    return <>{children}</>;
  }

  const transform = swipeOut
    ? undefined
    : dragState.offsetX !== 0
      ? `translateX(${dragState.offsetX}px) rotate(${dragState.rotation}deg)`
      : undefined;

  return (
    <div
      ref={cardRef}
      className="zm-swipe-card"
      data-dragging={dragging}
      data-swipe={swipeOut ?? undefined}
      style={transform ? { transform } : undefined}
      aria-label="Desliza a la derecha para dar me gusta, a la izquierda para pasar"
    >
      {/* Direction hints */}
      <span
        className="zm-swipe-hint zm-swipe-hint--pass"
        data-visible={dragState.direction === "left"}
        aria-hidden="true"
      >
        Pasar
      </span>
      <span
        className="zm-swipe-hint zm-swipe-hint--like"
        data-visible={dragState.direction === "right"}
        aria-hidden="true"
      >
        Me gusta
      </span>
      {children}
    </div>
  );
}
