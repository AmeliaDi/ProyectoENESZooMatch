import { describe, expect, it } from "vitest";

import { COUNTER_CONFIRM_WORD, COUNTER_COPY, correctionValue } from "./admin-copy";
import { perHundred } from "./metrics-export";

// The panel offers an exact correction only when both halves of it are
// usable, and the base caps the column at 100 000: the copy must not promise
// a button the stored function would refuse.
describe("manual counter guards", () => {
  it("reads a whole number the base will keep", () => {
    expect(correctionValue("0")).toBe(0);
    expect(correctionValue(" 7 ")).toBe(7);
    expect(correctionValue("100000")).toBe(100_000);
  });

  it("refuses anything the stored column would round, reject or clamp away", () => {
    expect(correctionValue("")).toBeNull();
    expect(correctionValue("  ")).toBeNull();
    expect(correctionValue("-1")).toBeNull();
    expect(correctionValue("2.5")).toBeNull();
    expect(correctionValue("1e3")).toBeNull();
    expect(correctionValue("siete")).toBeNull();
    expect(correctionValue("100001")).toBeNull();
    expect(correctionValue("99999999999999999999")).toBeNull();
  });

  it("names every tally the contract knows, with a word and a body", () => {
    for (const key of Object.keys(COUNTER_COPY)) {
      const copy = COUNTER_COPY[key as keyof typeof COUNTER_COPY];
      expect(copy.label.length).toBeGreaterThan(0);
      expect(copy.body.endsWith(".")).toBe(true);
    }
    expect(COUNTER_CONFIRM_WORD).toBe("CORREGIR");
  });

  it("states a density per hundred accounts, and says nothing when there is no base", () => {
    expect(perHundred(3, 100)).toBe(3);
    expect(perHundred(1, 3)).toBeCloseTo(33.3333, 3);
    expect(perHundred(0, 100)).toBe(0);
    // An empty sky has no density; that is not the same as a density of zero.
    expect(perHundred(4, 0)).toBeNull();
    expect(perHundred(4, -1)).toBeNull();
  });
});
