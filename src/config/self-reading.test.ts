import { describe, expect, it } from "vitest";

import raw from "../../data/self-reading.json";
import { selfReadingSchema } from "./self-reading";

type Raw = { sections: Array<{ scales: unknown[] }> };

describe("self-reading schema", () => {
  it("accepts the shipped config", () => {
    expect(selfReadingSchema.safeParse(raw).success).toBe(true);
  });

  it("rejects a duplicated factor", () => {
    const copy = structuredClone(raw) as Raw;
    const first = copy.sections[0];
    if (!first) throw new Error("no sections");
    first.scales.push(structuredClone(first.scales[0]));
    expect(selfReadingSchema.safeParse(copy).success).toBe(false);
  });

  it("rejects bands that do not straddle the median", () => {
    const copy = structuredClone(raw);
    copy.uncertainty.lowBand.valor = 0.6;
    expect(selfReadingSchema.safeParse(copy).success).toBe(false);
  });
});
