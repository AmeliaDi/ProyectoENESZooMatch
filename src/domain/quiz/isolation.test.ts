import { describe, expect, it } from "vitest";

import { QUIZ_CATALOGUE } from "@/config/quiz-catalogue";

/**
 * CRITICAL INVARIANT: Quiz dimensions must NEVER overlap with psychometric
 * dimensions. Quizzes are for fun and icebreaking; they must not affect
 * the matching algorithm in any way.
 *
 * This test ensures that no quiz item references any psychometric dimension.
 */

const PSYCHOMETRIC_DIMENSIONS = [
  "hexaco",
  "big_five",
  "mbti",
  "enneagram",
  "apego",
  "valores",
  "atraccion",
  "vinculo",
  "proyecto_relacional",
];

describe("quiz-psychometric isolation", () => {
  const psychometricDimSet = new Set(PSYCHOMETRIC_DIMENSIONS);

  it("no quiz item references a psychometric dimension", () => {
    const violations: string[] = [];

    for (const category of ["gustos", "gaming", "picante"] as const) {
      for (const quiz of QUIZ_CATALOGUE[category]) {
        for (const item of quiz.items) {
          for (const dim of item.dimensiones_relacionadas) {
            if (psychometricDimSet.has(dim)) {
              violations.push(`${quiz.quiz_id}/${item.item_id} → ${dim}`);
            }
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("quiz dimensions are limited to allowed categories", () => {
    const ALLOWED_DIMS = new Set([
      "personalidad",
      "estilo",
      "estilo_de_vida",
      "gustos",
    ]);

    const violations: string[] = [];

    for (const category of ["gustos", "gaming", "picante"] as const) {
      for (const quiz of QUIZ_CATALOGUE[category]) {
        for (const item of quiz.items) {
          for (const dim of item.dimensiones_relacionadas) {
            if (!ALLOWED_DIMS.has(dim)) {
              violations.push(`${quiz.quiz_id}/${item.item_id} → ${dim}`);
            }
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
