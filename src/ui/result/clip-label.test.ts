import { describe, expect, it } from "vitest";

import { NAME_MAX_WIDTH_PX, clipName } from "./clip-label";

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
