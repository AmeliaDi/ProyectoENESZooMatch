import { createHash } from "node:crypto";

import archetypeData from "../data/arquetipos.json";
import { cosineSimilarity } from "../src/lib/matching";
import { MATCHING_DIMENSIONS, type MatchingDimension } from "../src/types/microtest";
import type { Archetype, ArchetypeCatalog, MbtiCode } from "../src/types/archetype";

export const SYNTHETIC_PROFILE_COUNT = 500;
export const SYNTHETIC_SEED = 0x5a4f4f4d;
export const INITIAL_MATCH_THRESHOLD = 0.85;
export const TARGET_COVERAGE_RATE = 0.2;

const MBTI_CODES: readonly MbtiCode[] = [
  "INTJ", "INTP", "ENTJ", "ENTP",
  "INFJ", "INFP", "ENFJ", "ENFP",
  "ISTJ", "ISFJ", "ESTJ", "ESFJ",
  "ISTP", "ISFP", "ESTP", "ESFP",
];

const archetypes = (archetypeData as unknown as ArchetypeCatalog).arquetipos;
const archetypeByCode = new Map(archetypes.map((archetype) => [archetype.codigo_mbti, archetype]));

type MbtiPreference = "extraversion" | "intuicion" | "pensamiento" | "juicio";
type RandomSource = () => number;

export interface SyntheticProfile {
  matricula: `SIM-${string}`;
  alias: string;
  archetypeId: string;
  mbtiCode: MbtiCode;
  mbtiPreferences: Record<MbtiPreference, number>;
  dimensionScores: Record<MatchingDimension, number>;
  matchingVector: number[];
}

export interface PairAnalysis {
  pairCount: number;
  similarities: number[];
  maximumSimilarities: number[];
  minimumSimilarity: number;
  maximumSimilarity: number;
}

export interface CoverageMeasurement {
  thresholdExclusive: number;
  qualifyingPairCount: number;
  usersWithMatch: number;
  userCoverageRate: number;
}

export interface CalibrationResult {
  calibrated: boolean;
  initial: CoverageMeasurement;
  final: CoverageMeasurement;
  targetCoverageRate: number;
  iterations: number;
}

interface LatentFactors {
  social: number;
  exploration: number;
  order: number;
  empathy: number;
  stability: number;
  equality: number;
}

function createRandom(seed: number): RandomSource {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function standardNormal(random: RandomSource): number {
  const first = Math.max(Number.EPSILON, random());
  const second = random();
  return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
}

function truncatedNormal(
  random: RandomSource,
  mean: number,
  standardDeviation: number,
  sharedComponent: number,
  residualWeight: number,
  minimum = 0,
  maximum = 1,
): number {
  for (let attempt = 0; attempt < 10_000; attempt += 1) {
    const zScore = sharedComponent + residualWeight * standardNormal(random);
    const value = mean + standardDeviation * zScore;
    if (value >= minimum && value <= maximum) {
      return value;
    }
  }

  throw new Error("Unable to sample the configured truncated normal distribution");
}

function shuffledBalancedMbtiCodes(random: RandomSource): MbtiCode[] {
  const codes = Array.from(
    { length: SYNTHETIC_PROFILE_COUNT },
    (_, index) => MBTI_CODES[index % MBTI_CODES.length]!,
  );

  for (let index = codes.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [codes[index], codes[swapIndex]] = [codes[swapIndex]!, codes[index]!];
  }

  return codes;
}

function getArchetype(code: MbtiCode): Archetype {
  const archetype = archetypeByCode.get(code);
  if (!archetype) {
    throw new Error(`Missing archetype for ${code}`);
  }
  return archetype;
}

function preferenceFor(
  random: RandomSource,
  positive: boolean,
  factor: number,
): number {
  const lower = positive ? 0.500_001 : 0;
  const upper = positive ? 1 : 0.499_999;
  return truncatedNormal(
    random,
    positive ? 0.68 : 0.32,
    0.17,
    0.48 * factor,
    Math.sqrt(1 - 0.48 ** 2),
    lower,
    upper,
  );
}

function generateLatentFactors(random: RandomSource): LatentFactors {
  return {
    social: standardNormal(random),
    exploration: standardNormal(random),
    order: standardNormal(random),
    empathy: standardNormal(random),
    stability: standardNormal(random),
    equality: standardNormal(random),
  };
}

function sampleScore(
  random: RandomSource,
  mean: number,
  standardDeviation: number,
  weightedFactors: readonly [number, number][],
): number {
  const sharedComponent = weightedFactors.reduce(
    (sum, [weight, factor]) => sum + weight * factor,
    0,
  );
  const sharedVariance = weightedFactors.reduce((sum, [weight]) => sum + weight ** 2, 0);
  return truncatedNormal(
    random,
    mean,
    standardDeviation,
    sharedComponent,
    Math.sqrt(1 - sharedVariance),
  );
}

function generateDimensionScores(
  random: RandomSource,
  factors: LatentFactors,
): Record<MatchingDimension, number> {
  return {
    bigfive_apertura: sampleScore(random, 0.56, 0.18, [
      [0.58, factors.exploration],
      [0.16, factors.equality],
    ]),
    bigfive_responsabilidad: sampleScore(random, 0.58, 0.17, [
      [0.57, factors.order],
      [0.18, factors.stability],
    ]),
    bigfive_extraversion: sampleScore(random, 0.5, 0.2, [
      [0.62, factors.social],
    ]),
    bigfive_amabilidad: sampleScore(random, 0.61, 0.16, [
      [0.5, factors.empathy],
      [0.22, factors.stability],
    ]),
    bigfive_neuroticismo: sampleScore(random, 0.43, 0.19, [
      [-0.6, factors.stability],
    ]),
    relaciones_comunicacion: sampleScore(random, 0.62, 0.16, [
      [0.36, factors.social],
      [0.38, factors.empathy],
      [0.2, factors.stability],
    ]),
    relaciones_confianza: sampleScore(random, 0.6, 0.17, [
      [0.56, factors.stability],
      [0.24, factors.empathy],
    ]),
    relaciones_empatia: sampleScore(random, 0.64, 0.16, [
      [0.64, factors.empathy],
    ]),
    relaciones_gestion_conflicto: sampleScore(random, 0.61, 0.16, [
      [0.4, factors.empathy],
      [0.38, factors.stability],
      [0.2, factors.order],
    ]),
    genero_igualdad: sampleScore(random, 0.72, 0.14, [
      [0.62, factors.equality],
      [0.2, factors.empathy],
    ]),
    genero_flexibilidad_roles: sampleScore(random, 0.69, 0.15, [
      [0.56, factors.equality],
      [0.28, factors.exploration],
    ]),
    genero_respeto_diversidad: sampleScore(random, 0.73, 0.14, [
      [0.58, factors.equality],
      [0.26, factors.empathy],
    ]),
    genero_corresponsabilidad: sampleScore(random, 0.7, 0.14, [
      [0.56, factors.equality],
      [0.26, factors.order],
    ]),
  };
}

function deterministicAlias(seed: number, matricula: string, archetype: Archetype): string {
  const suffix = createHash("sha256")
    .update(`${seed}:${matricula}:${archetype.id}`, "utf8")
    .digest("hex")
    .slice(0, 10);
  return `${archetype.id}-${suffix}`;
}

export function generateSyntheticProfiles(seed = SYNTHETIC_SEED): SyntheticProfile[] {
  const random = createRandom(seed);
  const codes = shuffledBalancedMbtiCodes(random);

  return codes.map((mbtiCode, index) => {
    const factors = generateLatentFactors(random);
    const archetype = getArchetype(mbtiCode);
    const matricula = `SIM-${String(index + 1).padStart(6, "0")}` as const;
    const dimensionScores = generateDimensionScores(random, factors);
    const mbtiPreferences = {
      extraversion: preferenceFor(random, mbtiCode[0] === "E", factors.social),
      intuicion: preferenceFor(random, mbtiCode[1] === "N", factors.exploration),
      pensamiento: preferenceFor(random, mbtiCode[2] === "T", -factors.empathy),
      juicio: preferenceFor(random, mbtiCode[3] === "J", factors.order),
    };

    return {
      matricula,
      alias: deterministicAlias(seed, matricula, archetype),
      archetypeId: archetype.id,
      mbtiCode,
      mbtiPreferences,
      dimensionScores,
      matchingVector: MATCHING_DIMENSIONS.map((dimension) => dimensionScores[dimension]),
    };
  });
}

export function analyzeProfilePairs(profiles: readonly SyntheticProfile[]): PairAnalysis {
  const similarities: number[] = [];
  const maximumSimilarities = Array.from({ length: profiles.length }, () => 0);
  let minimumSimilarity = Number.POSITIVE_INFINITY;
  let maximumSimilarity = Number.NEGATIVE_INFINITY;

  for (let firstIndex = 0; firstIndex < profiles.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < profiles.length; secondIndex += 1) {
      const similarity = cosineSimilarity(
        profiles[firstIndex]!.matchingVector,
        profiles[secondIndex]!.matchingVector,
      );
      similarities.push(similarity);
      maximumSimilarities[firstIndex] = Math.max(maximumSimilarities[firstIndex]!, similarity);
      maximumSimilarities[secondIndex] = Math.max(maximumSimilarities[secondIndex]!, similarity);
      minimumSimilarity = Math.min(minimumSimilarity, similarity);
      maximumSimilarity = Math.max(maximumSimilarity, similarity);
    }
  }

  return {
    pairCount: similarities.length,
    similarities,
    maximumSimilarities,
    minimumSimilarity: similarities.length === 0 ? 0 : minimumSimilarity,
    maximumSimilarity: similarities.length === 0 ? 0 : maximumSimilarity,
  };
}

export function measureCoverage(
  analysis: PairAnalysis,
  thresholdExclusive: number,
): CoverageMeasurement {
  const usersWithMatch = analysis.maximumSimilarities.filter(
    (similarity) => similarity > thresholdExclusive,
  ).length;
  return {
    thresholdExclusive,
    qualifyingPairCount: analysis.similarities.filter(
      (similarity) => similarity > thresholdExclusive,
    ).length,
    usersWithMatch,
    userCoverageRate: usersWithMatch / analysis.maximumSimilarities.length,
  };
}

export function calibrateMatchingThreshold(
  analysis: PairAnalysis,
  initialThreshold = INITIAL_MATCH_THRESHOLD,
  targetCoverageRate = TARGET_COVERAGE_RATE,
): CalibrationResult {
  const initial = measureCoverage(analysis, initialThreshold);
  if (initial.userCoverageRate >= 0.05 && initial.userCoverageRate <= 0.4) {
    return {
      calibrated: false,
      initial,
      final: initial,
      targetCoverageRate,
      iterations: 0,
    };
  }

  let lowerThreshold = 0;
  let upperThreshold = 1;
  let best = initial;
  const iterations = 56;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const threshold = (lowerThreshold + upperThreshold) / 2;
    const measurement = measureCoverage(analysis, threshold);
    const difference = Math.abs(measurement.userCoverageRate - targetCoverageRate);
    const bestDifference = Math.abs(best.userCoverageRate - targetCoverageRate);
    if (difference < bestDifference) {
      best = measurement;
    }

    if (measurement.userCoverageRate > targetCoverageRate) {
      lowerThreshold = threshold;
    } else {
      upperThreshold = threshold;
    }
  }

  return {
    calibrated: true,
    initial,
    final: best,
    targetCoverageRate,
    iterations,
  };
}
