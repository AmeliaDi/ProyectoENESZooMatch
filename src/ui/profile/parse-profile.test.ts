import { describe, expect, it } from "vitest";

import { parseProfile } from "./parse-profile";

const HATCHED_IDENTITY = {
  estadoIdentidad: "eclosionado",
  aliasCompleto: "tortuguita gris neblina · DRRS",
  aliasAnimal: "tortuguita",
  aliasColor: "gris neblina",
  aliasSufijo: "DRRS",
  animalId: "mbti-infp",
  colorId: "ennea-4",
  mbtiCode: "INFP",
  enneagramCode: "4w5",
  enneagramName: "La observadora",
  mark: null,
  revelacionVista: true,
};

const EGG_IDENTITY = {
  estadoIdentidad: "huevo",
  aliasCompleto: null,
  aliasAnimal: null,
  aliasColor: null,
  aliasSufijo: null,
  animalId: null,
  colorId: null,
  mbtiCode: null,
  enneagramCode: null,
  enneagramName: null,
  mark: null,
  revelacionVista: false,
};

const VALID_PAYLOAD = {
  identity: HATCHED_IDENTITY,
  mbti: { code: "INFP", balancedAxes: 1 },
  enneagram: { code: "4w5", name: "La observadora", archetype: "Individualista", exploring: false },
  narrative: "Una lectura amable.",
  virtues: [{ title: "Empatía", text: "Sientes lo que otros sienten." }],
  sections: [],
  openScales: { open: 2, total: 8 },
  completedModules: ["nucleo"],
  affinities: { romance: { count: 0, top: [] }, amistad: { count: 0, top: [] } },
};

describe("parseProfile egg guard", () => {
  it("returns null for an egg identity even with valid typology", () => {
    const payload = { ...VALID_PAYLOAD, identity: EGG_IDENTITY };
    expect(parseProfile(payload)).toBeNull();
  });

  it("returns null for an egg with MBTI and enneagram populated (contradictory state)", () => {
    const payload = {
      ...VALID_PAYLOAD,
      identity: { ...EGG_IDENTITY, mbtiCode: "INFP", enneagramCode: "4w5" },
    };
    expect(parseProfile(payload)).toBeNull();
  });

  it("returns null when identity is missing entirely", () => {
    const { identity: _, ...rest } = VALID_PAYLOAD;
    expect(parseProfile(rest)).toBeNull();
  });

  it("parses a valid hatched profile", () => {
    const result = parseProfile(VALID_PAYLOAD);
    expect(result).not.toBeNull();
    expect(result!.identity.estadoIdentidad).toBe("eclosionado");
    expect(result!.mbti.code).toBe("INFP");
    expect(result!.virtues).toHaveLength(1);
  });

  it("returns null for non-object input", () => {
    expect(parseProfile(null)).toBeNull();
    expect(parseProfile("string")).toBeNull();
    expect(parseProfile(42)).toBeNull();
  });

  it("drops egg counterparts from affinity lists", () => {
    const payload = {
      ...VALID_PAYLOAD,
      affinities: {
        romance: { count: 1, top: [{ identity: EGG_IDENTITY, percent: 80 }] },
        amistad: { count: 0, top: [] },
      },
    };
    const result = parseProfile(payload);
    expect(result).not.toBeNull();
    expect(result!.affinities.romance.top).toHaveLength(0);
  });
});