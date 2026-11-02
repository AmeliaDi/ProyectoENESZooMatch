/**
 * Synthetic data under the SAME model the scorer inverts (docs/MATCHING.md §5):
 *
 *   θ ~ N(0, R)        via θ = L z, R = L Lᵀ (Cholesky), z ~ N(0, I)
 *   X' = 1 + #{j : a·θ_f + ε > a·b_j},  ε ~ N(0, 1)
 *
 * which reproduces P(X' ≥ j+1 | θ) = Φ(a(θ − b_j)) exactly. Used by tests and
 * by the offline calibration script; never by the request path.
 */
import { cholesky, gaussian, matVec, type Matrix } from "@/domain/math";
import type { Random } from "@/domain/shared";

import { LIKERT_CATEGORIES, type GrmItem } from "./grm";
import type { LatentResponse, MeasurementModel } from "./latent";

const LIKERT_REVERSE_PIVOT = LIKERT_CATEGORIES + 1;

/** Lower Cholesky factor of the prior correlation. */
export function priorFactor(correlation: Matrix): Matrix {
  return cholesky(correlation.map((row) => [...row])).lower;
}

export function drawTheta(lower: Matrix, random: Random): number[] {
  return matVec(lower, lower.map(() => gaussian(random)));
}

export function drawResponse(item: GrmItem, theta: number, random: Random): number {
  const latent = item.a * theta + gaussian(random);
  let keyed = 1;
  for (const b of item.b) if (latent > item.a * b) keyed += 1;
  return item.clave === 1 ? keyed : LIKERT_REVERSE_PIVOT - keyed;
}

/** Responses to `itemIds` (presentation order) for a person at `theta`. */
export function simulateResponses(
  model: MeasurementModel,
  itemIds: readonly string[],
  theta: readonly number[],
  random: Random,
): LatentResponse[] {
  return itemIds.flatMap((itemId) => {
    const item = model.items.get(itemId);
    return item ? [{ itemId, value: drawResponse(item, theta[item.index]!, random) }] : [];
  });
}
