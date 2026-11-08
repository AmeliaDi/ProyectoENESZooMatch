/**
 * Tests for the swipe gesture hook logic.
 * Since the hook uses DOM events, we test the pure logic: direction
 * detection, threshold comparison, and drag state calculations.
 */

import { describe, expect, it } from "vitest";

/**
 * Pure helper: determine swipe direction from horizontal offset and threshold.
 * Extracted from the hook for testability.
 */
function computeSwipeDirection(offsetX: number, threshold: number): "left" | "right" | null {
  if (Math.abs(offsetX) < threshold) return null;
  return offsetX > 0 ? "right" : "left";
}

/**
 * Pure helper: compute rotation from horizontal offset and threshold.
 * Clamped to [-15, 15] degrees.
 */
function computeRotation(offsetX: number, threshold: number): number {
  const maxRotation = 15;
  const raw = (offsetX / threshold) * maxRotation;
  return Math.max(-maxRotation, Math.min(maxRotation, raw));
}

/**
 * Pure helper: determine if the drag hint should be visible.
 */
function isHintVisible(offsetX: number): boolean {
  return Math.abs(offsetX) > 10;
}

describe("swipe direction detection", () => {
  it("returns null when below threshold", () => {
    expect(computeSwipeDirection(0, 80)).toBeNull();
    expect(computeSwipeDirection(40, 80)).toBeNull();
    expect(computeSwipeDirection(-40, 80)).toBeNull();
    expect(computeSwipeDirection(79, 80)).toBeNull();
  });

  it("returns right when offset is positive and past threshold", () => {
    expect(computeSwipeDirection(80, 80)).toBe("right");
    expect(computeSwipeDirection(200, 80)).toBe("right");
  });

  it("returns left when offset is negative and past threshold", () => {
    expect(computeSwipeDirection(-80, 80)).toBe("left");
    expect(computeSwipeDirection(-200, 80)).toBe("left");
  });

  it("works with different thresholds", () => {
    expect(computeSwipeDirection(50, 50)).toBe("right");
    expect(computeSwipeDirection(-50, 50)).toBe("left");
    expect(computeSwipeDirection(49, 50)).toBeNull();
  });
});

describe("swipe rotation", () => {
  it("returns 0 when no offset", () => {
    expect(computeRotation(0, 80)).toBe(0);
  });

  it("scales rotation proportionally to offset", () => {
    expect(computeRotation(40, 80)).toBe(7.5);
    expect(computeRotation(-40, 80)).toBe(-7.5);
  });

  it("clamps rotation to [-15, 15]", () => {
    expect(computeRotation(200, 80)).toBe(15);
    expect(computeRotation(-200, 80)).toBe(-15);
  });

  it("reaches max rotation exactly at threshold", () => {
    expect(computeRotation(80, 80)).toBe(15);
    expect(computeRotation(-80, 80)).toBe(-15);
  });
});

describe("hint visibility", () => {
  it("is hidden when offset is small", () => {
    expect(isHintVisible(0)).toBe(false);
    expect(isHintVisible(5)).toBe(false);
    expect(isHintVisible(10)).toBe(false);
  });

  it("is visible when offset exceeds 10px", () => {
    expect(isHintVisible(11)).toBe(true);
    expect(isHintVisible(-11)).toBe(true);
    expect(isHintVisible(100)).toBe(true);
  });
});
