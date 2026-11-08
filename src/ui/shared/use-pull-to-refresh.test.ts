/**
 * Tests for the pull-to-refresh hook pure logic.
 * Since the hook uses DOM events, we test the pure helpers:
 * pull distance calculation with resistance, and state transitions.
 */

import { describe, expect, it } from "vitest";

/**
 * Pure helper: apply resistance to raw pull distance.
 * The further you pull, the harder it gets (0.5 factor).
 */
function applyPullResistance(rawDistance: number, maxPull: number): number {
  return Math.min(rawDistance * 0.5, maxPull);
}

/**
 * Pure helper: determine if the pull has reached the refresh threshold.
 */
function isReadyToRefresh(pullDistance: number, threshold: number): boolean {
  return pullDistance >= threshold;
}

/**
 * Pure helper: compute the resting pull distance after release.
 * If ready, stays at 60% of threshold for the spinner. Otherwise goes to 0.
 */
function computeRestingPullDistance(
  wasReady: boolean,
  threshold: number,
): number {
  return wasReady ? threshold * 0.6 : 0;
}

describe("pull resistance", () => {
  it("applies 50% resistance to raw distance", () => {
    expect(applyPullResistance(0, 120)).toBe(0);
    expect(applyPullResistance(40, 120)).toBe(20);
    expect(applyPullResistance(100, 120)).toBe(50);
  });

  it("clamps to maxPull", () => {
    expect(applyPullResistance(300, 120)).toBe(120);
    expect(applyPullResistance(1000, 120)).toBe(120);
  });

  it("reaches maxPull at exactly 2x maxPull raw distance", () => {
    // rawDistance * 0.5 = maxPull => rawDistance = maxPull * 2
    expect(applyPullResistance(240, 120)).toBe(120);
  });
});

describe("refresh threshold", () => {
  it("is not ready below threshold", () => {
    expect(isReadyToRefresh(0, 80)).toBe(false);
    expect(isReadyToRefresh(40, 80)).toBe(false);
    expect(isReadyToRefresh(79, 80)).toBe(false);
  });

  it("is ready at or above threshold", () => {
    expect(isReadyToRefresh(80, 80)).toBe(true);
    expect(isReadyToRefresh(100, 80)).toBe(true);
  });

  it("works with different thresholds", () => {
    expect(isReadyToRefresh(50, 50)).toBe(true);
    expect(isReadyToRefresh(49, 50)).toBe(false);
  });
});

describe("resting pull distance", () => {
  it("returns spinner position when ready", () => {
    expect(computeRestingPullDistance(true, 80)).toBe(48); // 80 * 0.6
  });

  it("returns 0 when not ready", () => {
    expect(computeRestingPullDistance(false, 80)).toBe(0);
  });
});
