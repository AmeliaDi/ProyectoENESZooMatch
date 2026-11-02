import { describe, expect, it } from "vitest";

import { MATCHING_CONFIG, QUIZ_ITEMS } from "@/config";
import { mulberry32 } from "@/domain/shared";
import { gaussian } from "@/domain/math";
import { ALL_DIMENSIONS, type QuizSubmission } from "@/types/microtest";
import type { MatchingConfig } from "@/types/matching-config";

import { computeAllMatches } from "./compute-matches";
import { checkHardFilters, isRelationshipCompatible, romanceOptOut } from "./hard-filters";
import { scoreQuiz } from "./score-quiz";
import {
  FILTER_ITEMS,
  LIKERT_ITEMS,
  TEST_MODEL,
  buildSubmission,
  flatLatent,
  hardFilters,
  makeProfile,
  testLatentScorer,
} from "./test-fixtures";

const score = (submission: QuizSubmission) => scoreQuiz(submission, QUIZ_ITEMS, testLatentScorer);

function withThresholds(romance: number, amistad: number): MatchingConfig {
  return {
    ...MATCHING_CONFIG,
    tracks: {
      romance: { ...MATCHING_CONFIG.tracks.romance, minimum_similarity_exclusive: romance },
      amistad: { ...MATCHING_CONFIG.tracks.amistad, minimum_similarity_exclusive: amistad },
    },
  };
}

describe("scoreQuiz", () => {
  const neutral = score(buildSubmission(3));

  it("keeps the descriptive scores in [0, 1] and neutral at all-3 answers", () => {
    for (const d of ALL_DIMENSIONS) expect(neutral.normalizedScores[d]).toBeCloseTo(0.5, 12);
  });

  it("produces a latent posterior for every factor of the measurement model", () => {
    expect(Object.keys(neutral.latent.theta).sort()).toEqual([...TEST_MODEL.factors].sort());
    expect(neutral.latent.answered).toBe(LIKERT_ITEMS.length);
  });

  it("reads the MBTI letters from the latent axes", () => {
    const introvert = score(buildSubmission(3, { MB1: 5, MB5: 1, MB6: 5, MB7: 1 }));
    const extravert = score(buildSubmission(3, { MB1: 1, MB5: 5, MB6: 1, MB7: 5 }));
    expect(introvert.mbtiCode[0]).toBe("I");
    expect(extravert.mbtiCode[0]).toBe("E");
    expect(introvert.mbtiCode).toMatch(/^[EI][SN][TF][JP]$/);
  });

  it("extracts the three hard filters", () => {
    expect(neutral.hardFilters).toEqual({
      orientacion_sexual: ["mujeres"],
      identidad_genero: ["no binarie"],
      tipo_relacion_busca: ["monogamia"],
    });
  });

  it("widens the posterior instead of imputing when optional modules are skipped", () => {
    const coreOnly: QuizSubmission = {
      likert: buildSubmission().likert.filter((a) => {
        const item = LIKERT_ITEMS.find((i) => i.id === a.itemId);
        return item?.modulo === "nucleo" && !item.banderas.includes("SENS");
      }),
      filters: buildSubmission().filters,
    };
    const partial = score(coreOnly);
    expect(partial.latent.answered).toBeLessThan(neutral.latent.answered);
    expect(partial.latent.se.int_humor).toBeGreaterThan(neutral.latent.se.int_humor! - 1e-9);
    expect(partial.latent.se.hex_h).toBeGreaterThan(neutral.latent.se.hex_h!);
  });

  it("is deterministic and rejects a missing mandatory item", () => {
    expect(score(buildSubmission(4))).toEqual(score(buildSubmission(4)));
    const incomplete: QuizSubmission = {
      likert: buildSubmission().likert.filter((a) => a.itemId !== "H1"),
      filters: buildSubmission().filters,
    };
    expect(() => score(incomplete)).toThrow(/H1/);
  });
});

describe("checkHardFilters", () => {
  it("requires mutual attraction", () => {
    const man = hardFilters({ orientacion_sexual: ["mujeres"], identidad_genero: ["hombre"] });
    const woman = hardFilters({ orientacion_sexual: ["hombres"], identidad_genero: ["mujer"] });
    const lesbian = hardFilters({ orientacion_sexual: ["mujeres"], identidad_genero: ["mujer"] });
    expect(checkHardFilters(man, woman)).toBe(true);
    expect(checkHardFilters(man, lesbian)).toBe(false);
    expect(checkHardFilters(woman, man)).toBe(checkHardFilters(man, woman));
  });

  it("keeps 'prefiero no decir' in orientation or bond type in friendship only", () => {
    const open = hardFilters({ orientacion_sexual: ["mujeres", "hombres", "personas no binarias"] });
    expect(checkHardFilters(open, hardFilters({ orientacion_sexual: ["prefiero no decir"] }))).toBe(false);
    expect(checkHardFilters(open, hardFilters({ tipo_relacion_busca: ["prefiero no decir"] }))).toBe(false);
  });

  it("counts non-binary, fluid, agender and other identities under 'personas no binarias'", () => {
    const seeker = hardFilters({ orientacion_sexual: ["personas no binarias"] });
    for (const identity of ["no binarie", "género fluido", "agénero", "otra"]) {
      expect(checkHardFilters(seeker, hardFilters({ identidad_genero: [identity] })), identity).toBe(true);
    }
  });

  it("flags the own opt-out exactly when no romance pair could ever pass", () => {
    const everyone = ["mujeres", "hombres", "personas no binarias"];
    const bonds = ["monogamia", "no_monogamia_etica", "sin_definir"];
    const partners = ["mujer", "hombre", "no binarie"].flatMap((g) =>
      bonds.map((b) => hardFilters({ orientacion_sexual: everyone, identidad_genero: [g], tipo_relacion_busca: [b] })),
    );
    const cases: Array<Parameters<typeof hardFilters>[0]> = [
      { orientacion_sexual: ["prefiero no decir"] },
      { tipo_relacion_busca: ["prefiero no decir"] },
      { tipo_relacion_busca: ["solo_amistad"] },
      { identidad_genero: ["prefiero no decir"] },
      { tipo_relacion_busca: ["solo_amistad", "monogamia"] },
    ];
    for (const c of cases) {
      const me = hardFilters({ orientacion_sexual: everyone, ...c });
      const blocked = partners.every((other) => !checkHardFilters(me, other));
      expect(romanceOptOut(me), JSON.stringify(c)).toBe(blocked);
    }
  });

  it("blocks romance for solo_amistad-only but not mixed selections", () => {
    expect(isRelationshipCompatible(["solo_amistad"], ["monogamia"])).toBe(false);
    expect(isRelationshipCompatible(["solo_amistad", "monogamia"], ["monogamia"])).toBe(true);
  });
});

describe("computeAllMatches", () => {
  const random = mulberry32(31);
  const people = Array.from({ length: 24 }, (_, i) => ({
    userId: `user-${String(i).padStart(2, "0")}`,
    profile: makeProfile(flatLatent(Object.fromEntries(TEST_MODEL.factors.map((f) => [f, gaussian(random)])))),
  }));

  it("only emits pairs strictly above the threshold, ordered and deduplicated", () => {
    const matches = computeAllMatches(people, MATCHING_CONFIG);
    const keys = new Set<string>();
    for (const m of matches) {
      expect(m.similarity).toBeGreaterThan(MATCHING_CONFIG.tracks[m.track].minimum_similarity_exclusive);
      expect(m.userA < m.userB).toBe(true);
      const key = `${m.track}:${m.userA}:${m.userB}`;
      expect(keys.has(key)).toBe(false);
      keys.add(key);
    }
  });

  it("is deterministic and independent of pool order", () => {
    const a = computeAllMatches(people, MATCHING_CONFIG);
    expect(computeAllMatches([...people].reverse(), MATCHING_CONFIG)).toEqual(a);
  });

  it("caps matches initiated per person at max_matches", () => {
    const matches = computeAllMatches(people, withThresholds(0.05, 0.05));
    expect(matches.length).toBeGreaterThan(0);
    const romance = matches.filter((m) => m.track === "romance").length;
    expect(romance).toBeLessThanOrEqual(people.length * MATCHING_CONFIG.tracks.romance.max_matches);
  });

  it("derives badges from the categories that contribute most", () => {
    const [match] = computeAllMatches(people, withThresholds(0.05, 0.05));
    expect(match).toBeDefined();
    const limit = MATCHING_CONFIG.badges.per_track[match!.track];
    expect(match!.badges.length).toBeLessThanOrEqual(limit);
    for (const badge of match!.badges) expect(Object.keys(MATCHING_CONFIG.categories)).toContain(badge.dimension);
  });

  it("keeps solo_amistad people out of romance but in friendship", () => {
    const twin = flatLatent({}, 0.2);
    const matches = computeAllMatches(
      [
        { userId: "a", profile: makeProfile(twin, hardFilters({ tipo_relacion_busca: ["solo_amistad"] })) },
        { userId: "b", profile: makeProfile(twin) },
      ],
      withThresholds(0.05, 0.05),
    );
    expect(matches.map((m) => m.track)).toEqual(["amistad"]);
  });
});

describe("item bank", () => {
  it("holds a 60-item core with 57 Likert and 3 hard-filter questions", () => {
    const core = QUIZ_ITEMS.filter((item) => item.modulo === "nucleo");
    expect(core).toHaveLength(60);
    expect(core.filter((item) => item.tipo_respuesta === "likert_5")).toHaveLength(57);
    expect(FILTER_ITEMS.map((item) => item.campo_perfil)).toEqual([
      "orientacion_sexual",
      "identidad_genero",
      "tipo_relacion_busca",
    ]);
  });

  it("has measurement parameters for every Likert item", () => {
    for (const item of LIKERT_ITEMS) expect(TEST_MODEL.items.has(item.id), item.id).toBe(true);
  });
});
