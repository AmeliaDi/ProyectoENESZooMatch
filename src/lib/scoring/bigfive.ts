import { SCORING_CONFIG } from "@/lib/scoring/config";
import type { BigFiveWeights } from "@/lib/scoring/calibration";
import type { BigFive } from "@/lib/scoring/types";

export interface BigFiveScore {
  score: number;
  similarity: number;
  stabilityBonus: boolean;
  stabilityPenalty: boolean;
  closestTraits: Array<keyof BigFive>;
}

export function scoreBigFive(
  a: BigFive,
  b: BigFive,
  weights: BigFiveWeights = SCORING_CONFIG.bigfive.weights,
): BigFiveScore {
  const { traits, maxValue } = SCORING_CONFIG.bigfive;
  const euclid = Math.sqrt(
    traits.reduce((sum, trait) => sum + (a[trait] - b[trait]) ** 2, 0),
  );
  const similarity = 1 - euclid / (maxValue * Math.sqrt(traits.length));
  const f = 1 - (a.N + b.N) / (maxValue * 2);
  const g = (a.C + b.C + a.A + b.A) / (maxValue * 4);
  let score =
    weights.similarity * similarity +
    weights.lowNeuroticism * f +
    weights.conscientiousAgreeable * g;

  const stabilityPenalty =
    a.N > SCORING_CONFIG.bigfive.highNeuroticismThreshold &&
    b.N > SCORING_CONFIG.bigfive.highNeuroticismThreshold;
  const stabilityBonus =
    !stabilityPenalty &&
    a.N < SCORING_CONFIG.bigfive.lowNeuroticismThreshold &&
    b.N < SCORING_CONFIG.bigfive.lowNeuroticismThreshold;

  if (stabilityPenalty) {
    score *= SCORING_CONFIG.bigfive.stabilityPenaltyMultiplier;
  } else if (stabilityBonus) {
    score = Math.min(1, score + SCORING_CONFIG.bigfive.stabilityBonus);
  }

  const closestTraits = traits
    .map((trait, index) => ({
      trait,
      index,
      distance: Math.abs(a[trait] - b[trait]),
    }))
    .sort((left, right) => left.distance - right.distance || left.index - right.index)
    .slice(0, SCORING_CONFIG.bigfive.closestTraitCount)
    .map(({ trait }) => trait);

  return { score, similarity, stabilityBonus, stabilityPenalty, closestTraits };
}
