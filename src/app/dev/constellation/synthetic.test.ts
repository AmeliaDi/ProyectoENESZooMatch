import { describe, expect, it } from "vitest";

import { getAllAnimalIds, getAllColorIds } from "@/lib/pixel-sprites";

import { DEV_SELF, generateSyntheticMatches } from "./synthetic";

describe("generateSyntheticMatches", () => {
  it("never repeats an animal or an animal/colour pair", () => {
    for (const seed of [1, 2, 3, 7, 11, 42]) {
      const matches = generateSyntheticMatches({
        count: 50,
        threshold: 0.8,
        seed,
        excludeAnimalId: DEV_SELF.animalId,
      });

      expect(matches).toHaveLength(50);
      expect(new Set(matches.map((match) => match.animalId)).size).toBe(50);
      expect(new Set(matches.map((match) => `${match.animalId}/${match.colorId}`)).size).toBe(
        50,
      );
      expect(matches.some((match) => match.animalId === DEV_SELF.animalId)).toBe(false);
    }
  });

  it("is deterministic for the same seed and changes with another seed", () => {
    const first = generateSyntheticMatches({
      count: 24,
      threshold: 0.8,
      seed: 5,
      excludeAnimalId: DEV_SELF.animalId,
    });
    const second = generateSyntheticMatches({
      count: 24,
      threshold: 0.8,
      seed: 5,
      excludeAnimalId: DEV_SELF.animalId,
    });
    const rerolled = generateSyntheticMatches({
      count: 24,
      threshold: 0.8,
      seed: 6,
      excludeAnimalId: DEV_SELF.animalId,
    });

    expect(second).toEqual(first);
    expect(rerolled).not.toEqual(first);
  });

  it("alternates tracks and stays inside the catalogue", () => {
    const animalIds = new Set(getAllAnimalIds());
    const colorIds = new Set(getAllColorIds());
    const matches = generateSyntheticMatches({
      count: 24,
      threshold: 0.8,
      seed: 9,
      excludeAnimalId: DEV_SELF.animalId,
    });

    matches.forEach((match, index) => {
      expect(match.track).toBe(index % 2 === 0 ? "romance" : "amistad");
      expect(animalIds.has(match.animalId)).toBe(true);
      expect(colorIds.has(match.colorId)).toBe(true);
      expect(match.similarity).toBeGreaterThanOrEqual(0);
      expect(match.similarity).toBeLessThanOrEqual(1);
      expect(match.explanation).not.toBeNull();
      expect(match.explanation?.psychometrics?.match.enneagram.code).toMatch(
        /^[1-9]w[1-9]$/,
      );
      expect(
        match.explanation?.psychometrics?.compatibility.overall,
      ).toBeGreaterThanOrEqual(0);
      expect(
        match.explanation?.psychometrics?.compatibility.overall,
      ).toBeLessThanOrEqual(1);
    });
  });
});
