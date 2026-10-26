import { scoreBigFive } from "@/lib/scoring/bigfive";
import type { BigFiveWeights } from "@/lib/scoring/calibration";
import { SCORING_CONFIG } from "@/lib/scoring/config";
import { explainPair } from "@/lib/scoring/explain";
import { scoreMbti } from "@/lib/scoring/mbti";
import {
  hasHardFilterData,
  hasRelationshipData,
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

function alignedOrdinalAnswer(
  a: ScoringProfile["sociocultural"],
  b: ScoringProfile["sociocultural"],
  key: string,
): boolean {
  const left = a?.ordinal?.[key];
  const right = b?.ordinal?.[key];
  if (typeof left !== "number" || !Number.isFinite(left)) return false;
  if (typeof right !== "number" || !Number.isFinite(right)) return false;
  const { alignedAnswerMinimum, alignedAnswerDifference, alignedAnswerMeanMinimum } =
    SCORING_CONFIG.explanation;
  return (
    (left >= alignedAnswerMinimum && right >= alignedAnswerMinimum) ||
    (Math.abs(left - right) <= alignedAnswerDifference &&
      (left + right) / 2 >= alignedAnswerMeanMinimum)
  );
}

function evaluatePair(
  a: ScoringProfile,
  b: ScoringProfile,
  weights: BigFiveWeights = SCORING_CONFIG.bigfive.weights,
): PairEvaluation {
  if (!isValidBigFive(a.bigFive) || !isValidBigFive(b.bigFive)) {
    return {
      result: { status: "insufficient_data", message: INSUFFICIENT_BIGFIVE_MESSAGE },
    };
  }

  if (!isHardCompatible(a.sociocultural, b.sociocultural)) {
    return { result: { status: "excluded", reason: "hard_filter" } };
  }

  const bigFive = scoreBigFive(a.bigFive, b.bigFive, weights);
  const mbti = scoreMbti(a.mbti, b.mbti);
  const sociocultural = scoreSociocultural(a.sociocultural, b.sociocultural);
  const missing: Array<"mbti" | "sociocultural"> = [];
  if (mbti.score === null) missing.push("mbti");
  if (
    sociocultural === null ||
    !hasHardFilterData(a.sociocultural, b.sociocultural) ||
    !hasRelationshipData(a.sociocultural, b.sociocultural)
  ) {
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
  const conscientiousAgreeableThreshold =
    SCORING_CONFIG.explanation.highConscientiousAgreeableThreshold;
  const eachProfileHasHighConscientiousnessAndAgreeableness = [a, b].every(
    (profile) =>
      profile.bigFive!.C / SCORING_CONFIG.bigfive.maxValue >=
        conscientiousAgreeableThreshold &&
      profile.bigFive!.A / SCORING_CONFIG.bigfive.maxValue >=
        conscientiousAgreeableThreshold,
  );
  const reasons: ReasonCode[] = [];
  if (bigFive.stabilityPenalty) reasons.push("stability_penalty");
  if (bigFive.stabilityBonus) reasons.push("stability_bonus");
  reasons.push("close_traits");
  if (eachProfileHasHighConscientiousnessAndAgreeableness) {
    reasons.push("high_conscientious_agreeable");
  }
  if (mbti.sharedAxes.length > 0) reasons.push("mbti_shared");
  if (mbti.complementaryAxes.length > 0) reasons.push("mbti_complementary");
  if (alignedOrdinalAnswer(a.sociocultural, b.sociocultural, "valores_gestion_conflicto")) {
    reasons.push("conflict_style_aligned");
  }
  if (alignedOrdinalAnswer(a.sociocultural, b.sociocultural, "valores_empatia")) {
    reasons.push("empathy_aligned");
  }
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

export function scorePair(
  a: ScoringProfile,
  b: ScoringProfile,
  weights: BigFiveWeights = SCORING_CONFIG.bigfive.weights,
): PairResult {
  return evaluatePair(a, b, weights).result;
}

export function scorePairForRanking(
  a: ScoringProfile,
  b: ScoringProfile,
  weights: BigFiveWeights = SCORING_CONFIG.bigfive.weights,
): PairEvaluation {
  return evaluatePair(a, b, weights);
}
