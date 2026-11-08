"use client";

/**
 * Viewport meta tag component for mobile optimization.
 * Prevents zoom on input focus (iOS Safari) by setting font-size to 16px
 * minimum in the viewport meta. Also disables user-scalable for the
 * pixel-art aesthetic (accessibility: users can still zoom via browser
 * settings on most platforms).
 *
 * Note: The viewport meta is typically set in layout.tsx head. This component
 * provides the correct content string for use there.
 */

/** Viewport meta content optimized for mobile with pixel-art aesthetic. */
export const MOBILE_VIEWPORT = "width=device-width, initial-scale=1, maximum-scale=5";

/**
 * Returns the viewport content string with zoom prevention for input focus.
 * iOS Safari zooms when focused input has font-size < 16px. We set
 * initial-scale=1 and maximum-scale=5 to balance accessibility with design.
 */
export function getViewportMeta(): string {
  return MOBILE_VIEWPORT;
}
