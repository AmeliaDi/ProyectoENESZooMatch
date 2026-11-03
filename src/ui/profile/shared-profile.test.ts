import { describe, expect, it } from "vitest";

import type { ScaleReadingDto } from "@/contracts/profile";
import { SELF_READING } from "@/config/self-reading";
import { readSections } from "@/domain/psychometrics/self-reading";
import { readSharedSections } from "@/domain/psychometrics/shared-reading";
import { EMPTY_SHARED, parseLayers, parseShared } from "@/ui/result/parse-shared";
import { SHARE_LAYER_IDS } from "@/types/sharing";

import { HEX_GRID, hexStars } from "./hexaco-geometry";

const PRIOR = { theta: {}, se: {}, quality: 1, answered: 0 };

function scale(key: string, position: number, range: [number, number]): ScaleReadingDto {
  return { key, label: key, low: "a", high: "b", position, range, confidence: "clara", leaning: "medio" };
}

describe("HEXACO constellation geometry", () => {
  it("places six stars on whole cells inside the grid, without NaN", () => {
    const stars = hexStars(["h", "e", "x", "a", "c", "o"].map((k, i) => scale(k, i / 5, [0, 1])));
    expect(stars).toHaveLength(6);
    for (const s of stars) {
      for (const p of [s.vertex, s.star, s.bandFrom, s.bandTo]) {
        expect(Number.isInteger(p.x) && Number.isInteger(p.y)).toBe(true);
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(HEX_GRID);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(HEX_GRID);
      }
    }
  });

  it("survives missing modules and garbage positions", () => {
    const [own] = readSections(PRIOR);
    const stars = hexStars([...(own?.scales ?? []), scale("bad", Number.NaN, [Number.NaN, Infinity])].map((s) => ({ ...s, range: [s.range[0], s.range[1]] })));
    expect(stars.every((s) => [s.star.x, s.star.y, s.bandTo.x].every(Number.isFinite))).toBe(true);
    expect(stars.slice(0, 6).every((s) => s.open)).toBe(true);
  });
});

describe("shared readings (ADR-030)", () => {
  it("shares nothing unless a layer is chosen", () => {
    expect(readSharedSections(PRIOR, new Set())).toEqual([]);
  });

  it("never includes never-share scales, even with every layer on", () => {
    const keys = readSharedSections(PRIOR, new Set(SHARE_LAYER_IDS)).flatMap((s) => s.scales.map((x) => x.key));
    expect(keys.length).toBeGreaterThan(0);
    for (const hidden of SELF_READING.sharing.neverShare) expect(keys).not.toContain(hidden);
  });

  it("parses fail-closed and copies only band fields", () => {
    expect(parseShared(null)).toEqual(EMPTY_SHARED);
    const parsed = parseShared({
      sections: [{ id: "hexaco", title: "Núcleo", scales: [{ key: "hex_h", label: "H", low: "a", high: "b", leaning: "alto", confidence: "clara", position: 0.91 }, { key: "x" }] }],
      mbti: { code: "INFP", extra: 1 },
      enneagram: { code: 4 },
    });
    expect(parsed.sections[0]?.scales).toEqual([{ key: "hex_h", label: "H", low: "a", high: "b", leaning: "alto", confidence: "clara" }]);
    expect(parsed.mbti).toEqual({ code: "INFP" });
    expect(parsed.enneagram).toBeNull();
    expect(parseLayers([{ category: "valores", label: "V", band: "alta", strength: 3, points: 41 }, { category: "x", band: "rara" }])).toEqual([
      { category: "valores", label: "V", band: "alta", strength: 3 },
    ]);
  });
});
