/**
 * Effect ports. Domain code never reads the wall clock or a secret directly;
 * callers inject these so behaviour is reproducible under test.
 */

export interface Clock {
  now(): Date;
}

/** Keyed hash; the key lives only in the infrastructure implementation. */
export interface Hmac {
  sign(input: string): string;
}

export function fixedClock(at: Date): Clock {
  const time = at.getTime();
  return { now: () => new Date(time) };
}
