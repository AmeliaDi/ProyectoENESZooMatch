import { describe, expect, it } from "vitest";

import { AVATAR_CONFIG } from "@/config";

import { NAME_MAX_WIDTH_PX, clipName } from "./clip-label";

const MAX_ALIAS_LENGTH = AVATAR_CONFIG.identity.max_alias_length.valor;

const ALIAS = "tortuguita gris neblina · DRRS";
const VERY_LONG = "osito de anteojos verde bosque amanecida con lunares · VTSDQBKL";

describe("clipName", () => {
  it("leaves a name that already fits untouched", () => {
    expect(clipName(ALIAS, 15)).toBe(ALIAS);
    expect(clipName(ALIAS, 15, NAME_MAX_WIDTH_PX)).toBe(ALIAS);
  });

  it("clips at a word boundary and marks the cut with one ellipsis", () => {
    expect(clipName(ALIAS, 28)).toBe("tortuguita gris…");
    expect(clipName(ALIAS, 18)).toBe("tortuguita gris neblina ·…");
  });

  it("hard-cuts a single word that is longer than the budget", () => {
    expect(clipName("supercalifragilisticoespidosamente", 10, 110)).toBe("supercalifragili…");
  });

  it("never exceeds the character budget the layout can paint", () => {
    const budgets: Record<number, number> = { 10: 51, 15: 34, 18: 28, 28: 18 };
    for (const [fontSize, budget] of Object.entries(budgets)) {
      const clipped = clipName(VERY_LONG, Number(fontSize));
      expect(clipped.length, `${fontSize}px`).toBeLessThanOrEqual(budget);
      expect(clipped.endsWith("…")).toBe(true);
    }
  });

  it("keeps the tight star-tag budget far shorter than the HTML one", () => {
    const tag = clipName(VERY_LONG, 10, 110);
    expect(tag).toBe("osito de…");
    expect(tag.length).toBeLessThan(clipName(VERY_LONG, 10).length);
  });

  it("returns an empty string for empty or whitespace-only names", () => {
    expect(clipName("", 28)).toBe("");
    expect(clipName("   ", 28)).toBe("");
  });

  it("trims without adding an ellipsis to a name that fits once trimmed", () => {
    expect(clipName(`  ${ALIAS}  `, 15)).toBe(ALIAS);
  });

  it("still shows something when the budget is tiny", () => {
    expect(clipName(ALIAS, 40, 12)).toBe("tor…");
  });
});

/**
 * The narrowest layout the app promises is 320 px (docs/PANTALLAS.md). The
 * card paints its title with `clamp(1.25rem, 4.5vw, 1.75rem)`, so 28 px is
 * the ceiling of its glyph size and the title gets two lines of the shared
 * budget — which is what keeps the `· Sufijo` that tells two people apart.
 */
describe("tu carta a 320 px", () => {
  const CARD_FONT_PX = 28;
  const TWO_LINES_PX = NAME_MAX_WIDTH_PX * 2;
  const paint = (value: string) => clipName(value, CARD_FONT_PX, TWO_LINES_PX);

  it("keeps a canonical alias whole, suffix included", () => {
    expect(paint(ALIAS)).toBe(ALIAS);
    expect(paint("libélula verde menta · DRRS")).toBe("libélula verde menta · DRRS");
  });

  it("paints at most twice the one-line budget", () => {
    // 18 characters fit one 320 px line at 28 px; two lines therefore fit 36.
    expect(clipName(VERY_LONG, CARD_FONT_PX).length).toBe(18);
    expect(paint(VERY_LONG).length).toBeLessThanOrEqual(36);
  });

  it("never exceeds the longest alias the base can store", () => {
    const longest = `${"a".repeat(MAX_ALIAS_LENGTH - 7)} · VTSD`;
    expect(longest).toHaveLength(MAX_ALIAS_LENGTH);
    expect(paint(longest).length).toBeLessThanOrEqual(36);
    expect(paint(longest).endsWith("…")).toBe(true);
  });
});
