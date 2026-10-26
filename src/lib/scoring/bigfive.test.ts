import { describe, expect, it } from "vitest";

import { scoreBigFive } from "@/lib/scoring/bigfive";
import type { BigFive } from "@/lib/scoring/types";

const sameProfile: BigFive = { O: 50, C: 50, E: 50, A: 50, N: 50 };

describe("scoreBigFive", () => {
  it("scores identical profiles and breaks closest-trait ties by O,C,E,A,N", () => {
    const result = scoreBigFive(sameProfile, sameProfile);

    expect(result.similarity).toBe(1);
    expect(result.score).toBe(0.75);
    expect(result.closestTraits).toEqual(["O", "C"]);
    expect(result.stabilityBonus).toBe(false);
    expect(result.stabilityPenalty).toBe(false);
  });

  it("applies the high-neuroticism penalty as a 0.6 multiplier", () => {
    const highNeuroticism = { ...sameProfile, N: 70 };
    const result = scoreBigFive(highNeuroticism, highNeuroticism);
    const unadjusted =
      0.5 * result.similarity +
      0.3 * (1 - (highNeuroticism.N + highNeuroticism.N) / 200) +
      0.2 * (highNeuroticism.C + highNeuroticism.C + highNeuroticism.A + highNeuroticism.A) / 400;

    expect(result.stabilityPenalty).toBe(true);
    expect(result.score).toBe(unadjusted * 0.6);
  });

  it("adds the low-neuroticism bonus and caps the result at one", () => {
    const lowNeuroticism = { ...sameProfile, N: 30 };
    const uncapped = scoreBigFive(lowNeuroticism, lowNeuroticism);
    const maximumProfile = { O: 100, C: 100, E: 100, A: 100, N: 30 };
    const capped = scoreBigFive(maximumProfile, maximumProfile);

    expect(uncapped.stabilityBonus).toBe(true);
    expect(uncapped.score).toBe(0.96);
    expect(capped.stabilityBonus).toBe(true);
    expect(capped.score).toBe(1);
  });

  it("does not apply either stability adjustment at the exact boundaries", () => {
    const highBoundary = { ...sameProfile, N: 60 };
    const lowBoundary = { ...sameProfile, N: 40 };

    expect(scoreBigFive(highBoundary, highBoundary).stabilityPenalty).toBe(false);
    expect(scoreBigFive(highBoundary, highBoundary).stabilityBonus).toBe(false);
    expect(scoreBigFive(lowBoundary, lowBoundary).stabilityPenalty).toBe(false);
    expect(scoreBigFive(lowBoundary, lowBoundary).stabilityBonus).toBe(false);
  });
});
