import { describe, expect, it } from "vitest";

import catalogue from "../../data/arquetipos.json";
import {
  ENNEAGRAM_CURATED_ASSIGNMENTS,
  ENNEAGRAM_WING_CODES,
  attachmentCompatibility,
  cognitiveProfileFor,
  deriveAnimalPsychometricProfile,
  derivePsychometricProfile,
  enneagramCompatibility,
  functionAffinity,
  mbtiCompatibility,
  psychometricCompatibility,
} from "@/lib/psychometrics";
import type { EnneagramType, PsychometricProfile } from "@/lib/psychometrics";
import type { ArchetypeCatalog } from "@/types/archetype";

const animals = (catalogue as unknown as ArchetypeCatalog).animales;
const animalProfiles = animals.map((animal) => ({
  animal,
  profile: deriveAnimalPsychometricProfile(animal),
}));

const mbtiAxes: Array<[string, string, string]> = [
  ["INFP", "Fi", "Ne"],
  ["ENFP", "Ne", "Fi"],
  ["INFJ", "Ni", "Fe"],
  ["ENFJ", "Fe", "Ni"],
  ["INTJ", "Ni", "Te"],
  ["ENTJ", "Te", "Ni"],
  ["INTP", "Ti", "Ne"],
  ["ENTP", "Ne", "Ti"],
  ["ISFP", "Fi", "Se"],
  ["ESFP", "Se", "Fi"],
  ["ISTP", "Ti", "Se"],
  ["ESTP", "Se", "Ti"],
  ["ISFJ", "Si", "Fe"],
  ["ESFJ", "Fe", "Si"],
  ["ISTJ", "Si", "Te"],
  ["ESTJ", "Te", "Si"],
];

describe("cognitive functions", () => {
  it("maps all 16 MBTI codes to their dominant and auxiliary functions", () => {
    for (const [code, dominant, auxiliary] of mbtiAxes) {
      expect(cognitiveProfileFor(code), code).toMatchObject({
        dominant,
        auxiliary,
        axis: `${dominant}-${auxiliary}`,
      });
    }
  });

  it("keeps function affinity symmetric and bounded", () => {
    const functions = ["Ne", "Ni", "Se", "Si", "Fe", "Fi", "Te", "Ti"] as const;
    for (const first of functions) {
      for (const second of functions) {
        const forward = functionAffinity(first, second);
        const reverse = functionAffinity(second, first);
        expect(forward).toBeCloseTo(reverse, 12);
        expect(forward).toBeGreaterThanOrEqual(0);
        expect(forward).toBeLessThanOrEqual(1);
      }
    }
    expect(functionAffinity("Ne", "Ni")).toBe(1);
    expect(functionAffinity("Fe", "Ti")).toBe(1);
    expect(functionAffinity("Ne", "Se")).toBe(0.7);
    expect(functionAffinity("Ne", "Fe")).toBe(0.5);
  });
});

describe("Enneagram with wings", () => {
  it("publishes all 18 canonical wing codes", () => {
    expect(ENNEAGRAM_WING_CODES).toHaveLength(18);
    for (const type of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      const previous = type === 1 ? 9 : type - 1;
      const next = type === 9 ? 1 : type + 1;
      expect(ENNEAGRAM_WING_CODES).toContain(`${type}w${previous}`);
      expect(ENNEAGRAM_WING_CODES).toContain(`${type}w${next}`);
    }
  });

  it("covers every wing across the 103-animal catalogue", () => {
    const covered = new Set(animalProfiles.map(({ profile }) => profile.enneagram.code));
    const missing = ENNEAGRAM_WING_CODES.filter((code) => !covered.has(code));
    const counts = Object.fromEntries(
      ENNEAGRAM_WING_CODES.map((code) => [
        code,
        animalProfiles.filter(({ profile }) => profile.enneagram.code === code).length,
      ]),
    );
    console.log(
      `enneagram wings covered: ${covered.size}/18; missing: ${missing.join(", ") || "none"}; counts: ${JSON.stringify(counts)}`,
    );
    expect(missing).toEqual([]);
  });

  it("keeps every curated override attached to an existing animal", () => {
    const ids = new Set(animals.map((animal) => animal.id));
    for (const [id, code] of Object.entries(ENNEAGRAM_CURATED_ASSIGNMENTS)) {
      expect(ids.has(id), id).toBe(true);
      expect(ENNEAGRAM_WING_CODES, id).toContain(code);
    }
  });

  it("derives a valid type, adjacent wing and triad for every animal", () => {
    for (const { animal, profile } of animalProfiles) {
      const { type, wing, code, triada } = profile.enneagram;
      expect(type, animal.id).toBeGreaterThanOrEqual(1);
      expect(type, animal.id).toBeLessThanOrEqual(9);
      const adjacent = new Set([
        type === 1 ? 9 : type - 1,
        type === 9 ? 1 : type + 1,
      ]);
      expect(adjacent.has(wing), `${animal.id}: ${code}`).toBe(true);
      expect(["emocional", "mental", "instintiva"]).toContain(triada);
      expect(code).toBe(`${type}w${wing}`);
    }
  });

  it("uses the documented integration and stress lines", () => {
    const base = derivePsychometricProfile(null, "INFP");
    const profileForType = (type: number): PsychometricProfile => {
      const wing = (type === 1 ? 9 : type - 1) as EnneagramType;
      return {
        ...base,
        enneagram: {
          ...base.enneagram,
          type: type as EnneagramType,
          wing,
          code: `${type}w${wing}`,
        },
      };
    };
    const integration: Array<[number, number]> = [
      [1, 7], [2, 4], [3, 6], [4, 1], [5, 8], [6, 9], [7, 5], [8, 2], [9, 3],
    ];
    for (const [type, target] of integration) {
      expect(enneagramCompatibility(profileForType(type), profileForType(target))).toBe(1);
    }
  });
});

describe("attachment and psychometric operator", () => {
  const secure = derivePsychometricProfile(
    {
      personalidad_amabilidad: 0.9,
      personalidad_estabilidad_emocional: 0.9,
      personalidad_extraversion: 0.4,
      intimidad_apertura_emocional: 0.9,
      intimidad_limites_respeto: 0.9,
      intimidad_comunicacion_deseos: 0.7,
      valores_empatia: 0.9,
    },
    "INFP",
  );
  const anxious = derivePsychometricProfile(
    {
      personalidad_estabilidad_emocional: 0.2,
      intimidad_comunicacion_deseos: 0.9,
      intimidad_limites_respeto: 0.2,
      valores_empatia: 0.9,
    },
    "ENFJ",
  );
  const avoidant = derivePsychometricProfile(
    {
      personalidad_amabilidad: 0.2,
      personalidad_estabilidad_emocional: 0.5,
      personalidad_extraversion: 0.2,
      intimidad_apertura_emocional: 0.1,
      intimidad_limites_respeto: 0.9,
      intimidad_comunicacion_deseos: 0.1,
    },
    "INTJ",
  );

  it("identifies secure, anxious and avoidant styles", () => {
    expect(secure.attachment.style).toBe("seguro");
    expect(anxious.attachment.style).toBe("ansioso");
    expect(avoidant.attachment.style).toBe("evitativo");
  });

  it("punishes the anxious-avoidant pair more than two secure profiles", () => {
    expect(attachmentCompatibility(secure, secure)).toBe(1);
    expect(attachmentCompatibility(anxious, avoidant)).toBeLessThan(0.5);
  });

  it("returns a symmetric overall operator in [0, 1]", () => {
    for (const first of [secure, anxious, avoidant]) {
      for (const second of [secure, anxious, avoidant]) {
        const forward = psychometricCompatibility(first, second);
        const reverse = psychometricCompatibility(second, first);
        expect(forward.overall).toBeCloseTo(reverse.overall, 12);
        expect(forward.overall).toBeGreaterThanOrEqual(0);
        expect(forward.overall).toBeLessThanOrEqual(1);
        expect(forward.mbti).toBeCloseTo(reverse.mbti, 12);
        expect(forward.enneagram).toBeCloseTo(reverse.enneagram, 12);
        expect(forward.attachment).toBeCloseTo(reverse.attachment, 12);
      }
    }
  });

  it("is symmetric for MBTI compatibility", () => {
    expect(mbtiCompatibility(secure, anxious)).toBeCloseTo(
      mbtiCompatibility(anxious, secure),
      12,
    );
  });
});
