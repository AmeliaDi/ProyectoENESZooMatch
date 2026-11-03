import { describe, expect, it } from "vitest";

import {
  DIGIT_WIDTH,
  GLYPH_GAP,
  GLYPH_HEIGHT,
  PIXEL_GLYPHS,
  canDrawPixelText,
  layoutPixelText,
} from "./pixel-digits";

const DIGITS = "0123456789";

describe("pixel digit atlas (5×7)", () => {
  it("draws every digit on a 5×7 grid with only lit / empty cells", () => {
    for (const digit of DIGITS) {
      const glyph = PIXEL_GLYPHS[digit];
      expect(glyph, digit).toHaveLength(GLYPH_HEIGHT);
      for (const row of glyph ?? []) expect(row, digit).toMatch(new RegExp(`^[#.]{${DIGIT_WIDTH}}$`));
    }
  });

  it("keeps every symbol at glyph height and a single width per glyph", () => {
    for (const [char, glyph] of Object.entries(PIXEL_GLYPHS)) {
      expect(glyph, char).toHaveLength(GLYPH_HEIGHT);
      const width = glyph[0]?.length ?? 0;
      for (const row of glyph) expect(row.length, char).toBe(width);
    }
  });

  it("gives every digit its own drawing and never confuses 0 with O", () => {
    const drawings = [...DIGITS].map((d) => (PIXEL_GLYPHS[d] ?? []).join("|"));
    expect(new Set(drawings).size).toBe(DIGITS.length);
    // The zero is slashed: an inner diagonal cell is lit.
    expect(PIXEL_GLYPHS["0"]?.[3]?.[2]).toBe("#");
  });

  it("is tabular: any two numbers with the same digit count have the same width", () => {
    expect(layoutPixelText("11").width).toBe(layoutPixelText("88").width);
    expect(layoutPixelText("100 %").width).toBe(layoutPixelText("987 %").width);
    expect(layoutPixelText("7").width).toBe(DIGIT_WIDTH);
    expect(layoutPixelText("12").width).toBe(DIGIT_WIDTH * 2 + GLYPH_GAP);
  });

  it("merges rows into runs that cover exactly the lit cells", () => {
    const text = "87 %";
    const layout = layoutPixelText(text);
    const lit = [...text].reduce((sum, char) => sum + (PIXEL_GLYPHS[char] ?? []).join("").split("#").length - 1, 0);
    expect(layout.runs.reduce((sum, run) => sum + run.width, 0)).toBe(lit);
    for (const run of layout.runs) {
      expect(run.x + run.width).toBeLessThanOrEqual(layout.width);
      expect(run.y).toBeLessThan(GLYPH_HEIGHT);
    }
  });

  it("refuses characters it cannot draw instead of dropping them", () => {
    expect(canDrawPixelText("1,234 · 3/5")).toBe(false);
    expect(canDrawPixelText("12:45 +3 −2 ×2")).toBe(true);
    expect(() => layoutPixelText("A1")).toThrow();
  });
});
