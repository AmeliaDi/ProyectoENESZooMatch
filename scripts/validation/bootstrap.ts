/**
 * Paired person-cluster bootstrap of an AUC difference. Pairs sharing a
 * person are not independent, so each replicate resamples PEOPLE and keeps
 * the pairs whose two members were drawn (docs/PREREGISTRO.md §1).
 */
import { auc, quantile } from "@/domain/math";
import type { Random } from "@/domain/shared";

import { bootstrapP } from "./stats";

export interface IndexPair {
  readonly i: number;
  readonly j: number;
}

export interface PairedAuc {
  readonly a: number;
  readonly b: number;
  readonly delta: number;
  readonly lo: number;
  readonly hi: number;
  /** One-sided p for H0: AUC(a) − AUC(b) ≤ 0. */
  readonly p: number;
}

export function pairedAuc(
  people: number,
  pairs: readonly IndexPair[],
  scoresA: readonly number[],
  scoresB: readonly number[],
  labels: readonly boolean[],
  reps: number,
  random: Random,
): PairedAuc {
  const a = auc(scoresA, labels);
  const b = auc(scoresB, labels);
  const draws: number[] = [];
  for (let r = 0; r < reps; r += 1) {
    const drawn = new Array<boolean>(people).fill(false);
    for (let k = 0; k < people; k += 1) drawn[Math.floor(random() * people)] = true;
    const [sa, sb, l]: [number[], number[], boolean[]] = [[], [], []];
    pairs.forEach((p, k) => {
      if (!drawn[p.i] || !drawn[p.j]) return;
      sa.push(scoresA[k]!);
      sb.push(scoresB[k]!);
      l.push(labels[k]!);
    });
    const d = auc(sa, l) - auc(sb, l);
    if (Number.isFinite(d)) draws.push(d);
  }
  return {
    a,
    b,
    delta: a - b,
    lo: draws.length ? quantile(draws, 0.025) : Number.NaN,
    hi: draws.length ? quantile(draws, 0.975) : Number.NaN,
    p: bootstrapP(draws),
  };
}
