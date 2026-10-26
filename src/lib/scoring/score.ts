import { scoreBigFive } from "@/lib/scoring/bigfive";
import { SCORING_CONFIG } from "@/lib/scoring/config";
import { explainPair } from "@/lib/scoring/explain";
import { scoreMbti } from "@/lib/scoring/mbti";
import {
  hasHardFilterData,
  isHardCompatible,
  scoreOrdinalSimilarity,
  scoreSociocultural,
} from "@/lib/scoring/sociocultural";
import type {
  PairResult,
  PairScore,
  ReasonCode,
  ScoringProfile,
} from "@/lib/scoring/types";

export const INSUFFICIENT_BIGFIVE_MESSAGE =
  "Faltan respuestas Big Five; no es posible calcular un match fiable.";

interface PairEvaluation {
  result: PairResult;
  ranking?: {
    scoreFinal: number;
    bigfive: number;
    mbti: number | null;
  };
}

function isValidBigFive(profile: ScoringProfile["bigFive"]): profile is NonNullable<ScoringProfile["bigFive"]> {
  return Boolean(
    profile &&
      SCORING_CONFIG.bigfive.traits.every((trait) =>
        Number.isFinite(profile[trait]) &&
        profile[trait] >= 0 &&
        profile[trait] <= SCORING_CONFIG.bigfive.maxValue,
      ),
  );
}

function roundScore(value: number): number {
  const scale = SCORING_CONFIG.pair.roundingBase ** SCORING_CONFIG.pair.roundingPlaces;
  return Math.round(value * scale) / scale;
}

function evaluatePair(a: ScoringProfile, b: ScoringProfile): PairEvaluation {
  if (!isValidBigFive(a.bigFive) || !isValidBigFive(b.bigFive)) {
    return {
      result: { status: "insufficient_data", message: INSUFFICIENT_BIGFIVE_MESSAGE },
    };
  }

  if (!isHardCompatible(a.sociocultural, b.sociocultural)) {
    return { result: { status: "excluded", reason: "hard_filter" } };
  }

  const bigFive = scoreBigFive(a.bigFive, b.bigFive);
  const mbti = scoreMbti(a.mbti, b.mbti);
  const sociocultural = scoreSociocultural(a.sociocultural, b.sociocultural);
  const missing: Array<"mbti" | "sociocultural"> = [];
  if (mbti.score === null) missing.push("mbti");
  if (sociocultural === null || !hasHardFilterData(a.sociocultural, b.sociocultural)) {
    missing.push("sociocultural");
  }

  const available = {
    bigfive: bigFive.score,
    mbti: mbti.score,
    sociocultural,
  };
  const baseWeights = SCORING_CONFIG.pair.weights;
  const weightTotal =
    baseWeights.bigfive +
    (available.mbti === null ? 0 : baseWeights.mbti) +
    (available.sociocultural === null ? 0 : baseWeights.sociocultural);
  const appliedWeights = {
    bigfive: baseWeights.bigfive / weightTotal,
    mbti: available.mbti === null ? 0 : baseWeights.mbti / weightTotal,
    sociocultural:
      available.sociocultural === null ? 0 : baseWeights.sociocultural / weightTotal,
  };
  const scoreFinalRaw =
    appliedWeights.bigfive * bigFive.score +
    (available.mbti === null ? 0 : appliedWeights.mbti * available.mbti) +
    (available.sociocultural === null
      ? 0
      : appliedWeights.sociocultural * available.sociocultural);
  const positiveTraitsAverage =
    (a.bigFive.C + b.bigFive.C + a.bigFive.A + b.bigFive.A) /
    (SCORING_CONFIG.bigfive.maxValue * 4);
  const reasons: ReasonCode[] = [];
  if (bigFive.stabilityPenalty) reasons.push("stability_penalty");
  if (bigFive.stabilityBonus) reasons.push("stability_bonus");
  reasons.push("close_traits");
  if (
    positiveTraitsAverage >=
    SCORING_CONFIG.explanation.highConscientiousAgreeableThreshold
  ) {
    reasons.push("high_conscientious_agreeable");
  }
  if (mbti.sharedAxes.length > 0) reasons.push("mbti_shared");
  if (mbti.complementaryAxes.length > 0) reasons.push("mbti_complementary");
  const ordinalSimilarity = scoreOrdinalSimilarity(a.sociocultural, b.sociocultural);
  if (
    ordinalSimilarity !== null &&
    ordinalSimilarity >= SCORING_CONFIG.explanation.valuesAlignedThreshold
  ) {
    reasons.push("values_aligned");
  }
  if (missing.length > 0) reasons.push("partial_data");

  const result: PairScore = {
    status: "ok",
    scoreFinal: roundScore(scoreFinalRaw * SCORING_CONFIG.bigfive.maxValue),
    breakdown: {
      bigfive: roundScore(bigFive.score * SCORING_CONFIG.bigfive.maxValue),
      mbti:
        mbti.score === null
          ? null
          : roundScore(mbti.score * SCORING_CONFIG.bigfive.maxValue),
      sociocultural:
        sociocultural === null
          ? null
          : roundScore(sociocultural * SCORING_CONFIG.bigfive.maxValue),
    },
    partial: missing.length > 0,
    missing,
    appliedWeights,
    reasons,
    explanation: explainPair(reasons, {
      closestTraits: bigFive.closestTraits,
      sharedAxes: mbti.sharedAxes,
      complementaryAxes: mbti.complementaryAxes,
    }),
  };

  return {
    result,
    ranking: {
      scoreFinal: scoreFinalRaw,
      bigfive: bigFive.score,
      mbti: mbti.score,
    },
  };
}

export function scorePair(a: ScoringProfile, b: ScoringProfile): PairResult {
  return evaluatePair(a, b).result;
}

export function scorePairForRanking(
  a: ScoringProfile,
  b: ScoringProfile,
): PairEvaluation {
  return evaluatePair(a, b);
}
