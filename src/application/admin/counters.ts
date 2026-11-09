/**
 * The manual tallies of the console (ADR-036). Deliberately thin: the stored
 * function does the whole job — it clamps at zero under a row lock, refuses a
 * key outside its own pattern and drops the `counter_update` audit row with
 * the before/after it read. A second `recordAudit` here would make the trail
 * say the tally moved twice, so this use case only carries the answer.
 */
import type { CounterMove, CounterState } from "@/contracts/admin";
import type { Result } from "@/domain/shared";

import type { AppError } from "../errors";
import type { AdminDeps } from "./ports";

export function bumpCounter(
  adminId: string,
  move: CounterMove,
  deps: Pick<AdminDeps, "console">,
): Promise<Result<CounterState, AppError>> {
  return deps.console.bumpCounter(adminId, move);
}
