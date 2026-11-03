import { describe, expect, it } from "vitest";

import { CATALOG_ANIMALS, CATALOG_COLORS, EXPERIENCE } from "@/config";

import { LOST_COPY, easterEggAwake } from "./lost-view";

const FORBIDDEN = /perfect[oa]|destino|garantizad[oa]|alma[s]? gemela|100 ?% compatible|para siempre|media naranja/i;
const EMOJI = /\p{Extended_Pictographic}/u;

describe("lost view", () => {
  it("draws a real animal and colour from the catalog", () => {
    expect(CATALOG_ANIMALS.map((a) => a.id)).toContain(EXPERIENCE.notFound.animalId);
    expect(CATALOG_COLORS.map((c) => c.id)).toContain(EXPERIENCE.notFound.colorId);
  });

  it("wakes the easter egg only at the configured tap count", () => {
    const n = EXPERIENCE.notFound.easterEggTaps;
    expect(easterEggAwake(n - 1)).toBe(false);
    expect(easterEggAwake(n)).toBe(true);
  });

  it("follows the copy guide", () => {
    for (const text of Object.values(LOST_COPY)) {
      expect(text, text).not.toMatch(FORBIDDEN);
      expect(text, text).not.toMatch(EMOJI);
    }
  });
});
