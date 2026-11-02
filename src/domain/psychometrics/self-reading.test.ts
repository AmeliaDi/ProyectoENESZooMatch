import { describe, expect, it } from "vitest";


import { SELF_READING } from "@/config/self-reading";
import { PSYCHOMETRIC_PARAMS } from "@/config/psychometric-params";
import type { LatentProfile } from "@/types/latent";

import { openScaleCount, readingConfidence, readSections, readVirtues } from "./self-reading";

const FACTORS = SELF_READING.sections.flatMap((s) => s.scales.map((x) => x.factor));
const PRIOR: LatentProfile = { theta: {}, se: {}, quality: 1, answered: 0 };

function profile(theta: number, se: number): LatentProfile {
  return {
    theta: Object.fromEntries(FACTORS.map((f) => [f, theta])),
    se: Object.fromEntries(FACTORS.map((f) => [f, se])),
    quality: 1,
    answered: 170,
  };
}

const FORBIDDEN = /perfect[oa]|destino|garantizad[oa]|alma[s]? gemela|deshonest/i;

describe("self-reading config", () => {
  it("only names factors the measurement model estimates", () => {
    const known = new Set(PSYCHOMETRIC_PARAMS.factores);
    for (const factor of FACTORS) expect(known.has(factor), factor).toBe(true);
  });


  it("copy has no forbidden promises or labels", () => {
    const copy = SELF_READING.sections.flatMap((s) => [
      s.title,
      s.blurb,
      ...s.scales.flatMap((x) => [x.label, x.low, x.high, x.virtues?.low?.text ?? "", x.virtues?.high?.text ?? ""]),
    ]);
    for (const text of copy) expect(text, text).not.toMatch(FORBIDDEN);
  });
});

describe("readSections", () => {
  it("reads the prior as open, centred and with no virtues", () => {
    const sections = readSections(PRIOR);
    for (const scale of sections.flatMap((s) => s.scales)) {
      expect(scale).toMatchObject({ confidence: "abierta", leaning: "medio", position: 0.5 });
    }
    expect(readVirtues(PRIOR)).toEqual([]);
    expect(openScaleCount(sections)).toEqual({ open: FACTORS.length, total: FACTORS.length });
  });

  it("is deterministic, in range and never NaN, even with broken inputs", () => {
    const broken: LatentProfile = {
      theta: { [FACTORS[0] ?? "hex_h"]: Number.NaN, [FACTORS[1] ?? "hex_e"]: Number.POSITIVE_INFINITY },
      se: { [FACTORS[0] ?? "hex_h"]: Number.NaN, [FACTORS[1] ?? "hex_e"]: -3 },
      quality: 1,
      answered: 3,
    };
    for (const input of [broken, profile(1.2, 0.55), profile(-2, 0.7)]) {
      const sections = readSections(input);
      expect(readSections(input)).toEqual(sections);
      for (const s of sections.flatMap((x) => x.scales)) {
        for (const v of [s.position, ...s.range]) {
          expect(Number.isFinite(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
        expect(s.range[0]).toBeLessThanOrEqual(s.position);
        expect(s.position).toBeLessThanOrEqual(s.range[1]);
      }
    }
  });

  it("maps reliability to confidence monotonically", () => {
    expect(readingConfidence(0.5)).toBe("clara");
    expect(readingConfidence(0.85)).toBe("tentativa");
    expect(readingConfidence(1)).toBe("abierta");
  });
});

describe("readVirtues", () => {
  it("caps the list and requires a margin over the uncertainty", () => {
    expect(readVirtues(profile(1.5, 0.55)).length).toBeLessThanOrEqual(SELF_READING.virtuesMax);
    expect(readVirtues(profile(1.5, 0.55)).length).toBeGreaterThan(0);
    // Leaning past the band but |θ| ≤ margin·SE → no virtue.
    const margin = SELF_READING.uncertainty.virtueMargin;
    expect(readVirtues(profile(0.4, 0.4 / margin + 0.01))).toEqual([]);
  });
});

