import { describe, expect, it } from "vitest";

import calibrationReport from "../../data/synthetic-calibration.json";
import {
  INITIAL_MATCH_THRESHOLD,
  SYNTHETIC_PROFILE_COUNT,
  SYNTHETIC_SEED,
  analyzeProfilePairs,
  calibrateMatchingThreshold,
  generateSyntheticProfiles,
  measureCoverage,
  type SyntheticProfile,
} from "../../scripts/generate-synthetic-profiles";
import { cosineSimilarity } from "@/lib/matching";
import { MATCHING_DIMENSIONS, type MatchingDimension } from "@/types/microtest";

const profiles = generateSyntheticProfiles();
const pairAnalysis = analyzeProfilePairs(profiles);

function pearsonCorrelation(
  values: readonly SyntheticProfile[],
  first: MatchingDimension,
  second: MatchingDimension,
): number {
  const firstMean = values.reduce((sum, profile) => sum + profile.dimensionScores[first], 0)
    / values.length;
  const secondMean = values.reduce((sum, profile) => sum + profile.dimensionScores[second], 0)
    / values.length;
  let covariance = 0;
  let firstVariance = 0;
  let secondVariance = 0;

  for (const profile of values) {
    const firstDelta = profile.dimensionScores[first] - firstMean;
    const secondDelta = profile.dimensionScores[second] - secondMean;
    covariance += firstDelta * secondDelta;
    firstVariance += firstDelta ** 2;
    secondVariance += secondDelta ** 2;
  }

  return covariance / Math.sqrt(firstVariance * secondVariance);
}

describe("synthetic profile generation", () => {
  it("generates exactly 500 deterministic profiles from the fixed seed", () => {
    expect(SYNTHETIC_PROFILE_COUNT).toBe(500);
    expect(SYNTHETIC_SEED).toBe(calibrationReport.seed);
    expect(profiles).toHaveLength(500);
    expect(generateSyntheticProfiles()).toEqual(profiles);
    expect(generateSyntheticProfiles(SYNTHETIC_SEED + 1)).not.toEqual(profiles);
  });

  it("uses unique simulated matriculas and archetype-derived SHA-256 aliases", () => {
    const matriculas = new Set(profiles.map(({ matricula }) => matricula));
    const aliases = new Set(profiles.map(({ alias }) => alias));

    expect(matriculas.size).toBe(500);
    expect(aliases.size).toBe(500);
    for (const profile of profiles) {
      expect(profile.matricula).toMatch(/^SIM-\d{6}$/);
      expect(profile.alias).toMatch(new RegExp(`^${profile.archetypeId}-[0-9a-f]{10}$`));
      expect(profile.alias).not.toContain(profile.matricula);
    }
  });

  it("covers all 16 MBTI archetypes with a balanced distribution", () => {
    const distribution = Object.groupBy(profiles, ({ mbtiCode }) => mbtiCode);
    const counts = Object.values(distribution).map((group) => group?.length ?? 0);

    expect(counts).toHaveLength(16);
    expect(Math.min(...counts)).toBe(31);
    expect(Math.max(...counts)).toBe(32);
    expect(Object.fromEntries(
      Object.entries(distribution).map(([code, group]) => [code, group?.length ?? 0]),
    )).toEqual(calibrationReport.mbti_distribution);
  });

  it("keeps every truncated-normal score and preference in its valid range", () => {
    for (const profile of profiles) {
      expect(profile.matchingVector).toHaveLength(13);
      expect(Object.keys(profile.dimensionScores)).toEqual(MATCHING_DIMENSIONS);
      expect(profile.matchingVector).toEqual(
        MATCHING_DIMENSIONS.map((dimension) => profile.dimensionScores[dimension]),
      );
      for (const value of [
        ...profile.matchingVector,
        ...Object.values(profile.mbtiPreferences),
      ]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }

      expect(profile.mbtiPreferences.extraversion > 0.5).toBe(profile.mbtiCode[0] === "E");
      expect(profile.mbtiPreferences.intuicion > 0.5).toBe(profile.mbtiCode[1] === "N");
      expect(profile.mbtiPreferences.pensamiento > 0.5).toBe(profile.mbtiCode[2] === "T");
      expect(profile.mbtiPreferences.juicio > 0.5).toBe(profile.mbtiCode[3] === "J");
    }
  });

  it("produces moderate construct correlations without demographic identity fields", () => {
    const relationshipCorrelation = pearsonCorrelation(
      profiles,
      "relaciones_empatia",
      "relaciones_gestion_conflicto",
    );
    const genderAttitudeCorrelation = pearsonCorrelation(
      profiles,
      "genero_igualdad",
      "genero_respeto_diversidad",
    );
    const inverseStabilityCorrelation = pearsonCorrelation(
      profiles,
      "bigfive_neuroticismo",
      "relaciones_confianza",
    );

    expect(relationshipCorrelation).toBeGreaterThan(0.15);
    expect(relationshipCorrelation).toBeLessThan(0.65);
    expect(genderAttitudeCorrelation).toBeGreaterThan(0.15);
    expect(genderAttitudeCorrelation).toBeLessThan(0.65);
    expect(inverseStabilityCorrelation).toBeLessThan(-0.15);
    expect(inverseStabilityCorrelation).toBeGreaterThan(-0.65);
    expect(Object.keys(profiles[0]!).sort()).toEqual([
      "alias",
      "archetypeId",
      "dimensionScores",
      "matchingVector",
      "matricula",
      "mbtiCode",
      "mbtiPreferences",
    ]);
  });
});

describe("synthetic compatibility calibration", () => {
  it("uses production cosine similarity symmetrically over the same 13 dimensions", () => {
    for (let index = 1; index < 20; index += 1) {
      const first = profiles[index - 1]!.matchingVector;
      const second = profiles[index]!.matchingVector;
      expect(cosineSimilarity(first, second)).toBeCloseTo(cosineSimilarity(second, first), 15);
    }
  });

  it("calculates all 124,750 unordered pairs exactly once", () => {
    expect(pairAnalysis.pairCount).toBe(500 * 499 / 2);
    expect(pairAnalysis.pairCount).toBe(124_750);
    expect(pairAnalysis.similarities).toHaveLength(124_750);
    expect(pairAnalysis.maximumSimilarities).toHaveLength(500);
    expect(pairAnalysis.minimumSimilarity).toBeGreaterThanOrEqual(0);
    expect(pairAnalysis.maximumSimilarity).toBeLessThanOrEqual(1);
  });

  it("applies the configured threshold strictly rather than inclusively", () => {
    const exactThresholdAnalysis = {
      pairCount: 1,
      similarities: [INITIAL_MATCH_THRESHOLD],
      maximumSimilarities: [INITIAL_MATCH_THRESHOLD, INITIAL_MATCH_THRESHOLD],
      minimumSimilarity: INITIAL_MATCH_THRESHOLD,
      maximumSimilarity: INITIAL_MATCH_THRESHOLD,
    };

    expect(measureCoverage(exactThresholdAnalysis, INITIAL_MATCH_THRESHOLD)).toMatchObject({
      qualifyingPairCount: 0,
      usersWithMatch: 0,
      userCoverageRate: 0,
    });
  });

  it("bisects an out-of-band initial rate to the 20 percent target", () => {
    const calibration = calibrateMatchingThreshold(pairAnalysis);

    expect(calibration.initial.thresholdExclusive).toBe(0.85);
    expect(calibration.initial.usersWithMatch).toBe(500);
    expect(calibration.initial.userCoverageRate).toBe(1);
    expect(calibration.calibrated).toBe(true);
    expect(calibration.final.thresholdExclusive).toBeGreaterThan(0.85);
    expect(calibration.final.usersWithMatch).toBe(100);
    expect(calibration.final.userCoverageRate).toBe(0.2);
    expect(calibration.final.userCoverageRate).toBeGreaterThanOrEqual(0.05);
    expect(calibration.final.userCoverageRate).toBeLessThanOrEqual(0.4);
  });

  it("matches the generated calibration report", () => {
    const initial = measureCoverage(pairAnalysis, INITIAL_MATCH_THRESHOLD);
    const calibration = calibrateMatchingThreshold(pairAnalysis);

    expect(pairAnalysis.pairCount).toBe(calibrationReport.pair_count);
    expect(initial.qualifyingPairCount).toBe(
      calibrationReport.initial_measurement.qualifying_pair_count,
    );
    expect(calibration.final.thresholdExclusive).toBeCloseTo(
      calibrationReport.calibration.threshold_exclusive,
      15,
    );
    expect(calibration.final.qualifyingPairCount).toBe(
      calibrationReport.calibration.qualifying_pair_count,
    );
    expect(pairAnalysis.minimumSimilarity).toBeCloseTo(
      calibrationReport.similarity_range.minimum,
      12,
    );
    expect(pairAnalysis.maximumSimilarity).toBeCloseTo(
      calibrationReport.similarity_range.maximum,
      12,
    );
  });
});
