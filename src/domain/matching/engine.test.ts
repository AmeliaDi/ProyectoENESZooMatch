import { describe, expect, it } from "vitest";

import { MATCHING_CONFIG, QUIZ_ITEMS } from "@/config";
import { mulberry32 } from "@/domain/shared";
import type { LikertValue } from "@/types/microtest";

import { computeAllMatches } from "./compute-matches";
import { DEFAULT_ENGINE, ENGINES, ENGINE_IDS, resolveEngine } from "./engine";
import { checkHardFilters } from "./hard-filters";
import { scoreQuiz } from "./score-quiz";
import { buildSubmission, testLatentScorer, LIKERT_ITEMS } from "./test-fixtures";

const ORIENTATIONS = [
  { orientacion_sexual: ["mujeres"], identidad_genero: ["mujer"] },
  { orientacion_sexual: ["hombres"], identidad_genero: ["hombre"] },
  { orientacion_sexual: ["cualquier género"], identidad_genero: ["no binarie"] },
] as const;

/** Twelve scored profiles with genuinely different descriptive vectors and declarations. */
function pool() {
  return Array.from({ length: 12 }, (_, k) => {
    const overrides: Record<string, LikertValue> = {};
    LIKERT_ITEMS.forEach((item, i) => {
      overrides[item.id] = (1 + ((i * 7 + k * 3) % 5)) as LikertValue;
    });
    const declaration = ORIENTATIONS[k % ORIENTATIONS.length]!;
    const profile = scoreQuiz(
      buildSubmission(3, overrides, {
        FIL1: [...declaration.orientacion_sexual],
        FIL2: [...declaration.identidad_genero],
        FIL3: ["monogamia"],
      }),
      QUIZ_ITEMS,
      testLatentScorer,
    );
    return { userId: `user-${String(k).padStart(2, "0")}`, profile };
  });
}

describe("resolveEngine", () => {
  it("knows every registered id and defaults to the live engine", () => {
    expect(DEFAULT_ENGINE).toBe("capas");
    for (const id of ENGINE_IDS) expect(resolveEngine(id).id).toBe(id);
  });

  it("throws on an unknown id instead of silently picking one", () => {
    expect(() => resolveEngine("nope")).toThrow(/Unknown MATCHING_ENGINE/);
    expect(() => resolveEngine("")).toThrow(/Unknown MATCHING_ENGINE/);
    expect(() => resolveEngine("CAPAS")).toThrow(/Unknown MATCHING_ENGINE/);
  });
});

describe("engine interchangeability", () => {
  it("capas reproduces computeAllMatches exactly", () => {
    const people = pool();
    expect(ENGINES.capas.compute(people, MATCHING_CONFIG)).toEqual(computeAllMatches(people, MATCHING_CONFIG));
  });

  it("both engines emit canonical, duplicate-free, non-self pairs", () => {
    const people = pool();
    for (const id of ENGINE_IDS) {
      const matches = ENGINES[id].compute(people, MATCHING_CONFIG);
      const keys = new Set(matches.map((m) => `${m.track}:${m.userA}:${m.userB}`));
      expect(keys.size).toBe(matches.length);
      for (const m of matches) {
        expect(m.userA < m.userB).toBe(true);
        expect(m.similarity).toBeGreaterThan(MATCHING_CONFIG.tracks[m.track].minimum_similarity_exclusive);
      }
    }
  });

  it("both engines gate romance on the same mutual hard filters", () => {
    const people = pool();
    const byId = new Map(people.map((p) => [p.userId, p.profile]));
    for (const id of ENGINE_IDS) {
      for (const m of ENGINES[id].compute(people, MATCHING_CONFIG)) {
        if (m.track !== "romance") continue;
        expect(checkHardFilters(byId.get(m.userA)!.hardFilters, byId.get(m.userB)!.hardFilters)).toBe(true);
      }
    }
  });

  it("both engines are independent of pool order", () => {
    const people = pool();
    const random = mulberry32(99);
    for (const id of ENGINE_IDS) {
      const baseline = ENGINES[id].compute(people, MATCHING_CONFIG);
      for (let run = 0; run < 5; run += 1) {
        const shuffled = [...people];
        for (let i = shuffled.length - 1; i > 0; i -= 1) {
          const j = Math.floor(random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
        }
        expect(ENGINES[id].compute(shuffled, MATCHING_CONFIG)).toEqual(baseline);
      }
    }
  });

  it("the challenger is a real alternative: it disagrees and explains nothing", () => {
    const people = pool();
    const layered = ENGINES.capas.compute(people, MATCHING_CONFIG);
    const naive = ENGINES.coseno.compute(people, MATCHING_CONFIG);
    expect(layered.length).toBeGreaterThan(0);
    expect(naive.length).toBeGreaterThan(0);
    expect(naive).not.toEqual(layered);
    expect(layered.some((m) => m.badges.length > 0)).toBe(true);
    expect(naive.every((m) => m.badges.length === 0)).toBe(true);
  });

  it("the challenger needs the descriptive vectors the layered engine does not", () => {
    const people = pool().map((p) => ({ ...p, profile: { ...p.profile, romanceVector: [], friendshipVector: [] } }));
    expect(ENGINES.coseno.compute(people, MATCHING_CONFIG)).toEqual([]);
    expect(ENGINES.capas.compute(people, MATCHING_CONFIG).length).toBeGreaterThan(0);
  });
});