/**
 * Interchangeable matching engines (Fase 6, docs/COMPARATIVA_MODELOS.md).
 *
 * `capas` is the production engine: layered soft-min over latent posteriors,
 * uncertainty-aware, cut at the calibrated permutation-null quantile.
 * `coseno` is the descriptive-cosine challenger — the previous engine's core
 * idea, kept selectable ONLY so the shadow run has a real alternative for the
 * rollout gates to judge. It ignores uncertainty, floors and the soft-min, and
 * the gates are expected to reject it; nothing activates it by default.
 *
/**
 * Both share hard filters, the calibrated cut, top-K, canonical ordering and
 * deduplication, so a comparison isolates the scoring rule and nothing else.
 */
import { cosine } from "@/domain/math";
import type { MatchingConfig } from "@/types/matching-config";

import {
  computeWith,
  layeredEvaluator,
  type GlobalMatch,
  type PairEvaluator,
  type PoolEntry,
} from "./compute-matches";

export const ENGINE_IDS = ["capas", "coseno"] as const;
export type EngineId = (typeof ENGINE_IDS)[number];

/** Rollback target: the engine that is live today. */
export const DEFAULT_ENGINE: EngineId = "capas";

export interface MatchingEngine {
  readonly id: EngineId;
  /** The scoring rule alone; selection machinery is shared (./compute-matches). */
  readonly evaluate: PairEvaluator;
  compute(pool: readonly PoolEntry[], config: MatchingConfig): GlobalMatch[];
}

/** Uncentered cosine of the descriptive [0, 1] track vectors. */
export const cosineEvaluator: PairEvaluator = (a, b, track) => {
  const left = track === "romance" ? a.romanceVector : a.friendshipVector;
  const right = track === "romance" ? b.romanceVector : b.friendshipVector;
  if (left.length === 0 || left.length !== right.length) return null;
  return { similarity: cosine(left, right) };
};

export const ENGINES: Readonly<Record<EngineId, MatchingEngine>> = {
  capas: { id: "capas", evaluate: layeredEvaluator, compute: (pool, config) => computeWith(pool, config, layeredEvaluator) },
  coseno: { id: "coseno", evaluate: cosineEvaluator, compute: (pool, config) => computeWith(pool, config, cosineEvaluator) },
};

/** @throws On an unknown id: a typo in the flag must not silently pick an engine. */
export function resolveEngine(id: string): MatchingEngine {
  const engine = (ENGINES as Record<string, MatchingEngine | undefined>)[id];
  if (!engine) throw new Error(`Unknown MATCHING_ENGINE "${id}"; expected one of ${ENGINE_IDS.join(", ")}`);
  return engine;
}