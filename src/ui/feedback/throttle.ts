/**
 * Leading-edge limiter: the first event goes through, the following ones are
 * dropped until `intervalMs` have passed. Pure (the clock is injected) so the
 * rule "one chip per ~120 ms" is unit-tested without timers.
 */
export interface Limiter {
  /** `true` if the event may fire now (and records it), `false` to drop it. */
  tryFire: (now: number) => boolean;
}

export function createLimiter(intervalMs: number): Limiter {
  let last = Number.NEGATIVE_INFINITY;
  return {
    tryFire(now) {
      if (now - last < intervalMs) return false;
      last = now;
      return true;
    },
  };
}
