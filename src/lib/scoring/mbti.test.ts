import { describe, expect, it } from "vitest";

import { scoreMbti } from "@/lib/scoring/mbti";

describe("scoreMbti", () => {
  it("scores shared and complementary axes with the configured weights", () => {
    expect(scoreMbti("INTJ", "ESFP")).toEqual({
      score: 0.5,
      sharedAxes: [],
      complementaryAxes: ["E/I", "J/P"],
    });
    expect(scoreMbti("intj", "isfj")).toEqual({
      score: 0,
      sharedAxes: [],
      complementaryAxes: [],
    });
  });

  it("returns null for missing or invalid codes without throwing", () => {
    expect(scoreMbti(null, "INTJ")).toEqual({
      score: null,
      sharedAxes: [],
      complementaryAxes: [],
    });
    expect(scoreMbti("XXXX", "INTJ").score).toBeNull();
    expect(scoreMbti("", "INTJ").score).toBeNull();
  });
});
