/**
 * H5 (nested, person-grouped cross-validation of β) and H6 (calibration),
 * docs/PREREGISTRO.md §3. Folds are formed by PERSON: a test pair has both
 * members in the test fold, a training pair both outside it, so no test pair
 * shares a person with training.
 */
import { aggregatePair } from "@/domain/matching";
import { auc, spearman } from "@/domain/math";
import { mulberry32, type Random } from "@/domain/shared";
import type { MatchTrack } from "@/types/microtest";

import { seedFor } from "../matching/track-analysis";
import type { World } from "./context";
import { applyPlatt, brier, ece, fitPlatt, reliabilityBins, type Bin } from "./stats";

export const BETAS = [0, 2, 4, 6, 10, 20] as const;
const OUTER = 5;
const INNER = 4;
const ECE_BINS = 10;

function folds(n: number, k: number, random: Random): number[] {
  const order = Array.from({ length: n }, (_, i) => ({ i, r: random() })).sort((a, b) => a.r - b.r);
  const out = new Array<number>(n).fill(0);
  order.forEach(({ i }, rank) => (out[i] = rank % k));
  return out;
}

const pick = <T>(xs: readonly T[], idx: readonly number[]) => idx.map((k) => xs[k]!);

export interface FoldRow {
  readonly fold: number;
  readonly beta: number;
  readonly tuned: number;
  readonly config: number;
  readonly baseline: number;
}

export interface CalibrationResult {
  readonly brier: number;
  readonly brierBase: number;
  readonly skill: number;
  readonly ece: number;
  readonly decileRho: number;
  readonly bins: Bin[];
}

export interface CrossvalTrack {
  readonly track: MatchTrack;
  readonly label: string;
  readonly folds: FoldRow[];
  readonly calibration: CalibrationResult;
}

export function crossval(world: World, track: MatchTrack, label: string): CrossvalTrack {
  const v = world.views[track];
  const labels = v.labels[label]!;
  const byBeta = new Map(BETAS.map((beta) => [beta, v.pairs.map((p) => aggregatePair(p.sims, { ...v.cfg, beta }).total)]));
  const outer = folds(world.people.length, OUTER, mulberry32(seedFor(`cv:${track}:${label}`)));
  const rows: FoldRow[] = [];
  const oofProb: number[] = [];
  const oofLabel: boolean[] = [];
  const oofScore: number[] = [];
  let baseSum = 0;

  for (let f = 0; f < OUTER; f += 1) {
    const test = v.pairs.flatMap((p, k) => (outer[p.i] === f && outer[p.j] === f ? [k] : []));
    const train = v.pairs.flatMap((p, k) => (outer[p.i] !== f && outer[p.j] !== f ? [k] : []));
    const inner = folds(world.people.length, INNER, mulberry32(seedFor(`cv-inner:${track}:${label}:${f}`)));
    const innerAuc = (beta: number) => {
      let sum = 0;
      for (let g = 0; g < INNER; g += 1) {
        const held = train.filter((k) => inner[v.pairs[k]!.i] === g && inner[v.pairs[k]!.j] === g);
        sum += auc(pick(byBeta.get(beta as (typeof BETAS)[number])!, held), pick(labels, held));
      }
      return sum / INNER;
    };
    const beta = BETAS.reduce((best, b) => (innerAuc(b) > innerAuc(best) ? b : best), BETAS[0]);
    const testLabels = pick(labels, test);
    rows.push({
      fold: f,
      beta,
      tuned: auc(pick(byBeta.get(beta)!, test), testLabels),
      config: auc(pick(v.scores, test), testLabels),
      baseline: auc(pick(v.baseline, test), testLabels),
    });

    const platt = fitPlatt(pick(v.scores, train), pick(labels, train));
    const prevalence = train.filter((k) => labels[k]).length / train.length;
    for (const k of test) {
      oofProb.push(applyPlatt(platt, v.scores[k]!));
      oofScore.push(v.scores[k]!);
      oofLabel.push(labels[k]!);
      baseSum += (prevalence - (labels[k] ? 1 : 0)) ** 2;
    }
  }

  const b = brier(oofProb, oofLabel);
  const brierBase = baseSum / oofLabel.length;
  const deciles = reliabilityBins(oofScore, oofLabel, 10);
  return {
    track,
    label,
    folds: rows,
    calibration: {
      brier: b,
      brierBase,
      skill: 1 - b / brierBase,
      ece: ece(oofProb, oofLabel, ECE_BINS),
      decileRho: spearman(deciles.map((d) => d.meanPredicted), deciles.map((d) => d.observed)),
      bins: reliabilityBins(oofProb, oofLabel, ECE_BINS),
    },
  };
}
