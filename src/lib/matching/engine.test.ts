import { describe, expect, it } from "vitest";

import {
  MATCHING_CONFIG,
  MICROTEST_ITEMS,
  checkHardFilters,
  computeAllMatches,
  cosineSimilarity,
  findDualMatches,
  generateBadges,
  isRelationshipCompatible,
  scoreQuiz,
  trackSimilarity,
  weightedTrackSimilarity,
} from "@/lib/matching";
import { getMaxMatches } from "@/lib/matching";
import {
  ALL_DIMENSIONS,
  BIG_FIVE_DIMENSIONS,
  FRIENDSHIP_VECTOR_DIMENSIONS,
  FRIENDSHIP_VECTOR_LENGTH,
  ROMANCE_VECTOR_DIMENSIONS,
  ROMANCE_VECTOR_LENGTH,
} from "@/types/microtest";
import type {
  CategoryWeights,
  DimensionScores,
  Dimension,
  HardFilters,
  LikertValue,
  MatchingConfig,
  QuizSubmission,
  ScoredProfile,
} from "@/types/microtest";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ROMANCE_TRACK = MATCHING_CONFIG.tracks.romance;
const AMISTAD_TRACK = MATCHING_CONFIG.tracks.amistad;

const LIKERT_ITEMS = MICROTEST_ITEMS.filter((item) => item.tipo_respuesta === "likert_5");
const FILTER_ITEMS = MICROTEST_ITEMS.filter((item) => item.tipo_respuesta === "seleccion_multiple");

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
  value: LikertValue = 3,
  overrides: Partial<Record<string, LikertValue>> = {},
  filterSelections: Record<string, string[]> = DEFAULT_FILTER_SELECTIONS,
): QuizSubmission {
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
function uniformScores(value: number): DimensionScores {
  return Object.fromEntries(ALL_DIMENSIONS.map((dimension) => [dimension, value])) as
    DimensionScores;
}

/** Signed weights contributed to a dimension by the Likert items. */
function weightsFor(dimension: Dimension): Array<1 | -1> {
  return LIKERT_ITEMS
    .map((item) => item.pesos[dimension])
    .filter((weight): weight is 1 | -1 => weight !== undefined);
}

/**
 * Normalized score expected when every Likert item is answered with `value`.
 * Negative items are reverse-scored (`6 - value`) before normalization.
 */
function expectedUniformScore(dimension: Dimension, value: LikertValue): number {
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

function romanceVector(value: number, overrides: Partial<Record<Dimension, number>> = {}): number[] {
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

function makeProfile(options: ProfileOptions = {}): ScoredProfile {
  return {
    rawScores: uniformScores(3),
    normalizedScores: uniformScores(0.5),
    mbtiCode: options.mbtiCode ?? "ENFJ",
    hardFilters: options.hardFilters ?? hardFilters(),
    romanceVector: options.romanceVector ?? romanceVector(0.6),
    friendshipVector: options.friendshipVector ?? friendshipVector(0.6),
  };
}

function withThresholds(romance: number, amistad: number): MatchingConfig {
  return {
    ...MATCHING_CONFIG,
    tracks: {
      romance: { ...ROMANCE_TRACK, minimum_similarity_exclusive: romance },
      amistad: { ...AMISTAD_TRACK, minimum_similarity_exclusive: amistad },
    },
  };
}

// ─── Questionnaire scoring ────────────────────────────────────────────────────

describe("scoreQuiz", () => {
  const neutral = scoreQuiz(buildSubmission(3), MICROTEST_ITEMS);

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
    expect(Object.keys(neutral.normalizedScores)).toEqual(ALL_DIMENSIONS);
    for (const dimension of ALL_DIMENSIONS) {
      const score = neutral.normalizedScores[dimension];
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });

  it("lands on the neutral midpoint when every item is answered 3", () => {
    for (const dimension of ALL_DIMENSIONS) {
      expect(neutral.normalizedScores[dimension]).toBeCloseTo(0.5, 12);
      expect(neutral.rawScores[dimension]).toBe(3 * weightsFor(dimension).length);
    }
    // Every axis sits exactly on 0.5 and deriveMbtiCode uses `>= 0.5`, so all
    // four MBTI axes resolve to their positive letter (E/N/T/J).
    expect(neutral.mbtiCode).toBe("ENTJ");
  });

  it("derives a valid four-letter MBTI code from the MBTI dimensions", () => {
    for (const value of [1, 3, 5] as LikertValue[]) {
      const profile = scoreQuiz(buildSubmission(value), MICROTEST_ITEMS);
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
    const introvert = scoreQuiz(
      buildSubmission(3, { PM01: 1, PM02: 5, PM03: 1, PM04: 5, PM05: 1, PM06: 1, PM07: 1, PM08: 1 }),
      MICROTEST_ITEMS,
    );
    const extravert = scoreQuiz(
      buildSubmission(3, { PM01: 5, PM02: 1, PM03: 5, PM04: 1, PM05: 5, PM06: 5, PM07: 5, PM08: 5 }),
      MICROTEST_ITEMS,
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
    const submission: QuizSubmission = { likert: buildSubmission().likert, filters: [] };
    expect(scoreQuiz(submission, MICROTEST_ITEMS).hardFilters).toEqual({
      orientacion_sexual: [],
      identidad_genero: [],
      tipo_relacion_busca: [],
    });
  });

  it("scores uniformly low answers below uniformly high answers per polarity", () => {
    const lowest = scoreQuiz(buildSubmission(1), MICROTEST_ITEMS);
    const highest = scoreQuiz(buildSubmission(5), MICROTEST_ITEMS);

    for (const dimension of ALL_DIMENSIONS) {
      expect(lowest.normalizedScores[dimension]).toBeCloseTo(expectedUniformScore(dimension, 1), 12);
      expect(highest.normalizedScores[dimension]).toBeCloseTo(expectedUniformScore(dimension, 5), 12);
      // Reverse scoring keeps the two extremes mirror-symmetric around 0.5.
      expect(
        lowest.normalizedScores[dimension] + highest.normalizedScores[dimension],
      ).toBeCloseTo(1, 12);
    }

    const mean = (profile: ScoredProfile) =>
      ALL_DIMENSIONS.reduce((sum, dimension) => sum + profile.normalizedScores[dimension], 0) /
      ALL_DIMENSIONS.length;

    expect(mean(lowest)).toBeLessThan(0.5);
    expect(mean(highest)).toBeGreaterThan(0.5);
  });

  it("reverse-scores negatively weighted items instead of summing them raw", () => {
    const positiveOnly = ALL_DIMENSIONS.filter(
      (dimension) => weightsFor(dimension).every((weight) => weight === 1),
    );
    const negativeOnly = ALL_DIMENSIONS.filter(
      (dimension) => weightsFor(dimension).every((weight) => weight === -1),
    );
    const mixed = ALL_DIMENSIONS.filter((dimension) => {
      const weights = weightsFor(dimension);
      return weights.includes(1) && weights.includes(-1);
    });

    expect(positiveOnly.length).toBeGreaterThan(0);
    expect(negativeOnly.length).toBeGreaterThan(0);
    expect(mixed.length).toBeGreaterThan(0);

    const lowest = scoreQuiz(buildSubmission(1), MICROTEST_ITEMS);
    const highest = scoreQuiz(buildSubmission(5), MICROTEST_ITEMS);

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
    const agreeWithOpenness = scoreQuiz(
      buildSubmission(3, { PB01: 5, PB02: 1 }),
      MICROTEST_ITEMS,
    );
    const disagreeWithOpenness = scoreQuiz(
      buildSubmission(3, { PB01: 1, PB02: 5 }),
      MICROTEST_ITEMS,
    );

    expect(agreeWithOpenness.rawScores.personalidad_apertura).toBe(10);
    expect(agreeWithOpenness.normalizedScores.personalidad_apertura).toBeCloseTo(1, 12);
    expect(disagreeWithOpenness.rawScores.personalidad_apertura).toBe(2);
    expect(disagreeWithOpenness.normalizedScores.personalidad_apertura).toBeCloseTo(0, 12);
    // Untouched dimensions keep the neutral score.
    expect(agreeWithOpenness.normalizedScores.cultural_humor).toBeCloseTo(0.5, 12);
  });

  it("is deterministic for identical submissions", () => {
    expect(scoreQuiz(buildSubmission(4), MICROTEST_ITEMS)).toEqual(
      scoreQuiz(buildSubmission(4), MICROTEST_ITEMS),
    );
  });

  it("rejects a submission that is missing a scored item", () => {
    const incomplete: QuizSubmission = {
      likert: buildSubmission().likert.filter((answer) => answer.itemId !== "PB01"),
      filters: buildSubmission().filters,
    };

    expect(() => scoreQuiz(incomplete, MICROTEST_ITEMS)).toThrow(/Incomplete quiz/);
    expect(() => scoreQuiz(incomplete, MICROTEST_ITEMS)).toThrow(/PB01/);
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

describe("checkHardFilters", () => {
  it("requires mutual attraction between heterosexual partners", () => {
    const heterosexualMan = hardFilters({
      orientacion_sexual: ["mujeres"],
      identidad_genero: ["hombre"],
    });
    const heterosexualWoman = hardFilters({
      orientacion_sexual: ["hombres"],
      identidad_genero: ["mujer"],
    });
    const lesbianWoman = hardFilters({
      orientacion_sexual: ["mujeres"],
      identidad_genero: ["mujer"],
    });

    expect(checkHardFilters(heterosexualMan, heterosexualWoman)).toBe(true);
    expect(checkHardFilters(heterosexualMan, lesbianWoman)).toBe(false);
  });

  it("allows gay men and wildcard preferences", () => {
    const gayManA = hardFilters({
      orientacion_sexual: ["hombres"],
      identidad_genero: ["hombre"],
    });
    const gayManB = hardFilters({
      orientacion_sexual: ["hombres"],
      identidad_genero: ["hombre"],
    });
    const wildcard = hardFilters({
      orientacion_sexual: ["todxs"],
      identidad_genero: ["prefiero no decir"],
    });

    expect(checkHardFilters(gayManA, gayManB)).toBe(true);
    expect(checkHardFilters(gayManA, wildcard)).toBe(true);
  });

  it("requires an asexual person’s match to be asexual or demisexual", () => {
    const asexual = hardFilters({
      orientacion_sexual: ["asexual"],
      identidad_genero: ["mujer"],
    });
    const allosexual = hardFilters({
      orientacion_sexual: ["mujeres"],
      identidad_genero: ["mujer"],
    });
    const demisexual = hardFilters({
      orientacion_sexual: ["demisexual"],
      identidad_genero: ["mujer"],
    });

    expect(checkHardFilters(asexual, allosexual)).toBe(false);
    expect(checkHardFilters(asexual, demisexual)).toBe(true);
  });

  it("treats solo_amistad-only as romance-incompatible but not a friendship filter", () => {
    const friendshipOnly = makeProfile({
      hardFilters: hardFilters({ tipo_relacion_busca: ["solo_amistad"] }),
    });
    const romanceInterested = makeProfile();
    const matches = computeAllMatches(
      [
        { userId: "friendship-only", profile: friendshipOnly },
        { userId: "romance-interested", profile: romanceInterested },
      ],
      withThresholds(0.5, 0.5),
    );

    expect(isRelationshipCompatible(["solo_amistad"], ["monogamia"])).toBe(false);
    expect(matches.map((match) => match.track)).toEqual(["amistad"]);
  });

  it("is symmetric", () => {
    const left = hardFilters({
      orientacion_sexual: ["mujeres"],
      identidad_genero: ["hombre"],
    });
    const right = hardFilters({
      orientacion_sexual: ["hombres"],
      identidad_genero: ["mujer"],
    });

    expect(checkHardFilters(left, right)).toBe(checkHardFilters(right, left));
    expect(checkHardFilters(left, right)).toBe(true);
    expect(isRelationshipCompatible(["solo_amistad", "monogamia"], ["monogamia"])).toBe(true);
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

describe("trackSimilarity", () => {
  it("maps centered identical and mirrored vectors to one and zero", () => {
    expect(trackSimilarity(romanceVector(0.8), romanceVector(0.8), ROMANCE_TRACK)).toBeCloseTo(1);
    expect(trackSimilarity(romanceVector(0.2), romanceVector(0.8), ROMANCE_TRACK)).toBeCloseTo(0);
  });

  it("respects category weights after centering", () => {
    const config = {
      ...ROMANCE_TRACK,
      centering: 0.5,
      dimensions: ["personalidad_apertura", "intimidad_tiempo_calidad"],
      weights: {
        personalidad: 0.9,
        afinidad_cultural: 0,
        intimidad_afecto: 0.1,
        valores_relacionales: 0,
        identidad: 0,
      },
    };
    expect(trackSimilarity([0.9, 0.9], [0.9, 0.1], config)).toBeCloseTo(0.9, 12);
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
    const results = findDualMatches(user, [{ userId: "twin", profile: twin }], MATCHING_CONFIG);

    expect(results).toHaveLength(2);
    expect(results.map((result) => result.track).sort()).toEqual(["amistad", "romance"]);
    for (const result of results) {
      expect(result.otherUserId).toBe("twin");
      expect(result.similarity).toBeCloseTo(1, 9);
    }
  });

  it("gives romance badges five slots and friendship badges three", () => {
    const results = findDualMatches(user, [{ userId: "twin", profile: twin }], MATCHING_CONFIG);
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
      MATCHING_CONFIG,
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.track).toBe("amistad");
    expect(results[0]?.otherUserId).toBe("blocked");
  });

  it("excludes profiles whose similarity collapses to zero", () => {
    expect(trackSimilarity(userWithDisjointSupport.romanceVector, distant.romanceVector, ROMANCE_TRACK))
      .toBe(0);
    expect(
      findDualMatches(
        userWithDisjointSupport,
        [{ userId: "distant", profile: distant }],
        MATCHING_CONFIG,
      ),
    ).toEqual([]);
  });

  it("applies both thresholds strictly (equal similarity never qualifies)", () => {
    const romanceSimilarity = trackSimilarity(user.romanceVector, twin.romanceVector, ROMANCE_TRACK);
    const amistadSimilarity = trackSimilarity(
      user.friendshipVector,
      twin.friendshipVector,
      AMISTAD_TRACK,
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
      MATCHING_CONFIG,
    );

    expect(results.map((result) => result.otherUserId).sort()).toEqual([
      "blocked",
      "twin",
      "twin",
    ]);
    expect(findDualMatches(user, [], MATCHING_CONFIG)).toEqual([]);
  });

  it("never leaks identifiers, vectors or raw answers into the result", () => {
    const results = findDualMatches(user, [{ userId: "twin", profile: twin }], MATCHING_CONFIG);

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

describe("computeAllMatches", () => {
  it("uses strict thresholds and honors per-track top-K selections", () => {
    const pool = ["a", "b", "c"].map((userId) => ({ userId, profile: makeProfile() }));
    const similarity = trackSimilarity(
      pool[0]!.profile.romanceVector,
      pool[1]!.profile.romanceVector,
      ROMANCE_TRACK,
    );
    const config = {
      ...withThresholds(similarity, 0.5),
      tracks: {
        romance: { ...ROMANCE_TRACK, minimum_similarity_exclusive: similarity, max_matches: 1 },
        amistad: { ...AMISTAD_TRACK, minimum_similarity_exclusive: 0.5, max_matches: 1 },
      },
    };

    const exactThreshold = computeAllMatches(pool, config);
    expect(exactThreshold.filter((match) => match.track === "romance")).toEqual([]);

    const overThreshold = computeAllMatches(pool, {
      ...config,
      tracks: {
        ...config.tracks,
        romance: { ...config.tracks.romance, minimum_similarity_exclusive: similarity - 1e-9 },
      },
    });
    const romancePairs = overThreshold
      .filter((match) => match.track === "romance")
      .map((match) => `${match.userA}:${match.userB}`);
    expect(romancePairs).toEqual(["a:b", "a:c"]);
  });

  it("keeps the union of either user's top-K list and emits canonical deterministic pairs", () => {
    const vectorAt = (degrees: number) => {
      const radians = (degrees * Math.PI) / 180;
      return romanceVector(0.5, {
        personalidad_apertura: 0.5 + 0.4 * Math.cos(radians),
        personalidad_responsabilidad: 0.5 + 0.4 * Math.sin(radians),
      });
    };
    const pool = [
      { userId: "BBBB", profile: makeProfile({ romanceVector: vectorAt(30).slice(0, 2) }) },
      { userId: "aaaa", profile: makeProfile({ romanceVector: vectorAt(0).slice(0, 2) }) },
      { userId: "cccc", profile: makeProfile({ romanceVector: vectorAt(50).slice(0, 2) }) },
      { userId: "DDDD", profile: makeProfile({ romanceVector: vectorAt(180).slice(0, 2) }) },
    ];
    const config: MatchingConfig = {
      ...withThresholds(0.5, 1),
      tracks: {
        romance: {
          ...ROMANCE_TRACK,
          minimum_similarity_exclusive: 0.5,
          max_matches: 1,
          dimensions: ["personalidad_apertura", "personalidad_responsabilidad"],
          weights: {
            personalidad: 1,
            afinidad_cultural: 0,
            intimidad_afecto: 0,
            valores_relacionales: 0,
            identidad: 0,
          },
        },
        amistad: { ...AMISTAD_TRACK, minimum_similarity_exclusive: 1, max_matches: 1 },
      },
    };
    const results = computeAllMatches(pool, config);
    const romancePairs = results.filter((match) => match.track === "romance");

    expect(romancePairs.map(({ userA, userB }) => [userA, userB])).toEqual([
      ["aaaa", "bbbb"],
      ["bbbb", "cccc"],
    ]);
    expect(romancePairs.every(({ userA, userB }) => userA < userB)).toBe(true);
    expect(romancePairs.every(({ userA, userB }) => userA !== userB)).toBe(true);
    expect(computeAllMatches(pool, config)).toEqual(results);
    expect(getMaxMatches("romance")).toBe(5);
    expect(getMaxMatches("amistad")).toBe(5);
  });

  it("applies romance hard filters only to the romance track", () => {
    const man = makeProfile({
      hardFilters: hardFilters({
        orientacion_sexual: ["mujeres"],
        identidad_genero: ["hombre"],
      }),
    });
    const lesbian = makeProfile({
      hardFilters: hardFilters({
        orientacion_sexual: ["mujeres"],
        identidad_genero: ["mujer"],
      }),
    });
    const matches = computeAllMatches(
      [
        { userId: "man", profile: man },
        { userId: "woman", profile: lesbian },
      ],
      withThresholds(0.5, 0.5),
    );

    expect(matches.map((match) => match.track)).toEqual(["amistad"]);
  });

  it("does not emit self-pairs when the pool contains duplicate identifiers", () => {
    const profile = makeProfile();
    const matches = computeAllMatches(
      [
        { userId: "same", profile },
        { userId: "same", profile },
      ],
      withThresholds(0.5, 0.5),
    );

    expect(matches).toEqual([]);
  });
});

// ─── Configuration contract ───────────────────────────────────────────────────

describe("MATCHING_CONFIG", () => {
  it("publishes the calibrated dual thresholds", () => {
    expect(MATCHING_CONFIG.version).toBe("1.0");
    expect(ROMANCE_TRACK.minimum_similarity_exclusive).toBe(0.65);
    expect(AMISTAD_TRACK.minimum_similarity_exclusive).toBe(0.68);
    expect(ROMANCE_TRACK.centering).toBe(0.5);
    expect(AMISTAD_TRACK.centering).toBe(0.5);
    expect(ROMANCE_TRACK.max_matches).toBe(5);
    expect(AMISTAD_TRACK.max_matches).toBe(5);
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
    expect(MATCHING_CONFIG.calibration.method).toBe("bisection");
    expect(MATCHING_CONFIG.calibration.target_coverage).toBe(0.3);
    expect(MATCHING_CONFIG.calibration.max_users).toBe(300);
  });
});

describe("MICROTEST_ITEMS", () => {
  it("holds 60 items split into 57 Likert and 3 hard-filter questions", () => {
    expect(MICROTEST_ITEMS).toHaveLength(60);
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
    for (const dimension of ALL_DIMENSIONS) {
      expect(weightsFor(dimension).length).toBeGreaterThan(0);
    }
  });
});
