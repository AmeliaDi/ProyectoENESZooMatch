import { describe, expect, it } from "vitest";

import type { ProfileDto, ScaleReadingDto } from "@/contracts/profile";

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

const PROFILE: ProfileDto = {
  alias: "zorrito ámbar",
  animal: { id: "zorrito", name: "zorrito" },
  color: { id: "ennea-7", name: "Naranja mandarina", hex: "#C05722" },
  mark: "sx",
  narrative: "Una narrativa",
  mbti: { code: "INFP", balancedAxes: 1 },
  enneagram: { code: "7w6", name: "Entusiasta", archetype: "Explorador", exploring: false },
  virtues: [{ title: "Trato justo", text: "Te importa la transparencia." }],
  sections: [{ id: "hexaco", title: "HEXACO", blurb: "Tu núcleo.", scales: [SCALE] }],
  openScales: { open: 0, total: 1 },
  completedModules: [],
  affinities: {
    romance: { count: 0, top: [] },
    amistad: { count: 1, top: [{ alias: "pulpito azul", animal: "pulpito", percent: 87 }] },
  },
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
