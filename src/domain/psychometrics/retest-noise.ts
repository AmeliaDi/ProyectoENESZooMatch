/**
 * Retest noise of the factors measured with a single item (criterio I5, pase
 * B8.4): the same latent person answers twice and only the flagged items are
 * re-drawn, so |Δ score| is measurement noise and nothing else. Reported in
 * multiples of the useful band (umbral → reference_high), which is the only
 * interval a user can actually tell apart.
 *
 * Harness-only: no request path imports this. Seeds are fixed, so the numbers
 * printed by the test and by `scripts/matching/balance.ts` are the same run.
 */
import { MATCHING_CONFIG, QUIZ_ITEMS } from "@/config";
import { PSYCHOMETRIC_PARAMS } from "@/config/psychometric-params";
import { pairScore } from "@/domain/matching/pair-score";
import type { Matrix } from "@/domain/math";
import { mulberry32 } from "@/domain/shared/random";
import type { MatchTrack } from "@/types/microtest";

import { type MeasurementModel, scoreLatent } from "./latent";
import { drawTheta, priorFactor, simulateResponses } from "./simulate";

export const RETEST_REPS = 120;

/** Width of the band a user can tell apart: published threshold → reference high. */
export function usefulBand(track: MatchTrack = "romance"): number {
  const t = MATCHING_CONFIG.tracks[track];
  return t.reference_high - t.minimum_similarity_exclusive;
}

export function retestThreshold(track: MatchTrack = "romance"): number {
  return MATCHING_CONFIG.tracks[track].minimum_similarity_exclusive;
}

export function retestPriorFactor(): Matrix {
  return priorFactor(PSYCHOMETRIC_PARAMS.covarianza_latente.matriz);
}

/** Ítems que el modelo de medición conoce, agrupados por factor. */
export function itemsByFactor(source?: readonly string[]): Map<string, string[]> {
  const known = new Set(Object.keys(PSYCHOMETRIC_PARAMS.items));
  const ids = source ? new Set(source) : null;
  const map = new Map<string, string[]>();
  for (const item of QUIZ_ITEMS) {
    if (!item.factor || !known.has(item.id)) continue;
    if (ids && !ids.has(item.id)) continue;
    const list = map.get(item.factor) ?? [];
    list.push(item.id);
    map.set(item.factor, list);
  }
  return map;
}

/**
 * Ítems que viajan solos dentro de `answered`: un factor puede tener más ítems
 * en el banco, pero quien solo contesta ese camino tiene una pregunta para él.
 */
export function singleItemIds(answered: readonly string[]): string[] {
  const single = new Set(
    [...itemsByFactor(answered).entries()].filter(([, ids]) => ids.length === 1).map(([factor]) => factor),
  );
  const factorOf = new Map(QUIZ_ITEMS.map((item) => [item.id, item.factor]));
  return answered.filter((id) => single.has(factorOf.get(id) ?? ""));
}

export interface RetestSample {
  readonly label: string;
  readonly answered: number;
  readonly singleItems: number;
  readonly singleShare: number;
  readonly mean: number;
  readonly p50: number;
  readonly p90: number;
  readonly max: number;
  readonly overBand: number;
  readonly flips: number;
  readonly reps: number;
  readonly band: number;
}

/**
 * Two sessions of the same person over `answered`, re-drawing only `noisy`.
 * `mean / band` is the rail B8.4 asks for (≤ 0,35×) and `p90 / band` the
 * worst-case rail (≤ 1,0×).
 */
export function measureRetest(
  label: string,
  answered: readonly string[],
  noisy: readonly string[],
  model: MeasurementModel,
  lower: Matrix,
  track: MatchTrack = "romance",
  reps = RETEST_REPS,
): RetestSample {
  const band = usefulBand(track);
  const threshold = retestThreshold(track);
  const noisySet = new Set(noisy);
  const stable = answered.filter((id) => !noisySet.has(id));

  let sum = 0;
  let max = 0;
  let overBand = 0;
  let flips = 0;
  const quantiles: number[] = [];

  for (let r = 0; r < reps; r += 1) {
    // La misma persona latente, dos sesiones: solo cambian las respuestas.
    const truthA = drawTheta(lower, mulberry32(210000 + r));
    const truthB = drawTheta(lower, mulberry32(410000 + r));

    const responsesA = [...simulateResponses(model, stable, truthA, mulberry32(310000 + r)), ...simulateResponses(model, noisy, truthA, mulberry32(610000 + r))];
    const responsesB = [...simulateResponses(model, stable, truthB, mulberry32(510000 + r)), ...simulateResponses(model, noisy, truthB, mulberry32(710000 + r))];
    // Réplica 2: mismo θ, mismo set estable, distinto sorteo en los ítems únicos.
    const againA = [...responsesA.filter((x) => !noisySet.has(x.itemId)), ...simulateResponses(model, noisy, truthA, mulberry32(810000 + r))];
    const againB = [...responsesB.filter((x) => !noisySet.has(x.itemId)), ...simulateResponses(model, noisy, truthB, mulberry32(910000 + r))];

    const total = (a: typeof responsesA, b: typeof responsesB) =>
      pairScore(
        scoreLatent(model, a, MATCHING_CONFIG.quality),
        scoreLatent(model, b, MATCHING_CONFIG.quality),
        MATCHING_CONFIG.tracks[track],
        MATCHING_CONFIG.categories,
      ).total;

    const d = Math.abs(total(responsesA, responsesB) - total(againA, againB));
    sum += d;
    max = Math.max(max, d);
    if (d >= band) overBand += 1;
    if (total(responsesA, responsesB) >= threshold !== total(againA, againB) >= threshold) flips += 1;
    quantiles.push(d);
  }

  quantiles.sort((x, y) => x - y);
  const q = (p: number) => quantiles[Math.floor(p * (reps - 1))]!;
  return {
    label,
    answered: answered.length,
    singleItems: noisy.length,
    singleShare: noisy.length / answered.length,
    mean: sum / reps,
    p50: q(0.5),
    p90: q(0.9),
    max,
    overBand,
    flips,
    reps,
    band,
  };
}
