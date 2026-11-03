import { describe, expect, it } from "vitest";

import { EXPLANATION_COPY } from "@/config/explanation-copy";
import type { PairScore } from "@/domain/matching/pair-score";

import { affinityBand, layerAffinityBands } from "./layer-bands";

function score(parts: Array<[PairScore["categories"][number]["id"], number, number]>): PairScore {
  return {
    total: 0.6,
    core: 0.6,
    floorFactor: 1,
    categories: parts.map(([id, similarity, contribution]) => ({ id, role: "core", similarity, weight: 0.2, contribution })),
  };
}

describe("layer affinity bands", () => {
  it("uses the explanation cut points and survives NaN", () => {
    const { alta, media } = EXPLANATION_COPY.bands;
    expect(affinityBand(alta)).toBe("alta");
    expect(affinityBand(media)).toBe("media");
    expect(affinityBand(media - 0.01)).toBe("baja");
    expect(affinityBand(Number.NaN)).toBe("baja");
  });

  it("ranks by real contribution, scales strength to the largest and drops MBTI/Enneagram", () => {
    const bands = layerAffinityBands(
      score([
        ["valores", 0.7, 0.2],
        ["personalidad", 0.5, 0.3],
        ["estilo", 0.3, 0.02],
        ["mbti", 0.9, 0.01],
        ["eneagrama", 0.9, 0.01],
      ]),
    );
    expect(bands.map((b) => b.category)).toEqual(["personalidad", "valores", "estilo"]);
    expect(bands.map((b) => b.strength)).toEqual([3, 2, 1]);
    expect(bands.map((b) => b.band)).toEqual(["media", "alta", "baja"]);
  });

  it("is safe with zero contributions", () => {
    expect(layerAffinityBands(score([["valores", 0.1, 0]])).map((b) => b.strength)).toEqual([1]);
  });
});
