import { createHash } from "node:crypto";

import catalogue from "../data/arquetipos.json";
import { MATCHING_CONFIG, applyRomanceSelectivity, applyPsychometricMix, computeTrackCentroid, trackSimilarity } from "../src/lib/matching/engine";
import { derivePsychometricProfile } from "../src/lib/psychometrics";
import {
  FRIENDSHIP_VECTOR_DIMENSIONS,
  ROMANCE_VECTOR_DIMENSIONS,
  type Dimension,
  type DimensionScores,
  type HardFilters,
  type MatchTrack,
  type ScoredProfile,
} from "../src/types/microtest";
import type { ArchetypeCatalog, MbtiCode } from "../src/types/archetype";

export const SYNTHETIC_PROFILE_COUNT = 500;
export const SYNTHETIC_SEED = 0x5a4f4f4d;

const MBTI_CODES: readonly MbtiCode[] = [
  "INTJ", "INTP", "ENTJ", "ENTP",
  "INFJ", "INFP", "ENFJ", "ENFP",
  "ISTJ", "ISFJ", "ESTJ", "ESFJ",
  "ISTP", "ISFP", "ESTP", "ESFP",
];

const ANIMALS = (catalogue as unknown as ArchetypeCatalog).animales;
const COLORS = (catalogue as unknown as ArchetypeCatalog).colores;

type RandomSource = () => number;

interface LatentFactors {
  social: number;
  exploration: number;
  order: number;
  empathy: number;
  stability: number;
  equality: number;
  expression: number;
  intimacy: number;
}

export interface SyntheticProfile {
  matricula: `SIM-${string}`;
  alias: string;
  animalId: string;
  colorId: string;
  mbtiCode: MbtiCode;
  dimensionScores: DimensionScores;
  hardFilters: HardFilters;
  romanceVector: number[];
  friendshipVector: number[];
  scoredProfile: ScoredProfile;
}

export interface PairAnalysis {
  track: MatchTrack;
  pairCount: number;
  similarities: number[];
  maximumSimilarities: number[];
  minimumSimilarity: number;
  maximumSimilarity: number;
}

export interface CoverageMeasurement {
  thresholdExclusive: number;
  qualifyingPairCount: number;
  pairCoverageRate: number;
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
    if (value >= minimum && value <= maximum) return value;
  }
  throw new Error("Unable to sample the configured truncated normal distribution");
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
    Math.sqrt(Math.max(0, 1 - sharedVariance)),
  );
}

function preferenceFor(
  random: RandomSource,
  positive: boolean,
  factor: number,
): number {
  return truncatedNormal(
    random,
    positive ? 0.68 : 0.32,
    0.16,
    0.5 * factor,
    Math.sqrt(1 - 0.5 ** 2),
    positive ? 0.500_001 : 0,
    positive ? 1 : 0.499_999,
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
    expression: standardNormal(random),
    intimacy: standardNormal(random),
  };
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

function generateDimensionScores(
  random: RandomSource,
  factors: LatentFactors,
  mbtiCode: MbtiCode,
): DimensionScores {
  const scores: Record<Dimension, number> = {
    personalidad_apertura: sampleScore(random, 0.56, 0.17, [
      [0.58, factors.exploration],
      [0.16, factors.equality],
    ]),
    personalidad_responsabilidad: sampleScore(random, 0.58, 0.16, [
      [0.57, factors.order],
      [0.18, factors.stability],
    ]),
    personalidad_extraversion: sampleScore(random, 0.5, 0.19, [[0.62, factors.social]]),
    personalidad_amabilidad: sampleScore(random, 0.61, 0.16, [
      [0.5, factors.empathy],
      [0.22, factors.stability],
    ]),
    personalidad_estabilidad_emocional: sampleScore(random, 0.62, 0.17, [
      [0.6, factors.stability],
      [0.15, factors.empathy],
    ]),
    mbti_extraversion: preferenceFor(random, mbtiCode[0] === "E", factors.social),
    mbti_intuicion: preferenceFor(random, mbtiCode[1] === "N", factors.exploration),
    mbti_pensamiento: preferenceFor(random, mbtiCode[2] === "T", -factors.empathy),
    mbti_juicio: preferenceFor(random, mbtiCode[3] === "J", factors.order),
    identidad_exclusividad: sampleScore(random, 0.55, 0.17, [
      [0.4, factors.stability],
      [0.3, factors.order],
    ]),
    identidad_comunicacion_afectiva: sampleScore(random, 0.6, 0.16, [
      [0.45, factors.empathy],
      [0.35, factors.expression],
    ]),
    cultural_musica_exploracion: sampleScore(random, 0.62, 0.17, [
      [0.5, factors.exploration],
      [0.25, factors.expression],
    ]),
    cultural_estetica_visual: sampleScore(random, 0.6, 0.17, [
      [0.55, factors.exploration],
      [0.2, factors.expression],
    ]),
    cultural_hobbies_creativos: sampleScore(random, 0.58, 0.18, [
      [0.5, factors.exploration],
      [0.25, factors.intimacy],
    ]),
    cultural_vida_universitaria: sampleScore(random, 0.6, 0.17, [
      [0.45, factors.social],
      [0.3, factors.exploration],
    ]),
    cultural_humor: sampleScore(random, 0.64, 0.16, [
      [0.45, factors.social],
      [0.3, factors.expression],
    ]),
    intimidad_palabras_afirmacion: sampleScore(random, 0.6, 0.16, [
      [0.5, factors.expression],
      [0.25, factors.empathy],
    ]),
    intimidad_tiempo_calidad: sampleScore(random, 0.62, 0.16, [
      [0.5, factors.intimacy],
      [0.25, factors.stability],
    ]),
    intimidad_regalos_detalle: sampleScore(random, 0.58, 0.17, [
      [0.45, factors.expression],
      [0.3, factors.empathy],
    ]),
    intimidad_contacto_fisico: sampleScore(random, 0.57, 0.18, [
      [0.5, factors.intimacy],
      [0.25, factors.social],
    ]),
    intimidad_actos_servicio: sampleScore(random, 0.6, 0.16, [
      [0.45, factors.empathy],
      [0.3, factors.order],
    ]),
    intimidad_apertura_emocional: sampleScore(random, 0.58, 0.17, [
      [0.5, factors.expression],
      [0.3, factors.stability],
    ]),
    intimidad_comunicacion_deseos: sampleScore(random, 0.58, 0.17, [
      [0.5, factors.expression],
      [0.25, factors.intimacy],
    ]),
    intimidad_limites_respeto: sampleScore(random, 0.66, 0.15, [
      [0.45, factors.empathy],
      [0.3, factors.stability],
    ]),
    valores_empatia: sampleScore(random, 0.64, 0.16, [[0.64, factors.empathy]]),
    valores_confianza: sampleScore(random, 0.6, 0.17, [
      [0.56, factors.stability],
      [0.24, factors.empathy],
    ]),
    valores_gestion_conflicto: sampleScore(random, 0.61, 0.16, [
      [0.4, factors.empathy],
      [0.38, factors.stability],
      [0.2, factors.order],
    ]),
    valores_igualdad_genero: sampleScore(random, 0.72, 0.14, [
      [0.62, factors.equality],
      [0.2, factors.empathy],
    ]),
    valores_corresponsabilidad: sampleScore(random, 0.7, 0.14, [
      [0.56, factors.equality],
      [0.26, factors.order],
    ]),
    valores_respeto_diversidad: sampleScore(random, 0.73, 0.14, [
      [0.58, factors.equality],
      [0.26, factors.empathy],
    ]),
  };
  return scores;
}

function deterministicAlias(seed: number, matricula: string, index: number): string {
  const animal = ANIMALS[index % ANIMALS.length]!;
  const color = COLORS[(index * 7) % COLORS.length]!;
  const suffix = createHash("sha256")
    .update(`${seed}:${matricula}:${animal.id}:${color.id}`, "utf8")
    .digest("hex")
    .slice(0, 6);
  return `${animal.diminutivo_es} ${color.nombre.toLowerCase()} · ${String(index + 1).padStart(3, "0")}${suffix}`;
}

export function generateSyntheticProfiles(seed = SYNTHETIC_SEED): SyntheticProfile[] {
  const random = createRandom(seed);
  const codes = shuffledBalancedMbtiCodes(random);

  return codes.map((mbtiCode, index) => {
    const factors = generateLatentFactors(random);
    const dimensionScores = generateDimensionScores(random, factors, mbtiCode);
    const matricula = `SIM-${String(index + 1).padStart(6, "0")}` as const;
    const animal = ANIMALS[index % ANIMALS.length]!;
    const color = COLORS[(index * 7) % COLORS.length]!;
    const hardFilters: HardFilters = {
      orientacion_sexual: ["todxs"],
      identidad_genero: [index % 2 === 0 ? "mujer" : "hombre"],
      tipo_relacion_busca: ["sin_definir"],
    };
    const romanceVector = ROMANCE_VECTOR_DIMENSIONS.map(
      (dimension) => dimensionScores[dimension],
    );
    const friendshipVector = FRIENDSHIP_VECTOR_DIMENSIONS.map(
      (dimension) => dimensionScores[dimension],
    );

    return {
      matricula,
      alias: deterministicAlias(seed, matricula, index),
      animalId: animal.id,
      colorId: color.id,
      mbtiCode,
      dimensionScores,
      hardFilters,
      romanceVector,
      friendshipVector,
      scoredProfile: {
        rawScores: dimensionScores,
        normalizedScores: dimensionScores,
        mbtiCode,
        hardFilters,
        romanceVector,
        friendshipVector,
      },
    };
  });
}

/**
 * Computes every unordered pair once for a track. Synthetic profiles share
 * compatible hard filters (orientation wildcard + `sin_definir`), so the
 * analysis is purely dimensional.
 *
 * Vectors are centered against the empirical population centroid μ and the
 * romance track applies the same intimacy/conflict selectivity as the engine,
 * so these similarities are the final scores users would see.
 */
export function analyzeTrackPairs(
  profiles: readonly SyntheticProfile[],
  track: MatchTrack,
): PairAnalysis {
  const similarities: number[] = [];
  const maximumSimilarities = Array.from({ length: profiles.length }, () => 0);
  const config = MATCHING_CONFIG.tracks[track];
  const vectors = profiles.map((profile) =>
    track === "romance" ? profile.romanceVector : profile.friendshipVector,
  );
  const centroid = computeTrackCentroid(vectors);
  const psychometrics = profiles.map((profile) =>
    derivePsychometricProfile(profile.dimensionScores, profile.mbtiCode),
  );
  let minimumSimilarity = Number.POSITIVE_INFINITY;
  let maximumSimilarity = Number.NEGATIVE_INFINITY;

  for (let firstIndex = 0; firstIndex < profiles.length; firstIndex += 1) {
    const firstVector = vectors[firstIndex]!;
    for (let secondIndex = firstIndex + 1; secondIndex < profiles.length; secondIndex += 1) {
      const secondVector = vectors[secondIndex]!;
      const baseSimilarity = trackSimilarity(firstVector, secondVector, config, centroid);
      const adjustedSimilarity = applyPsychometricMix(
        baseSimilarity,
        MATCHING_CONFIG.psychometric_mix,
        psychometrics[firstIndex]!,
        psychometrics[secondIndex]!,
      );
      const similarity =
        track === "romance"
          ? applyRomanceSelectivity(firstVector, secondVector, adjustedSimilarity, config).score
          : adjustedSimilarity;
      similarities.push(similarity);
      maximumSimilarities[firstIndex] = Math.max(maximumSimilarities[firstIndex]!, similarity);
      maximumSimilarities[secondIndex] = Math.max(maximumSimilarities[secondIndex]!, similarity);
      minimumSimilarity = Math.min(minimumSimilarity, similarity);
      maximumSimilarity = Math.max(maximumSimilarity, similarity);
    }
  }

  return {
    track,
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
  const qualifyingPairCount = analysis.similarities.filter(
    (similarity) => similarity > thresholdExclusive,
  ).length;
  return {
    thresholdExclusive,
    qualifyingPairCount,
    pairCoverageRate:
      analysis.pairCount === 0 ? 0 : qualifyingPairCount / analysis.pairCount,
    usersWithMatch,
    userCoverageRate: usersWithMatch / analysis.maximumSimilarities.length,
  };
}

/**
 * Bisects a threshold that reaches the track's configured user-coverage
 * target. The matching engine keeps its own configured threshold; this
 * function reports the calibration only.
 */
export function calibrateThreshold(
  analysis: PairAnalysis,
  initialThreshold = MATCHING_CONFIG.tracks[analysis.track].minimum_similarity_exclusive,
  targetCoverageRate = MATCHING_CONFIG.tracks[analysis.track].target_coverage_percentile,
): CalibrationResult {
  const initial = measureCoverage(analysis, initialThreshold);
  if (Math.abs(initial.userCoverageRate - targetCoverageRate) <= 0.002) {
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
    if (difference < bestDifference) best = measurement;

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
