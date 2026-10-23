import { describe, expect, it } from "vitest";

import {
  MATCHING_CONFIG_V2,
  MICROTEST_V2_ITEMS,
  checkHardFilters,
  cosineSimilarity,
  findDualMatches,
  generateBadges,
  isGenderCompatible,
  isOrientationCompatible,
  isRelationshipCompatible,
  scoreQuizV2,
  weightedTrackSimilarity,
} from "@/lib/matching-v2";
import {
  ALL_DIMENSIONS_V2,
  BIG_FIVE_DIMENSIONS,
  FRIENDSHIP_VECTOR_DIMENSIONS,
  FRIENDSHIP_VECTOR_LENGTH,
  ROMANCE_VECTOR_DIMENSIONS,
  ROMANCE_VECTOR_LENGTH,
} from "@/types/microtest-v2";
import type {
  CategoryWeights,
  DimensionScoresV2,
  DimensionV2,
  HardFilters,
  LikertValue5,
  MatchingConfigV2,
  QuizSubmissionV2,
  ScoredProfileV2,
} from "@/types/microtest-v2";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ROMANCE_TRACK = MATCHING_CONFIG_V2.tracks.romance;
const AMISTAD_TRACK = MATCHING_CONFIG_V2.tracks.amistad;

const LIKERT_ITEMS = MICROTEST_V2_ITEMS.filter((item) => item.tipo_respuesta === "likert_5");
const FILTER_ITEMS = MICROTEST_V2_ITEMS.filter((item) => item.tipo_respuesta === "seleccion_multiple");

/** Answer values used for the three hard-filter items (IF01/IF02/IF03). */
const DEFAULT_FILTER_SELECTIONS: Record<string, string[]> = {
  IF01: ["mujeres"],
  IF02: ["no binario"],
  IF03: ["monogamia"],
};

const INTIMACY_INDICES = ROMANCE_VECTOR_DIMENSIONS
  .map((dimension, index) => ({ dimension, index }))
  .filter(({ dimension }) => dimension.startsWith("intimidad_"))
  .map(({ index }) => index);

/** Builds a complete submission: every Likert item answered, every filter set. */
function buildSubmission(
  value: LikertValue5 = 3,
  overrides: Partial<Record<string, LikertValue5>> = {},
  filterSelections: Record<string, string[]> = DEFAULT_FILTER_SELECTIONS,
): QuizSubmissionV2 {
  return {
    likert: LIKERT_ITEMS.map((item) => ({
      itemId: item.id,
      value: overrides[item.id] ?? value,
    })),
    filters: FILTER_ITEMS.map((item) => ({
      itemId: item.id,
      selected: filterSelections[item.id] ?? ["todxs"],
    })),
  };
}

/** Every scoring dimension set to the same normalized value. */
function uniformScores(value: number): DimensionScoresV2 {
  return Object.fromEntries(ALL_DIMENSIONS_V2.map((dimension) => [dimension, value])) as
    DimensionScoresV2;
}

/** Signed weights contributed to a dimension by the Likert items. */
function weightsFor(dimension: DimensionV2): Array<1 | -1> {
  return LIKERT_ITEMS
    .map((item) => item.pesos[dimension])
    .filter((weight): weight is 1 | -1 => weight !== undefined);
}

/**
 * Normalized score expected when every Likert item is answered with `value`.
 * Negative items are reverse-scored (`6 - value`) before normalization.
 */
function expectedUniformScore(dimension: DimensionV2, value: LikertValue5): number {
  const weights = weightsFor(dimension);
  if (weights.length === 0) return 0.5;
  const raw = weights.reduce((sum, weight) => sum + (weight === -1 ? 6 - value : value), 0);
  return (raw - weights.length) / (weights.length * 4);
}

function hardFilters(overrides: Partial<HardFilters> = {}): HardFilters {
  return {
    orientacion_sexual: ["mujeres"],
    identidad_genero: ["mujer"],
    tipo_relacion_busca: ["monogamia"],
    ...overrides,
  };
}

function romanceVector(value: number, overrides: Partial<Record<DimensionV2, number>> = {}): number[] {
  return ROMANCE_VECTOR_DIMENSIONS.map((dimension) => overrides[dimension] ?? value);
}

function friendshipVector(value: number): number[] {
  return FRIENDSHIP_VECTOR_DIMENSIONS.map(() => value);
}

/** `[1, …, 1, 0, …, 0]` — a vector with disjoint support once inverted. */
function splitPattern(length: number, onesUntil: number): number[] {
  return Array.from({ length }, (_, index) => (index < onesUntil ? 1 : 0));
}

function invertPattern(pattern: readonly number[]): number[] {
  return pattern.map((value) => (value > 0 ? 0 : 1));
}

interface ProfileOptions {
  hardFilters?: HardFilters;
  romanceVector?: number[];
  friendshipVector?: number[];
  mbtiCode?: string;
}

function makeProfile(options: ProfileOptions = {}): ScoredProfileV2 {
  return {
    rawScores: uniformScores(3),
    normalizedScores: uniformScores(0.5),
    mbtiCode: options.mbtiCode ?? "ENFJ",
    hardFilters: options.hardFilters ?? hardFilters(),
    romanceVector: options.romanceVector ?? romanceVector(0.6),
    friendshipVector: options.friendshipVector ?? friendshipVector(0.6),
  };
}

function withThresholds(romance: number, amistad: number): MatchingConfigV2 {
  return {
    ...MATCHING_CONFIG_V2,
    tracks: {
      romance: { ...ROMANCE_TRACK, minimum_similarity_exclusive: romance },
      amistad: { ...AMISTAD_TRACK, minimum_similarity_exclusive: amistad },
    },
  };
}

// ─── Questionnaire scoring ────────────────────────────────────────────────────

describe("scoreQuizV2", () => {
  const neutral = scoreQuizV2(buildSubmission(3), MICROTEST_V2_ITEMS);

  it("builds dual vectors of 26 romance and 16 friendship dimensions", () => {
    expect(ROMANCE_VECTOR_LENGTH).toBe(26);
    expect(FRIENDSHIP_VECTOR_LENGTH).toBe(16);
    expect(neutral.romanceVector).toHaveLength(ROMANCE_VECTOR_LENGTH);
    expect(neutral.friendshipVector).toHaveLength(FRIENDSHIP_VECTOR_LENGTH);
    expect(neutral.romanceVector).toEqual(
      ROMANCE_VECTOR_DIMENSIONS.map((dimension) => neutral.normalizedScores[dimension]),
    );
    expect(neutral.friendshipVector).toEqual(
      FRIENDSHIP_VECTOR_DIMENSIONS.map((dimension) => neutral.normalizedScores[dimension]),
    );
  });

  it("normalizes every one of the 30 dimensions into [0, 1]", () => {
    expect(Object.keys(neutral.normalizedScores)).toEqual(ALL_DIMENSIONS_V2);
    for (const dimension of ALL_DIMENSIONS_V2) {
      const score = neutral.normalizedScores[dimension];
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });

  it("lands on the neutral midpoint when every item is answered 3", () => {
    for (const dimension of ALL_DIMENSIONS_V2) {
      expect(neutral.normalizedScores[dimension]).toBeCloseTo(0.5, 12);
      expect(neutral.rawScores[dimension]).toBe(3 * weightsFor(dimension).length);
    }
    // Every axis sits exactly on 0.5 and deriveMbtiCode uses `>= 0.5`, so all
    // four MBTI axes resolve to their positive letter (E/N/T/J).
    expect(neutral.mbtiCode).toBe("ENTJ");
  });

  it("derives a valid four-letter MBTI code from the MBTI dimensions", () => {
    for (const value of [1, 3, 5] as LikertValue5[]) {
      const profile = scoreQuizV2(buildSubmission(value), MICROTEST_V2_ITEMS);
      expect(profile.mbtiCode).toMatch(/^[EI][NS][TF][JP]$/);
      expect(profile.mbtiCode[0] === "E").toBe(
        profile.normalizedScores.mbti_extraversion >= 0.5,
      );
      expect(profile.mbtiCode[1] === "N").toBe(profile.normalizedScores.mbti_intuicion >= 0.5);
      expect(profile.mbtiCode[2] === "T").toBe(profile.normalizedScores.mbti_pensamiento >= 0.5);
      expect(profile.mbtiCode[3] === "J").toBe(profile.normalizedScores.mbti_juicio >= 0.5);
    }
  });

  it("reads the letters from the four MBTI axes independently", () => {
    const introvert = scoreQuizV2(
      buildSubmission(3, { PM01: 1, PM02: 5, PM03: 1, PM04: 5, PM05: 1, PM06: 1, PM07: 1, PM08: 1 }),
      MICROTEST_V2_ITEMS,
    );
    const extravert = scoreQuizV2(
      buildSubmission(3, { PM01: 5, PM02: 1, PM03: 5, PM04: 1, PM05: 5, PM06: 5, PM07: 5, PM08: 5 }),
      MICROTEST_V2_ITEMS,
    );

    expect(introvert.normalizedScores.mbti_extraversion).toBeCloseTo(0, 12);
    expect(introvert.mbtiCode).toBe("ISFP");
    expect(extravert.normalizedScores.mbti_extraversion).toBeCloseTo(1, 12);
    expect(extravert.mbtiCode).toBe("ENTJ");
  });

  it("extracts the three hard filters from the multi-select items", () => {
    expect(neutral.hardFilters).toEqual({
      orientacion_sexual: ["mujeres"],
      identidad_genero: ["no binario"],
      tipo_relacion_busca: ["monogamia"],
    });
  });

  it("treats unanswered filters as an unexpressed preference", () => {
    const submission: QuizSubmissionV2 = { likert: buildSubmission().likert, filters: [] };
    expect(scoreQuizV2(submission, MICROTEST_V2_ITEMS).hardFilters).toEqual({
      orientacion_sexual: [],
      identidad_genero: [],
      tipo_relacion_busca: [],
    });
  });

  it("scores uniformly low answers below uniformly high answers per polarity", () => {
    const lowest = scoreQuizV2(buildSubmission(1), MICROTEST_V2_ITEMS);
    const highest = scoreQuizV2(buildSubmission(5), MICROTEST_V2_ITEMS);

    for (const dimension of ALL_DIMENSIONS_V2) {
      expect(lowest.normalizedScores[dimension]).toBeCloseTo(expectedUniformScore(dimension, 1), 12);
      expect(highest.normalizedScores[dimension]).toBeCloseTo(expectedUniformScore(dimension, 5), 12);
      // Reverse scoring keeps the two extremes mirror-symmetric around 0.5.
      expect(
        lowest.normalizedScores[dimension] + highest.normalizedScores[dimension],
      ).toBeCloseTo(1, 12);
    }

    const mean = (profile: ScoredProfileV2) =>
      ALL_DIMENSIONS_V2.reduce((sum, dimension) => sum + profile.normalizedScores[dimension], 0) /
      ALL_DIMENSIONS_V2.length;

    expect(mean(lowest)).toBeLessThan(0.5);
    expect(mean(highest)).toBeGreaterThan(0.5);
  });

  it("reverse-scores negatively weighted items instead of summing them raw", () => {
    const positiveOnly = ALL_DIMENSIONS_V2.filter(
      (dimension) => weightsFor(dimension).every((weight) => weight === 1),
    );
    const negativeOnly = ALL_DIMENSIONS_V2.filter(
      (dimension) => weightsFor(dimension).every((weight) => weight === -1),
    );
    const mixed = ALL_DIMENSIONS_V2.filter((dimension) => {
      const weights = weightsFor(dimension);
      return weights.includes(1) && weights.includes(-1);
    });

    expect(positiveOnly.length).toBeGreaterThan(0);
    expect(negativeOnly.length).toBeGreaterThan(0);
    expect(mixed.length).toBeGreaterThan(0);

    const lowest = scoreQuizV2(buildSubmission(1), MICROTEST_V2_ITEMS);
    const highest = scoreQuizV2(buildSubmission(5), MICROTEST_V2_ITEMS);

    for (const dimension of positiveOnly) {
      expect(lowest.normalizedScores[dimension]).toBeCloseTo(0, 12);
      expect(highest.normalizedScores[dimension]).toBeCloseTo(1, 12);
    }
    for (const dimension of negativeOnly) {
      expect(lowest.normalizedScores[dimension]).toBeCloseTo(1, 12);
      expect(highest.normalizedScores[dimension]).toBeCloseTo(0, 12);
    }
    // A dimension fed by one positive and one negative item stays neutral.
    for (const dimension of mixed.filter((item) => weightsFor(item).length === 2)) {
      expect(lowest.normalizedScores[dimension]).toBeCloseTo(0.5, 12);
      expect(highest.normalizedScores[dimension]).toBeCloseTo(0.5, 12);
    }
  });

  it("proves reverse scoring with the apertura pair PB01 (+1) and PB02 (-1)", () => {
    const agreeWithOpenness = scoreQuizV2(
      buildSubmission(3, { PB01: 5, PB02: 1 }),
      MICROTEST_V2_ITEMS,
    );
    const disagreeWithOpenness = scoreQuizV2(
      buildSubmission(3, { PB01: 1, PB02: 5 }),
      MICROTEST_V2_ITEMS,
    );

    expect(agreeWithOpenness.rawScores.personalidad_apertura).toBe(10);
    expect(agreeWithOpenness.normalizedScores.personalidad_apertura).toBeCloseTo(1, 12);
    expect(disagreeWithOpenness.rawScores.personalidad_apertura).toBe(2);
    expect(disagreeWithOpenness.normalizedScores.personalidad_apertura).toBeCloseTo(0, 12);
    // Untouched dimensions keep the neutral score.
    expect(agreeWithOpenness.normalizedScores.cultural_humor).toBeCloseTo(0.5, 12);
  });

  it("is deterministic for identical submissions", () => {
    expect(scoreQuizV2(buildSubmission(4), MICROTEST_V2_ITEMS)).toEqual(
      scoreQuizV2(buildSubmission(4), MICROTEST_V2_ITEMS),
    );
  });

  it("rejects a submission that is missing a scored item", () => {
    const incomplete: QuizSubmissionV2 = {
      likert: buildSubmission().likert.filter((answer) => answer.itemId !== "PB01"),
      filters: buildSubmission().filters,
    };

    expect(() => scoreQuizV2(incomplete, MICROTEST_V2_ITEMS)).toThrow(/Incomplete quiz/);
    expect(() => scoreQuizV2(incomplete, MICROTEST_V2_ITEMS)).toThrow(/PB01/);
  });
});

// ─── Cosine similarity ────────────────────────────────────────────────────────

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    const vector = [0.2, 0.5, 0.9, 1];
    expect(cosineSimilarity(vector, vector)).toBeCloseTo(1, 12);
    expect(cosineSimilarity([0.5, 0.5], [0.9, 0.9])).toBeCloseTo(1, 12);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(cosineSimilarity([0.4, 0, 0.7], [0, 0.9, 0])).toBe(0);
  });

  it("returns 0 when either vector has no magnitude", () => {
    expect(cosineSimilarity([0, 0, 0], [0.4, 0.5, 0.6])).toBe(0);
    expect(cosineSimilarity([0.4, 0.5, 0.6], [0, 0, 0])).toBe(0);
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
  });

  it("is symmetric and matches the closed-form value", () => {
    const first = [0.1, 0.4, 0.8];
    const second = [0.9, 0.2, 0.3];
    const expected =
      (0.1 * 0.9 + 0.4 * 0.2 + 0.8 * 0.3) /
      (Math.hypot(0.1, 0.4, 0.8) * Math.hypot(0.9, 0.2, 0.3));

    expect(cosineSimilarity(first, second)).toBeCloseTo(cosineSimilarity(second, first), 15);
    expect(cosineSimilarity(first, second)).toBeCloseTo(expected, 12);
  });

  it("throws when the vectors have different lengths", () => {
    expect(() => cosineSimilarity([0.5, 0.5], [0.5])).toThrow(/same length/);
    expect(() => cosineSimilarity(friendshipVector(0.5), romanceVector(0.5))).toThrow();
  });
});

// ─── Hard filters ─────────────────────────────────────────────────────────────

const ORIENTATION_VALUES = [
  "hombres",
  "mujeres",
  "personas no binarias",
  "todxs",
  "demisexual",
  "asexual",
  "prefiero no decir",
] as const;

const RELATIONSHIP_VALUES = [
  "monogamia",
  "no_monogamia_etica",
  "poliamor",
  "anarquia_relacional",
  "sin_definir",
  "solo_amistad",
] as const;

/** Expected orientation matrix, wildcards included. */
const ORIENTATION_EXPECTATION: Record<string, string[]> = {
  hombres: ["hombres", "mujeres", "personas no binarias", "todxs", "prefiero no decir"],
  mujeres: ["mujeres", "hombres", "personas no binarias", "todxs", "prefiero no decir"],
  "personas no binarias": [
    "personas no binarias",
    "hombres",
    "mujeres",
    "todxs",
    "prefiero no decir",
  ],
  todxs: [...ORIENTATION_VALUES],
  demisexual: ["demisexual", "asexual", "todxs", "prefiero no decir"],
  asexual: ["asexual", "demisexual", "todxs", "prefiero no decir"],
  "prefiero no decir": [...ORIENTATION_VALUES],
};

const RELATIONSHIP_EXPECTATION: Record<string, string[]> = {
  monogamia: ["monogamia"],
  no_monogamia_etica: ["no_monogamia_etica", "poliamor", "anarquia_relacional", "sin_definir"],
  poliamor: ["poliamor", "no_monogamia_etica", "anarquia_relacional", "sin_definir"],
  anarquia_relacional: [
    "anarquia_relacional",
    "no_monogamia_etica",
    "poliamor",
    "sin_definir",
  ],
  sin_definir: [
    "sin_definir",
    "no_monogamia_etica",
    "poliamor",
    "anarquia_relacional",
    "solo_amistad",
  ],
  solo_amistad: ["solo_amistad", "sin_definir"],
};

describe("isOrientationCompatible", () => {
  it("follows the documented compatibility matrix", () => {
    for (const left of ORIENTATION_VALUES) {
      for (const right of ORIENTATION_VALUES) {
        const expected = ORIENTATION_EXPECTATION[left]?.includes(right) ?? false;
        expect(isOrientationCompatible([left], [right])).toBe(expected);
        // The relation is symmetric.
        expect(isOrientationCompatible([right], [left])).toBe(expected);
      }
    }
  });

  it("accepts a pairing as soon as one selected value is compatible", () => {
    expect(isOrientationCompatible(["asexual", "mujeres"], ["hombres"])).toBe(true);
    expect(isOrientationCompatible(["asexual"], ["asexual", "hombres"])).toBe(true);
    expect(isOrientationCompatible(["asexual"], ["hombres", "mujeres"])).toBe(false);
  });

  it("treats an empty selection as an unexpressed filter", () => {
    expect(isOrientationCompatible([], ["asexual"])).toBe(true);
    expect(isOrientationCompatible(["hombres"], [])).toBe(true);
    expect(isOrientationCompatible([], [])).toBe(true);
  });
});

describe("isRelationshipCompatible", () => {
  it("follows the documented compatibility matrix", () => {
    for (const left of RELATIONSHIP_VALUES) {
      for (const right of RELATIONSHIP_VALUES) {
        const expected = RELATIONSHIP_EXPECTATION[left]?.includes(right) ?? false;
        expect(isRelationshipCompatible([left], [right])).toBe(expected);
        expect(isRelationshipCompatible([right], [left])).toBe(expected);
      }
    }
  });

  it("keeps monogamia exclusive and opens the non-monogamy family", () => {
    expect(isRelationshipCompatible(["monogamia"], ["monogamia"])).toBe(true);
    expect(isRelationshipCompatible(["monogamia"], ["poliamor"])).toBe(false);
    expect(isRelationshipCompatible(["monogamia"], ["sin_definir"])).toBe(false);
    expect(isRelationshipCompatible(["anarquia_relacional"], ["no_monogamia_etica"])).toBe(true);
    expect(isRelationshipCompatible(["anarquia_relacional"], ["poliamor"])).toBe(true);
    expect(isRelationshipCompatible(["anarquia_relacional"], ["sin_definir"])).toBe(true);
    expect(isRelationshipCompatible(["anarquia_relacional"], ["monogamia"])).toBe(false);
  });

  it("treats an empty selection as an unexpressed filter", () => {
    expect(isRelationshipCompatible([], ["monogamia"])).toBe(true);
    expect(isRelationshipCompatible(["poliamor"], [])).toBe(true);
  });
});

describe("isGenderCompatible", () => {
  it("never blocks a pairing on gender identity alone", () => {
    expect(isGenderCompatible(["mujer"], ["hombre"])).toBe(true);
    expect(isGenderCompatible(["no binario"], ["agenero"])).toBe(true);
    expect(isGenderCompatible(["prefiero no decir"], ["mujer"])).toBe(true);
    expect(isGenderCompatible([], ["género fluido"])).toBe(true);
    expect(isGenderCompatible([], [])).toBe(true);
  });
});

describe("checkHardFilters", () => {
  it("accepts two profiles whose three filters all align", () => {
    expect(
      checkHardFilters(
        hardFilters({ orientacion_sexual: ["mujeres"] }),
        hardFilters({ orientacion_sexual: ["hombres"], identidad_genero: ["hombre"] }),
      ),
    ).toBe(true);
  });

  it("rejects a pairing as soon as one filter is incompatible", () => {
    const base = hardFilters();

    expect(checkHardFilters(base, hardFilters({ orientacion_sexual: ["asexual"] }))).toBe(false);
    expect(checkHardFilters(base, hardFilters({ tipo_relacion_busca: ["poliamor"] }))).toBe(false);
    expect(
      checkHardFilters(
        hardFilters({ tipo_relacion_busca: ["solo_amistad"] }),
        hardFilters({ tipo_relacion_busca: ["monogamia"] }),
      ),
    ).toBe(false);
  });

  it("lets wildcard answers through every gate", () => {
    const wildcard = hardFilters({
      orientacion_sexual: ["todxs"],
      identidad_genero: ["prefiero no decir"],
      tipo_relacion_busca: [],
    });

    expect(checkHardFilters(wildcard, hardFilters({ orientacion_sexual: ["asexual"] }))).toBe(true);
    expect(checkHardFilters(wildcard, hardFilters({ orientacion_sexual: ["hombres"] }))).toBe(true);
    expect(
      checkHardFilters(wildcard, hardFilters({ orientacion_sexual: ["prefiero no decir"] })),
    ).toBe(true);
  });

  it("is symmetric", () => {
    const left = hardFilters({ orientacion_sexual: ["demisexual"] });
    const right = hardFilters({ orientacion_sexual: ["asexual"], tipo_relacion_busca: ["poliamor"] });

    expect(checkHardFilters(left, right)).toBe(checkHardFilters(right, left));
    expect(checkHardFilters(left, right)).toBe(false);
  });
});

// ─── Weighted track similarity ────────────────────────────────────────────────

describe("weightedTrackSimilarity", () => {
  /** Vectors that agree everywhere except the eight intimacy dimensions. */
  function intimacyDisagreement(): { first: number[]; second: number[] } {
    const first = romanceVector(0.8);
    const second = romanceVector(0.8);
    INTIMACY_INDICES.forEach((index, position) => {
      first[index] = position % 2 === 0 ? 0.9 : 0.1;
      second[index] = position % 2 === 0 ? 0.1 : 0.9;
    });
    return { first, second };
  }

  it("returns 1 for identical vectors on both tracks", () => {
    expect(
      weightedTrackSimilarity(
        romanceVector(0.42),
        romanceVector(0.42),
        ROMANCE_VECTOR_DIMENSIONS,
        ROMANCE_TRACK.weights,
      ),
    ).toBeCloseTo(1, 12);
    expect(
      weightedTrackSimilarity(
        friendshipVector(0.42),
        friendshipVector(0.42),
        FRIENDSHIP_VECTOR_DIMENSIONS,
        AMISTAD_TRACK.weights,
      ),
    ).toBeCloseTo(1, 12);
  });

  it("drops categories whose weight is zero", () => {
    const { first, second } = intimacyDisagreement();
    const withoutIntimacy: CategoryWeights = { ...ROMANCE_TRACK.weights, intimidad_afecto: 0 };

    expect(
      weightedTrackSimilarity(first, second, ROMANCE_VECTOR_DIMENSIONS, withoutIntimacy),
    ).toBeCloseTo(1, 12);
    expect(
      weightedTrackSimilarity(first, second, ROMANCE_VECTOR_DIMENSIONS, {
        personalidad: 0,
        afinidad_cultural: 0,
        intimidad_afecto: 0,
        valores_relacionales: 0,
        identidad: 0,
      }),
    ).toBe(0);
  });

  it("scores the same pair lower on romance than on amistad when intimacy diverges", () => {
    const { first, second } = intimacyDisagreement();

    const romance = weightedTrackSimilarity(
      first,
      second,
      ROMANCE_VECTOR_DIMENSIONS,
      ROMANCE_TRACK.weights,
    );
    const amistad = weightedTrackSimilarity(
      friendshipVector(0.8),
      friendshipVector(0.8),
      FRIENDSHIP_VECTOR_DIMENSIONS,
      AMISTAD_TRACK.weights,
    );

    expect(amistad).toBeCloseTo(1, 12);
    expect(romance).toBeLessThan(amistad);
    expect(romance).toBeGreaterThan(0.5);
    expect(romance).toBeLessThan(1);
  });

  it("moves the score towards a category as its weight grows", () => {
    const { first, second } = intimacyDisagreement();
    const baseline = weightedTrackSimilarity(
      first,
      second,
      ROMANCE_VECTOR_DIMENSIONS,
      ROMANCE_TRACK.weights,
    );
    const intimacyHeavy = weightedTrackSimilarity(first, second, ROMANCE_VECTOR_DIMENSIONS, {
      ...ROMANCE_TRACK.weights,
      intimidad_afecto: 0.9,
    });
    const intimacyLight = weightedTrackSimilarity(first, second, ROMANCE_VECTOR_DIMENSIONS, {
      ...ROMANCE_TRACK.weights,
      intimidad_afecto: 0.05,
    });

    expect(intimacyHeavy).toBeLessThan(baseline);
    expect(intimacyLight).toBeGreaterThan(baseline);
    expect(intimacyLight).toBeGreaterThan(0.9);
    expect(intimacyLight).toBeLessThanOrEqual(1);
    expect(intimacyHeavy).toBeGreaterThanOrEqual(0);
  });

  it("keeps the identity category inside the romance track only", () => {
    expect(ROMANCE_VECTOR_DIMENSIONS as readonly string[]).toContain("identidad_exclusividad");
    expect(FRIENDSHIP_VECTOR_DIMENSIONS as readonly string[]).not.toContain(
      "identidad_exclusividad",
    );
    expect(ROMANCE_TRACK.weights.identidad).toBeGreaterThan(0);
    expect(AMISTAD_TRACK.weights.identidad).toBe(0);
    expect(AMISTAD_TRACK.weights.intimidad_afecto).toBe(0);
  });

  it("throws when vectors and dimensions do not share a length", () => {
    expect(() =>
      weightedTrackSimilarity(
        romanceVector(0.5),
        friendshipVector(0.5),
        ROMANCE_VECTOR_DIMENSIONS,
        ROMANCE_TRACK.weights,
      ),
    ).toThrow(/same length/);
    expect(() =>
      weightedTrackSimilarity(
        romanceVector(0.5),
        romanceVector(0.5),
        FRIENDSHIP_VECTOR_DIMENSIONS,
        ROMANCE_TRACK.weights,
      ),
    ).toThrow(/same length/);
  });
});

// ─── Badges ───────────────────────────────────────────────────────────────────

describe("generateBadges", () => {
  it("returns five romance badges and three friendship badges by default", () => {
    const romance = generateBadges(
      romanceVector(0.5),
      romanceVector(0.5),
      ROMANCE_VECTOR_DIMENSIONS,
      "romance",
    );
    const amistad = generateBadges(
      friendshipVector(0.5),
      friendshipVector(0.5),
      FRIENDSHIP_VECTOR_DIMENSIONS,
      "amistad",
    );

    expect(romance).toHaveLength(5);
    expect(amistad).toHaveLength(3);
    expect(romance.map((badge) => badge.dimension)).toEqual(BIG_FIVE_DIMENSIONS);
    expect(amistad.map((badge) => badge.dimension)).toEqual(BIG_FIVE_DIMENSIONS.slice(0, 3));
  });

  it("exposes dimension, label, affinity and icon on every badge", () => {
    const badges = generateBadges(
      romanceVector(0.6),
      romanceVector(0.6),
      ROMANCE_VECTOR_DIMENSIONS,
      "romance",
    );

    for (const badge of badges) {
      expect(typeof badge.dimension).toBe("string");
      expect(badge.label.length).toBeGreaterThan(0);
      expect(badge.icon.length).toBeGreaterThan(0);
      expect(badge.affinity).toBeGreaterThanOrEqual(0);
      expect(badge.affinity).toBeLessThanOrEqual(1);
      expect(Object.keys(badge).sort()).toEqual(["affinity", "dimension", "icon", "label"]);
    }
  });

  it("sorts badges by affinity in descending order", () => {
    const second = romanceVector(0.5, {
      valores_empatia: 0.9,
      intimidad_contacto_fisico: 0.2,
      cultural_humor: 0.05,
    });
    const badges = generateBadges(
      romanceVector(0.5),
      second,
      ROMANCE_VECTOR_DIMENSIONS,
      "romance",
    );
    const affinities = badges.map((badge) => badge.affinity);

    expect(affinities).toEqual([...affinities].sort((left, right) => right - left));
    expect(affinities[0]).toBeCloseTo(1, 12);
    expect(badges.some((badge) => badge.dimension === "cultural_humor")).toBe(false);
  });

  it("computes affinity as one minus the absolute difference", () => {
    const [badge] = generateBadges([0.9], [0.4], ["valores_empatia"], "romance", 1);

    expect(badge).toEqual({
      dimension: "valores_empatia",
      label: "Empatía mutua",
      affinity: expect.closeTo(0.5, 12),
      icon: "💞",
    });
  });

  it("falls back to the raw dimension name for unknown dimensions", () => {
    const [badge] = generateBadges([0.5], [0.5], ["dimension_desconocida"], "romance", 1);

    expect(badge.label).toBe("dimension_desconocida");
    expect(badge.icon).toBe("•");
    expect(badge.affinity).toBeCloseTo(1, 12);
  });

  it("honours an explicit limit and clamps impossible ones", () => {
    expect(
      generateBadges(romanceVector(0.5), romanceVector(0.5), ROMANCE_VECTOR_DIMENSIONS, "romance", 2),
    ).toHaveLength(2);
    expect(
      generateBadges(romanceVector(0.5), romanceVector(0.5), ROMANCE_VECTOR_DIMENSIONS, "romance", 0),
    ).toHaveLength(0);
    expect(
      generateBadges(romanceVector(0.5), romanceVector(0.5), ROMANCE_VECTOR_DIMENSIONS, "amistad", -3),
    ).toHaveLength(0);
    expect(
      generateBadges(romanceVector(0.5), romanceVector(0.5), ROMANCE_VECTOR_DIMENSIONS, "romance", 99),
    ).toHaveLength(ROMANCE_VECTOR_LENGTH);
  });

  it("throws when vectors and dimensions do not share a length", () => {
    expect(() =>
      generateBadges(romanceVector(0.5), friendshipVector(0.5), ROMANCE_VECTOR_DIMENSIONS, "romance"),
    ).toThrow(/same length/);
  });
});

// ─── Dual match discovery ─────────────────────────────────────────────────────

describe("findDualMatches", () => {
  const user = makeProfile();
  const twin = makeProfile();
  const blockedByFilters = makeProfile({
    hardFilters: hardFilters({ tipo_relacion_busca: ["poliamor"] }),
  });
  const distant = makeProfile({
    hardFilters: hardFilters(),
    romanceVector: invertPattern(splitPattern(ROMANCE_VECTOR_LENGTH, 13)),
    friendshipVector: invertPattern(splitPattern(FRIENDSHIP_VECTOR_LENGTH, 8)),
  });
  const userWithDisjointSupport = makeProfile({
    romanceVector: splitPattern(ROMANCE_VECTOR_LENGTH, 13),
    friendshipVector: splitPattern(FRIENDSHIP_VECTOR_LENGTH, 8),
  });

  it("returns both tracks for a profile that clears every gate", () => {
    const results = findDualMatches(user, [{ userId: "twin", profile: twin }], MATCHING_CONFIG_V2);

    expect(results).toHaveLength(2);
    expect(results.map((result) => result.track).sort()).toEqual(["amistad", "romance"]);
    for (const result of results) {
      expect(result.otherUserId).toBe("twin");
      expect(result.similarity).toBeCloseTo(1, 9);
    }
  });

  it("gives romance badges five slots and friendship badges three", () => {
    const results = findDualMatches(user, [{ userId: "twin", profile: twin }], MATCHING_CONFIG_V2);
    const romance = results.find((result) => result.track === "romance");
    const amistad = results.find((result) => result.track === "amistad");

    expect(romance?.badges).toHaveLength(5);
    expect(amistad?.badges).toHaveLength(3);
    expect(romance?.narrative).toContain("Conexión romántica");
    expect(amistad?.narrative).toContain("Conexión de amistad");
    expect(romance?.narrative).toContain("100%");
  });

  it("lets friendship ignore hard filters that block romance", () => {
    const results = findDualMatches(
      user,
      [{ userId: "blocked", profile: blockedByFilters }],
      MATCHING_CONFIG_V2,
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.track).toBe("amistad");
    expect(results[0]?.otherUserId).toBe("blocked");
  });

  it("excludes profiles whose similarity collapses to zero", () => {
    expect(
      weightedTrackSimilarity(
        userWithDisjointSupport.romanceVector,
        distant.romanceVector,
        ROMANCE_VECTOR_DIMENSIONS,
        ROMANCE_TRACK.weights,
      ),
    ).toBe(0);
    expect(
      findDualMatches(
        userWithDisjointSupport,
        [{ userId: "distant", profile: distant }],
        MATCHING_CONFIG_V2,
      ),
    ).toEqual([]);
  });

  it("applies both thresholds strictly (equal similarity never qualifies)", () => {
    const romanceSimilarity = weightedTrackSimilarity(
      user.romanceVector,
      twin.romanceVector,
      ROMANCE_VECTOR_DIMENSIONS,
      ROMANCE_TRACK.weights,
    );
    const amistadSimilarity = weightedTrackSimilarity(
      user.friendshipVector,
      twin.friendshipVector,
      FRIENDSHIP_VECTOR_DIMENSIONS,
      AMISTAD_TRACK.weights,
    );
    const pool = [{ userId: "twin", profile: twin }];

    expect(
      findDualMatches(user, pool, withThresholds(romanceSimilarity, amistadSimilarity)),
    ).toEqual([]);
    expect(
      findDualMatches(user, pool, withThresholds(romanceSimilarity - 1e-9, amistadSimilarity)),
    ).toHaveLength(1);
    expect(
      findDualMatches(user, pool, withThresholds(romanceSimilarity, amistadSimilarity - 1e-9)),
    ).toHaveLength(1);
    expect(
      findDualMatches(user, pool, withThresholds(romanceSimilarity - 1e-9, amistadSimilarity - 1e-9)),
    ).toHaveLength(2);
  });

  it("scans the whole pool and returns an empty list when it is empty", () => {
    const results = findDualMatches(
      user,
      [
        { userId: "twin", profile: twin },
        { userId: "blocked", profile: blockedByFilters },
        { userId: "distant", profile: distant },
      ],
      MATCHING_CONFIG_V2,
    );

    expect(results.map((result) => result.otherUserId).sort()).toEqual([
      "blocked",
      "twin",
      "twin",
    ]);
    expect(findDualMatches(user, [], MATCHING_CONFIG_V2)).toEqual([]);
  });

  it("never leaks identifiers, vectors or raw answers into the result", () => {
    const results = findDualMatches(user, [{ userId: "twin", profile: twin }], MATCHING_CONFIG_V2);

    for (const result of results) {
      expect(Object.keys(result).sort()).toEqual([
        "badges",
        "narrative",
        "otherUserId",
        "similarity",
        "track",
      ]);
      expect(JSON.stringify(result)).not.toMatch(/matricula|hash|normalizedScores|romanceVector/i);
    }
  });
});

// ─── Configuration contract ───────────────────────────────────────────────────

describe("MATCHING_CONFIG_V2", () => {
  it("publishes the calibrated dual thresholds", () => {
    expect(MATCHING_CONFIG_V2.version).toBe("2.0");
    expect(ROMANCE_TRACK.minimum_similarity_exclusive).toBe(0.8);
    expect(AMISTAD_TRACK.minimum_similarity_exclusive).toBe(0.75);
  });

  it("lists exactly the vector dimensions of each track, in vector order", () => {
    expect(ROMANCE_TRACK.dimensions).toEqual(ROMANCE_VECTOR_DIMENSIONS);
    expect(AMISTAD_TRACK.dimensions).toEqual(FRIENDSHIP_VECTOR_DIMENSIONS);
    expect(ROMANCE_TRACK.dimensions).toHaveLength(ROMANCE_VECTOR_LENGTH);
    expect(AMISTAD_TRACK.dimensions).toHaveLength(FRIENDSHIP_VECTOR_LENGTH);
  });

  it("gates romance with the three hard filters and leaves friendship open", () => {
    expect(ROMANCE_TRACK.hard_filters).toEqual([
      "orientacion_sexual",
      "identidad_genero",
      "tipo_relacion_busca",
    ]);
    expect(AMISTAD_TRACK.hard_filters).toEqual([]);
  });

  it("normalizes every category weight, defaulting the absent ones to zero", () => {
    for (const track of [ROMANCE_TRACK, AMISTAD_TRACK]) {
      expect(Object.keys(track.weights).sort()).toEqual([
        "afinidad_cultural",
        "identidad",
        "intimidad_afecto",
        "personalidad",
        "valores_relacionales",
      ]);
      const total = Object.values(track.weights).reduce((sum, weight) => sum + weight, 0);
      expect(total).toBeCloseTo(1, 12);
    }
  });

  it("exposes the calibration metadata", () => {
    expect(MATCHING_CONFIG_V2.calibration.method).toBe("bisection");
    expect(MATCHING_CONFIG_V2.calibration.target_coverage).toBe(0.3);
    expect(MATCHING_CONFIG_V2.calibration.max_users).toBe(300);
  });
});

describe("MICROTEST_V2_ITEMS", () => {
  it("holds 60 items split into 57 Likert and 3 hard-filter questions", () => {
    expect(MICROTEST_V2_ITEMS).toHaveLength(60);
    expect(LIKERT_ITEMS).toHaveLength(57);
    expect(FILTER_ITEMS).toHaveLength(3);
  });

  it("marks every multi-select item as a hard filter bound to a profile field", () => {
    for (const item of FILTER_ITEMS) {
      expect(item.filtro_duro).toBe(true);
      expect(item.track_romance).toBe(true);
      expect(item.track_amistad).toBe(false);
      expect(item.opciones ?? []).not.toHaveLength(0);
      expect(item.opciones?.every((option) => option.length > 0)).toBe(true);
      expect(Object.keys(item.pesos)).toHaveLength(0);
    }
    expect(FILTER_ITEMS.map((item) => item.campo_perfil)).toEqual([
      "orientacion_sexual",
      "identidad_genero",
      "tipo_relacion_busca",
    ]);
  });

  it("covers all 30 scoring dimensions with at least one Likert item", () => {
    for (const dimension of ALL_DIMENSIONS_V2) {
      expect(weightsFor(dimension).length).toBeGreaterThan(0);
    }
  });
});
