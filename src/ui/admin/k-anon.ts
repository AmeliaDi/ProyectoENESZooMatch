/**
 * The k floor of the console (ADR-036). A breakdown cell smaller than the
 * floor could single somebody out, so it is shown as `< k` and plotted as
 * nothing; the total of a section is never suppressed, because a whole that
 * large says nothing about one person.
 */
import { EXPERIENCE } from "@/config";

export const K_FLOOR = EXPERIENCE.admin.kAnonymity;

/** A count, with the text the panel prints and the value a chart may draw. */
export function safe(count: number, floor = K_FLOOR): { value: number; text: string } {
  return count > 0 && count < floor ? { value: 0, text: `< ${floor}` } : { value: count, text: String(count) };
}

/** True while there are people but too few to break down into cells. */
export function tooFewToBreakDown(total: number, floor = K_FLOOR): boolean {
  return total > 0 && total < floor;
}

/**
 * Whether a quantile may be printed. A median over three people is those
 * three people: unlike a count, a quantile carries the value back out, so the
 * floor guards the sample size and not only the cell.
 */
export function publishable(sample: number, floor = K_FLOOR): boolean {
  return sample >= floor;
}

/** The sum of a count column, e.g. the days of a series added up. */
export function sumOf(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
