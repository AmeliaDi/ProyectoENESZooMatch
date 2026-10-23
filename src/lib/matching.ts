import type { MbtiCode } from "@/types/archetype";
import {
  DIMENSIONS,
  MATCHING_DIMENSIONS,
  microtestData,
  type Dimension,
  type DimensionScores,
  type LikertValue,
  type MatchingDimension,
  type QuizItemId,
} from "@/types/microtest";

export interface QuizAnswer {
  itemId: QuizItemId;
  value: LikertValue;
}

export interface ScoredMicrotest {
  rawScores: DimensionScores;
  normalizedScores: DimensionScores;
  mbtiCode: MbtiCode;
  matchingVector: number[];
}

export interface DimensionJustification {
  dimension: MatchingDimension;
  affinity: number;
}

function emptyScores(): DimensionScores {
  return Object.fromEntries(DIMENSIONS.map((dimension) => [dimension, 0])) as DimensionScores;
}

function mbtiCodeFromScores(scores: DimensionScores): MbtiCode {
  const positive = (dimension: Dimension) => scores[dimension] >= 0.5;
  return `${positive("mbti_extraversion") ? "E" : "I"}${positive("mbti_intuicion") ? "N" : "S"}${positive("mbti_pensamiento") ? "T" : "F"}${positive("mbti_juicio") ? "J" : "P"}` as MbtiCode;
}

export function scoreMicrotest(answers: readonly QuizAnswer[]): ScoredMicrotest {
  const answerByItem = new Map(answers.map((answer) => [answer.itemId, answer.value]));
  if (answerByItem.size !== microtestData.items.length) {
    throw new Error("Incomplete quiz");
  }

  const rawScores = emptyScores();
  const minimumScores = emptyScores();
  const maximumScores = emptyScores();

  for (const item of microtestData.items) {
    const answer = answerByItem.get(item.id);
    if (answer === undefined) {
      throw new Error("Incomplete quiz");
    }

    for (const dimension of DIMENSIONS) {
      const weight = item.pesos[dimension];
      rawScores[dimension] += answer * weight;
      minimumScores[dimension] += weight >= 0 ? weight : weight * 4;
      maximumScores[dimension] += weight >= 0 ? weight * 4 : weight;
    }
  }

  const normalizedScores = emptyScores();
  for (const dimension of DIMENSIONS) {
    const range = maximumScores[dimension] - minimumScores[dimension];
    normalizedScores[dimension] = range === 0
      ? 0.5
      : (rawScores[dimension] - minimumScores[dimension]) / range;
  }

  return {
    rawScores,
    normalizedScores,
    mbtiCode: mbtiCodeFromScores(normalizedScores),
    matchingVector: MATCHING_DIMENSIONS.map((dimension) => normalizedScores[dimension]),
  };
}

export function cosineSimilarity(first: readonly number[], second: readonly number[]): number {
  if (first.length !== second.length || first.length === 0) {
    throw new Error("Vectors must have the same non-zero length");
  }

  let dotProduct = 0;
  let firstMagnitude = 0;
  let secondMagnitude = 0;

  for (let index = 0; index < first.length; index += 1) {
    const firstValue = first[index] ?? 0;
    const secondValue = second[index] ?? 0;
    dotProduct += firstValue * secondValue;
    firstMagnitude += firstValue ** 2;
    secondMagnitude += secondValue ** 2;
  }

  const denominator = Math.sqrt(firstMagnitude) * Math.sqrt(secondMagnitude);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

export function buildDimensionJustification(
  first: readonly number[],
  second: readonly number[],
  limit = 3,
): DimensionJustification[] {
  if (first.length !== MATCHING_DIMENSIONS.length || second.length !== MATCHING_DIMENSIONS.length) {
    throw new Error("Unexpected matching vector length");
  }

  return MATCHING_DIMENSIONS.map((dimension, index) => ({
    dimension,
    affinity: 1 - Math.abs((first[index] ?? 0) - (second[index] ?? 0)),
  }))
    .sort((left, right) => right.affinity - left.affinity)
    .slice(0, Math.max(0, limit));
}
