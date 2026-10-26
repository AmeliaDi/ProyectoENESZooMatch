import { describe, expect, it } from "vitest";

import catalogue from "../../data/arquetipos.json";
import {
  SYNTHETIC_PROFILE_COUNT,
  SYNTHETIC_SEED,
  analyzeTrackPairs,
  calibrateThreshold,
  generateSyntheticProfiles,
  measureCoverage,
} from "../../scripts/generate-synthetic-profiles";
import { MATCHING_CONFIG, computeAllMatches } from "@/lib/matching";
import {
  ALL_DIMENSIONS,
  FRIENDSHIP_VECTOR_DIMENSIONS,
  ROMANCE_VECTOR_DIMENSIONS,
  type Dimension,
} from "@/types/microtest";

const profiles = generateSyntheticProfiles();
const romanceAnalysis = analyzeTrackPairs(profiles, "romance");
const friendshipAnalysis = analyzeTrackPairs(profiles, "amistad");
const pool = profiles.map((profile) => ({
  userId: profile.matricula,
  profile: profile.scoredProfile,
}));
const engineMatches = computeAllMatches(pool, MATCHING_CONFIG);

function pearsonCorrelation(
  first: Dimension,
  second: Dimension,
): number {
  const firstMean =
    profiles.reduce((sum, profile) => sum + profile.dimensionScores[first], 0) /
    profiles.length;
  const secondMean =
    profiles.reduce((sum, profile) => sum + profile.dimensionScores[second], 0) /
    profiles.length;
  let covariance = 0;
  let firstVariance = 0;
  let secondVariance = 0;

  for (const profile of profiles) {
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
    expect(SYNTHETIC_SEED).toBe(0x5a4f4f4d);
    expect(profiles).toHaveLength(500);
    expect(generateSyntheticProfiles()).toEqual(profiles);
    expect(generateSyntheticProfiles(SYNTHETIC_SEED + 1)).not.toEqual(profiles);
  });

  it("uses unique simulated matriculas and catalogue-derived aliases", () => {
    const matriculas = new Set(profiles.map(({ matricula }) => matricula));
    const aliases = new Set(profiles.map(({ alias }) => alias));
    const animalIds = new Set(catalogue.animales.map((animal) => animal.id));
    const colorIds = new Set(catalogue.colores.map((color) => color.id));

    expect(matriculas.size).toBe(500);
    expect(aliases.size).toBe(500);
    for (const profile of profiles) {
      expect(profile.matricula).toMatch(/^SIM-\d{6}$/);
      expect(profile.alias).not.toContain(profile.matricula);
      expect(animalIds.has(profile.animalId)).toBe(true);
      expect(colorIds.has(profile.colorId)).toBe(true);
    }
  });

  it("covers all 16 MBTI types with a balanced distribution", () => {
    const distribution = Object.groupBy(profiles, ({ mbtiCode }) => mbtiCode);
    const counts = Object.values(distribution).map((group) => group?.length ?? 0);

    expect(counts).toHaveLength(16);
    expect(Math.min(...counts)).toBe(31);
    expect(Math.max(...counts)).toBe(32);
  });

  it("keeps every dimension inside [0, 1] with consistent dual-track vectors", () => {
    for (const profile of profiles) {
      expect(Object.keys(profile.dimensionScores).sort()).toEqual(
        [...ALL_DIMENSIONS].sort(),
      );
      expect(profile.romanceVector).toHaveLength(26);
      expect(profile.friendshipVector).toHaveLength(16);
      expect(profile.romanceVector).toEqual(
        ROMANCE_VECTOR_DIMENSIONS.map((dimension) => profile.dimensionScores[dimension]),
      );
      expect(profile.friendshipVector).toEqual(
        FRIENDSHIP_VECTOR_DIMENSIONS.map((dimension) => profile.dimensionScores[dimension]),
      );
      for (const value of Object.values(profile.dimensionScores)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
      expect(profile.dimensionScores.mbti_extraversion > 0.5).toBe(
        profile.mbtiCode[0] === "E",
      );
      expect(profile.dimensionScores.mbti_intuicion > 0.5).toBe(
        profile.mbtiCode[1] === "N",
      );
      expect(profile.dimensionScores.mbti_pensamiento > 0.5).toBe(
        profile.mbtiCode[2] === "T",
      );
      expect(profile.dimensionScores.mbti_juicio > 0.5).toBe(
        profile.mbtiCode[3] === "J",
      );
    }
  });

  it("produces moderate construct correlations without demographic fields", () => {
    const relationshipCorrelation = pearsonCorrelation(
      "valores_empatia",
      "valores_gestion_conflicto",
    );
    const equalityCorrelation = pearsonCorrelation(
      "valores_igualdad_genero",
      "valores_respeto_diversidad",
    );
    const stabilityCorrelation = pearsonCorrelation(
      "personalidad_estabilidad_emocional",
      "valores_confianza",
    );

    expect(relationshipCorrelation).toBeGreaterThan(0.15);
    expect(relationshipCorrelation).toBeLessThan(0.65);
    expect(equalityCorrelation).toBeGreaterThan(0.15);
    expect(equalityCorrelation).toBeLessThan(0.65);
    expect(stabilityCorrelation).toBeGreaterThan(0.15);
    expect(stabilityCorrelation).toBeLessThan(0.65);
  });
});

describe("synthetic compatibility calibration", () => {
  it("calculates all 124,750 unordered pairs once per track", () => {
    for (const analysis of [romanceAnalysis, friendshipAnalysis]) {
      expect(analysis.pairCount).toBe((500 * 499) / 2);
      expect(analysis.pairCount).toBe(124_750);
      expect(analysis.similarities).toHaveLength(124_750);
      expect(analysis.maximumSimilarities).toHaveLength(500);
      expect(analysis.minimumSimilarity).toBeGreaterThanOrEqual(0);
      expect(analysis.maximumSimilarity).toBeLessThanOrEqual(1);
    }
  });

  it("runs the canonical engine with per-track thresholds and caps", () => {
    for (const track of ["romance", "amistad"] as const) {
      const threshold = MATCHING_CONFIG.tracks[track].minimum_similarity_exclusive;
      const trackMatches = engineMatches.filter((match) => match.track === track);
      expect(trackMatches.length).toBeGreaterThan(0);
      for (const match of trackMatches) {
        expect(match.userA).not.toBe(match.userB);
        expect(match.similarity).toBeGreaterThan(threshold);
      }

      // Each user contributes at most `max_matches` outbound selections, so the
      // deduplicated global set can never exceed profiles × max_matches.
      expect(trackMatches.length).toBeLessThanOrEqual(
        profiles.length * MATCHING_CONFIG.tracks[track].max_matches,
      );
      const pairKeys = new Set(
        trackMatches.map((match) => `${match.track}:${match.userA}:${match.userB}`),
      );
      expect(pairKeys.size).toBe(trackMatches.length);
    }
  });

  it("applies the configured threshold strictly rather than inclusively", () => {
    const exactThresholdAnalysis = {
      track: "romance" as const,
      pairCount: 1,
      similarities: [MATCHING_CONFIG.tracks.romance.minimum_similarity_exclusive],
      maximumSimilarities: [MATCHING_CONFIG.tracks.romance.minimum_similarity_exclusive],
      minimumSimilarity: MATCHING_CONFIG.tracks.romance.minimum_similarity_exclusive,
      maximumSimilarity: MATCHING_CONFIG.tracks.romance.minimum_similarity_exclusive,
    };

    expect(
      measureCoverage(
        exactThresholdAnalysis,
        MATCHING_CONFIG.tracks.romance.minimum_similarity_exclusive,
      ),
    ).toMatchObject({
      qualifyingPairCount: 0,
      usersWithMatch: 0,
      userCoverageRate: 0,
    });
  });

  it("keeps the romance upper tail at or below six percent of pairs", () => {
    const trackConfig = MATCHING_CONFIG.tracks.romance;
    const threshold = trackConfig.minimum_similarity_exclusive;
    const coverage = measureCoverage(romanceAnalysis, threshold);
    console.log(
      `romance tail: pairs=${(coverage.pairCoverageRate * 100).toFixed(3)}% users=${(
        coverage.userCoverageRate * 100
      ).toFixed(3)}%`,
    );

    expect(trackConfig.maximum_pair_tail).toBe(0.06);
    expect(coverage.pairCoverageRate).toBeLessThanOrEqual(
      trackConfig.maximum_pair_tail!,
    );
  });

  it("calibrates the synthetic population to each track's coverage percentile", () => {
    for (const analysis of [romanceAnalysis, friendshipAnalysis]) {
      const trackConfig = MATCHING_CONFIG.tracks[analysis.track];
      const initialThreshold = trackConfig.minimum_similarity_exclusive;
      const targetCoverage = trackConfig.target_coverage_percentile;
      const initial = measureCoverage(analysis, initialThreshold);
      const calibration = calibrateThreshold(
        analysis,
        initialThreshold,
        targetCoverage,
      );

      expect(calibration.calibrated).toBe(true);
      expect(calibration.final.thresholdExclusive).toBeGreaterThan(initialThreshold);
      expect(calibration.final.userCoverageRate).toBeCloseTo(targetCoverage, 2);
      expect(calibration.final.userCoverageRate).toBeLessThanOrEqual(
        initial.userCoverageRate,
      );
    }
  });
});
