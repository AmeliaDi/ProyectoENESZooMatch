export const MS_PER_SECOND = 1000;
export const SECONDS_PER_MINUTE = 60;
export const MINUTES_PER_HOUR = 60;
export const HOURS_PER_DAY = 24;
export const MS_PER_MINUTE = SECONDS_PER_MINUTE * MS_PER_SECOND;
export const MS_PER_HOUR = MINUTES_PER_HOUR * MS_PER_MINUTE;
export const MS_PER_DAY = HOURS_PER_DAY * MS_PER_HOUR;

/** Whole seconds from `now` until `until`, never negative (rounded up). */
export function secondsUntil(until: Date | null, now: Date): number {
  if (!until) return 0;
  return Math.max(0, Math.ceil((until.getTime() - now.getTime()) / MS_PER_SECOND));
}
