/** A deterministic source of uniform values in [0, 1). */
export type Random = () => number;

const MULBERRY_INCREMENT = 0x6d2b79f5;
const UINT32_RANGE = 2 ** 32;

/**
 * Mulberry32 PRNG (Tommy Ettinger). 32-bit state, period 2^32, good enough
 * for layout jitter and synthetic fixtures; not for cryptography.
 */
export function mulberry32(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + MULBERRY_INCREMENT) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / UINT32_RANGE;
  };
}
