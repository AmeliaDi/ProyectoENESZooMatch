import { describe, expect, it } from "vitest";

import activeMatchingConfig from "../../data/matching-config.json";
import calibrationReport from "../../data/synthetic-calibration.json";
import { hashMatricula } from "@/lib/identity.server";
import {
  buildDimensionJustification,
  cosineSimilarity,
  scoreMicrotest,
  type QuizAnswer,
} from "@/lib/matching";
import { getMatchingThreshold } from "@/lib/matching-config";
import { normalizeMatricula, quizSubmissionSchema } from "@/lib/validation";
import { MATCHING_DIMENSIONS, microtestData } from "@/types/microtest";

function answersWith(overrides: Record<string, 1 | 2 | 3 | 4> = {}): QuizAnswer[] {
  return microtestData.items.map((item) => ({
    itemId: item.id,
    value: overrides[item.id] ?? 3,
  }));
}

describe("private student identity", () => {
  it("normalizes separators and Unicode width without retaining the original form", () => {
    expect(normalizeMatricula("  ab-１２_34 ")).toBe("AB1234");
  });

  it("creates a deterministic HMAC-SHA-256 digest", () => {
    const secret = "a-secure-test-secret-that-is-long-enough";
    const first = hashMatricula("AB1234", secret);
    const second = hashMatricula("AB1234", secret);

    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(first).not.toContain("AB1234");
  });
});

describe("microtest scoring", () => {
  it("uses MBTI only for the archetype and builds a 13-dimensional match vector", () => {
    const result = scoreMicrotest(
      answersWith({ MB01: 1, MB02: 4, MB03: 4, MB04: 1, MB05: 4, MB06: 4 }),
    );

    expect(result.mbtiCode).toBe("INTJ");
    expect(result.matchingVector).toHaveLength(13);
    expect(MATCHING_DIMENSIONS).toHaveLength(13);
    expect(MATCHING_DIMENSIONS.every((dimension) => !dimension.startsWith("mbti_"))).toBe(true);
  });

  it("normalizes positive and reverse-keyed dimensions into zero-to-one values", () => {
    const result = scoreMicrotest(answersWith({ BF01: 4, BF02: 4 }));

    expect(result.normalizedScores.bigfive_apertura).toBe(1);
    expect(result.normalizedScores.bigfive_responsabilidad).toBe(0);
    expect(result.matchingVector.every((value) => value >= 0 && value <= 1)).toBe(true);
  });
});

describe("compatibility matching", () => {
  it("computes cosine similarity without dimension padding", () => {
    expect(cosineSimilarity([1, 0, 1], [1, 0, 1])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(() => cosineSimilarity([1], [1, 2])).toThrow();
  });

  it("justifies a match with named non-MBTI dimensions only", () => {
    const first = Array.from({ length: 13 }, () => 0.8);
    const second = Array.from({ length: 13 }, () => 0.75);
    const justification = buildDimensionJustification(first, second);

    expect(justification).toHaveLength(3);
    expect(justification.every(({ dimension }) => !dimension.startsWith("mbti_"))).toBe(true);
    for (const { affinity } of justification) {
      expect(affinity).toBeCloseTo(0.95);
    }
  });

  it("loads the single active calibrated threshold from the generated configuration", () => {
    expect(Object.keys(activeMatchingConfig)).toEqual(["minimum_similarity_exclusive"]);
    expect(calibrationReport.initial_measurement.threshold_exclusive).toBe(0.85);
    expect(calibrationReport.calibration.target_user_coverage_rate).toBe(0.2);
    expect(calibrationReport.calibration.user_coverage_rate).toBe(0.2);
    expect(activeMatchingConfig.minimum_similarity_exclusive).toBe(
      calibrationReport.calibration.threshold_exclusive,
    );
    expect(getMatchingThreshold()).toBe(activeMatchingConfig.minimum_similarity_exclusive);
    expect(calibrationReport.validation).toEqual({
      method: "independent_runtime_validation",
      node_executed: false,
      vitest_executed: false,
    });
  });
});

describe("quiz input validation", () => {
  it("accepts every canonical item exactly once and rejects duplicates", () => {
    const validAnswers = answersWith();
    expect(quizSubmissionSchema.safeParse({ answers: validAnswers }).success).toBe(true);

    const duplicated = [...validAnswers];
    duplicated[0] = duplicated[1]!;
    expect(quizSubmissionSchema.safeParse({ answers: duplicated }).success).toBe(false);
  });
});
