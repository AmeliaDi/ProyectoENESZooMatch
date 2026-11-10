import { describe, expect, it } from "vitest";

import type { ProfileDto, ScaleReadingDto } from "@/contracts/profile";
import type { IdentityDto } from "@/contracts/identity";

import { parseProfile } from "./parse-profile";
import { cellOf, leaningText, TRACK_CELLS } from "./scale-row";

const SCALE: ScaleReadingDto = {
  key: "hex_h",
  label: "Honestidad-Humildad",
  low: "Reconocimiento",
  high: "Trato justo",
  position: 0.8,
  range: [0.6, 0.92],
  confidence: "clara",
  leaning: "alto",
};

const OWNER_IDENTITY: IdentityDto = {
  estadoIdentidad: "eclosionado",
  aliasCompleto: "zorrito naranja mandarina · DRRS",
  aliasAnimal: "zorrito",
  aliasColor: "naranja mandarina",
  aliasSufijo: "DRRS",
  animalId: "zorrito",
  colorId: "ennea-7",
  colorHex: "#C05722",
  mbtiCode: "INFP",
  enneagramCode: "7w6",
  enneagramName: "El entusiasta",
  mark: "sx",
  revelacionVista: true,
  huevitoSeed: null,
};

/** A counterpart who shares nothing beyond their own frozen identity. */
const PEER_IDENTITY: IdentityDto = {
  estadoIdentidad: "eclosionado",
  aliasCompleto: "pulpito violeta amatista · KMPQ",
  aliasAnimal: "pulpito",
  aliasColor: "violeta amatista",
  aliasSufijo: "KMPQ",
  animalId: "pulpito",
  colorId: "ennea-4",
  colorHex: "#9D56C7",
  mbtiCode: "ENFP",
  enneagramCode: "4",
  enneagramName: "El individualista",
  mark: null,
  revelacionVista: false,
  huevitoSeed: null,
};

const PROFILE: ProfileDto = {
  identity: OWNER_IDENTITY,
  narrative: "Una narrativa",
  measurement: { stamped: true, current: true, seal: "psychometric-params-1+2.2.0+000000000000" },
  mbti: { code: "INFP", balancedAxes: 1 },
  enneagram: { code: "7w6", name: "Entusiasta", archetype: "Explorador", exploring: false },
  virtues: [{ title: "Trato justo", text: "Te importa la transparencia." }],
  sections: [{ id: "hexaco", title: "HEXACO", blurb: "Tu núcleo.", scales: [SCALE] }],
  openScales: { open: 0, total: 1 },
  completedModules: [],
  affinities: {
    romance: { count: 0, top: [] },
    amistad: { count: 1, top: [{ identity: PEER_IDENTITY, percent: 87 }] },
  },
  unlockedBadges: ["primer_match"],
};

describe("parseProfile", () => {
  it("round-trips a valid payload", () => {
    expect(parseProfile(JSON.parse(JSON.stringify(PROFILE)))).toEqual(PROFILE);
  });

  it("rejects garbage and drops malformed scales", () => {
    expect(parseProfile(null)).toBeNull();
    expect(parseProfile({ alias: 3 })).toBeNull();
    const bad = { ...PROFILE, sections: [{ ...PROFILE.sections[0], scales: [SCALE, { ...SCALE, position: "x" }] }] };
    expect(parseProfile(bad)?.sections[0]?.scales).toHaveLength(1);
  });

  it("clamps positions and orders the range", () => {
    const wild = { ...PROFILE, sections: [{ ...PROFILE.sections[0], scales: [{ ...SCALE, position: 7, range: [0.9, -1] }] }] };
    expect(parseProfile(wild)?.sections[0]?.scales[0]).toMatchObject({ position: 1, range: [0, 0.9] });
  });

  it("carries the badge grid as ids only", () => {
    const raw = { ...PROFILE, unlockedBadges: ["primer_match", { id: "chat_libre", nombre: "impuesto" }, 7] };
    expect(parseProfile(raw)?.unlockedBadges).toEqual(["primer_match"]);
  });

  it("says nothing about logros when the field is missing or not a list", () => {
    const { unlockedBadges, ...without } = PROFILE;
    expect(unlockedBadges).toBeDefined();
    expect(parseProfile(without)?.unlockedBadges).toBeNull();
    expect(parseProfile({ ...PROFILE, unlockedBadges: "todos" })?.unlockedBadges).toBeNull();
    // A failed read is null too: the grid hides itself instead of showing "cero".
    expect(parseProfile({ ...PROFILE, unlockedBadges: null })?.unlockedBadges).toBeNull();
  });
});

describe("scale row helpers", () => {
  it("maps positions to cells inside the track", () => {
    expect(cellOf(0)).toBe(0);
    expect(cellOf(1)).toBe(TRACK_CELLS - 1);
    expect(cellOf(0.5)).toBe(TRACK_CELLS / 2);
  });

  it("says the leaning in words, not only colour", () => {
    expect(leaningText(SCALE)).toContain(SCALE.high);
    expect(leaningText({ ...SCALE, leaning: "bajo" })).toContain(SCALE.low);
    expect(leaningText({ ...SCALE, leaning: "medio" })).toMatch(/equilibrio/);
    expect(leaningText({ ...SCALE, confidence: "abierta" })).toMatch(/afinarlo/);
  });
});
