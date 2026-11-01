/**
 * Seeded 1D gradient (Perlin) noise for the ambient drift.
 *
 * Drift is applied as a render-only offset, never as a force, so it cannot
 * pump energy into the simulation: a sleeping sky keeps breathing without
 * waking the integrator.
 */

import { fnv1a32 } from "@/domain/shared";

const GOLDEN = 0x9e3779b1;

/** 32-bit avalanche mix (Murmur3 finaliser). */
function mix32(value: number): number {
  let h = value >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Gradient in [-1, 1] at integer lattice point `i`. */
function gradient(seed: number, i: number): number {
  return (mix32(seed ^ Math.imul(i, GOLDEN)) / 0xffffffff) * 2 - 1;
}

/** Quintic fade: C² continuous, so velocity of the drift is continuous too. */
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Perlin noise in [-1, 1]. Zero at lattice points, smooth everywhere and
 * deterministic for a given seed.
 */
export function gradientNoise1D(seed: number, t: number): number {
  const i0 = Math.floor(t);
  const f = t - i0;
  const a = gradient(seed, i0) * f;
  const b = gradient(seed, i0 + 1) * (f - 1);
  // The 1D Perlin extremum is ±0.5; scale to the unit interval.
  return 2 * (a + (b - a) * fade(f));
}

export interface DriftSeed {
  x: number;
  y: number;
}

export function driftSeedFor(id: string): DriftSeed {
  return { x: fnv1a32(`drift:x:${id}`), y: fnv1a32(`drift:y:${id}`) };
}

/** Ambient offset for one star at time `t` (seconds). */
export function driftOffset(
  seed: DriftSeed,
  t: number,
  amplitude: number,
  frequencyHz: number,
): { x: number; y: number } {
  const phase = t * frequencyHz;
  return {
    x: amplitude * gradientNoise1D(seed.x, phase),
    y: amplitude * gradientNoise1D(seed.y, phase),
  };
}
