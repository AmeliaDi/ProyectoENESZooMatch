import { ENGINES, DEFAULT_ENGINE, MATCHING_CONFIG, type GlobalMatch, type MatchingEngine } from "@/domain/matching";
import { err, ok, type Result } from "@/domain/shared";

import type { AppError } from "./errors";
import type { MatchRepository, ProfileRepository, Scheduler } from "./ports";

/** Attempts to replace the global match set when the profile pool changes mid-run. */
export const RECOMPUTE_MAX_ATTEMPTS = 5;

const BACKOFF_BASE_MS = 50;
const BACKOFF_JITTER_MS = 50;
const BACKOFF_MAX_MS = 200;

/** Short exponential backoff with jitter (50-200 ms) between recompute attempts. */
export function recomputeBackoffMs(attempt: number, random: () => number): number {
  const exponential = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** attempt);
  return Math.min(BACKOFF_MAX_MS, exponential + Math.floor(random() * BACKOFF_JITTER_MS));
}

export interface RecomputeDeps {
  profiles: Pick<ProfileRepository, "loadCompletedPool">;
  matches: Pick<MatchRepository, "poolVersion" | "replaceAll">;
  scheduler: Scheduler;
  /** Injected from `MATCHING_ENGINE` at the composition root; absent means the live engine. */
  engine?: MatchingEngine;
}

/**
 * Recomputes every pair from the completed pool and publishes it atomically.
 * The pool version is read before the pool, so any submission, retake or
 * deletion in between makes the write fail and the run is retried.
 */
export async function recomputeMatches(
  deps: RecomputeDeps,
): Promise<Result<GlobalMatch[], Extract<AppError, "storage.failed" | "match.pool_unstable">>> {
  for (let attempt = 0; attempt < RECOMPUTE_MAX_ATTEMPTS; attempt += 1) {
    const version = await deps.matches.poolVersion();
    if (!version.ok) return version;
    const pool = await deps.profiles.loadCompletedPool();
    if (!pool.ok) return pool;

    const pairs = (deps.engine ?? ENGINES[DEFAULT_ENGINE]).compute(pool.value, MATCHING_CONFIG);
    const replaced = await deps.matches.replaceAll(pairs, version.value);
    if (!replaced.ok) return replaced;
    if (replaced.value === "replaced") return ok(pairs);

    if (attempt < RECOMPUTE_MAX_ATTEMPTS - 1) {
      await deps.scheduler.sleep(recomputeBackoffMs(attempt, deps.scheduler.random));
    }
  }
  return err("match.pool_unstable");
}
