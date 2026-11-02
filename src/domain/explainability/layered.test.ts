import { describe, expect, it } from "vitest";

import { EXPERIENCE, MATCHING_CONFIG } from "@/config";
import { EXPLANATION_COPY } from "@/config/explanation-copy";
import { mulberry32 } from "@/domain/shared";
import { pairScore } from "@/domain/matching";
import type { LatentProfile } from "@/types/latent";
import type { MatchTrack } from "@/types/microtest";

import { computeChemistrySummary } from "./chemistry";
import { computeMatchConfidence, explainPair, pairUncertainty, type ExplainPairInput } from "./layered";

const FACTORS = [...new Set(Object.values(MATCHING_CONFIG.categories).flatMap((c) => Object.keys(c.factors)))].sort();
const TRACKS: readonly MatchTrack[] = ["romance", "amistad"];
const CFG = MATCHING_CONFIG.explainability;

function latent(seed: number, se = 0.6, shift: Record<string, number> = {}): LatentProfile {
  const rand = mulberry32(seed);
  const theta = Object.fromEntries(FACTORS.map((f) => [f, (rand() * 2 - 1) * 1.2 + (shift[f] ?? 0)]));
  return { theta, se: Object.fromEntries(FACTORS.map((f) => [f, se])), quality: 1, answered: 60 };
}

function input(a: LatentProfile, b: LatentProfile, track: MatchTrack): ExplainPairInput {
  const score = pairScore(a, b, MATCHING_CONFIG.tracks[track], MATCHING_CONFIG.categories);
  return {
    score,
    track,
    self: a,
    other: b,
    selfNarrative: { enneagramType: 4, mbti: "INFP" },
    otherNarrative: { enneagramType: 7, mbti: "ENFP" },
  };
}

describe("explainPair", () => {
  it("shows exactly the model's contributions; all points sum to the affinity", () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      for (const track of TRACKS) {
        const args = input(latent(seed), latent(seed + 1000), track);
        const ex = explainPair(args);
        const byId = new Map(args.score.categories.map((c) => [c.id, c]));
        for (const c of ex.connects) expect(c.points).toBeCloseTo(byId.get(c.category)!.contribution * 100, 1);
        const allPoints = args.score.categories.reduce((s, c) => s + c.contribution, 0) * 100;
        expect(allPoints).toBeCloseTo(args.score.total * 100, 6);
        expect(ex.chemistry.percentage).toBe(Math.round(args.score.total * 100));
        const visible = ex.connects.reduce((s, c) => s + c.points, 0) + ex.otherPoints + ex.talk.points;
        expect(Math.abs(visible - args.score.total * 100)).toBeLessThanOrEqual(0.05 * (ex.connects.length + 2));
      }
    }
  });

  it("ranks 'lo que más conecta' by real contribution and keeps MBTI/Eneagrama out of it", () => {
    const ex = explainPair(input(latent(3), latent(4), "romance"));
    const points = ex.connects.map((c) => c.points);
    expect(points).toEqual([...points].sort((a, b) => b - a));
    expect(ex.connects.map((c) => c.category)).not.toEqual(expect.arrayContaining(["mbti"]));
    expect(ex.connects.map((c) => c.category)).not.toEqual(expect.arrayContaining(["eneagrama"]));
    expect(ex.connects.length).toBeLessThanOrEqual(EXPERIENCE.result.detailBreakdownMax);
  });

  it("reports the identity layer's true, tiny weight as narrative", () => {
    const args = input(latent(5), latent(6), "amistad");
    const ex = explainPair(args);
    const identity = args.score.categories.filter((c) => c.id === "mbti" || c.id === "eneagrama");
    expect(ex.talk.points).toBeCloseTo(identity.reduce((s, c) => s + c.contribution, 0) * 100, 1);
    expect(ex.talk.points).toBeLessThanOrEqual(MATCHING_CONFIG.tail_groups.identity_max_total * 100);
    expect(ex.talk.intro).toContain(String(ex.talk.points));
    expect(ex.talk.lines.some((l) => l.includes(EXPLANATION_COPY.talk.motives["4"]!))).toBe(true);
  });

  it("is deterministic and symmetric in its numbers", () => {
    const a = latent(7);
    const b = latent(8);
    expect(explainPair(input(a, b, "romance"))).toEqual(explainPair(input(a, b, "romance")));
    const ab = explainPair(input(a, b, "romance"));
    const ba = explainPair(input(b, a, "romance"));
    expect(ba.connects.map((c) => [c.category, c.points])).toEqual(ab.connects.map((c) => [c.category, c.points]));
    expect(ba.confidence).toEqual(ab.confidence);
  });

  it("names the weakest core area as the tension", () => {
    const args = input(latent(9), latent(10), "romance");
    const core = args.score.categories.filter((c) => c.role === "core");
    const min = core.reduce((m, c) => (c.similarity < m.similarity ? c : m));
    expect(explainPair(args).tension?.category).toBe(min.id);
  });

  it("only names Honestidad-Humildad when both sit at or above the mean (values wording)", () => {
    const low = latent(11, 0.5, {});
    const lowH = { ...low, theta: { ...low.theta, hex_h: -1.5 } };
    const twin = { ...lowH, theta: { ...lowH.theta } };
    const ex = explainPair(input(lowH, twin, "romance"));
    expect(ex.personalityNote).not.toBe(EXPLANATION_COPY.personality_factors.hex_h);
  });
});

describe("computeMatchConfidence", () => {
  const args = input(latent(12), latent(13), "romance");
  const at = (relative: number) => {
    const { minimum_similarity_exclusive: t, reference_high: h } = MATCHING_CONFIG.tracks.romance;
    return computeChemistrySummary(t + relative * (h - t) + 1e-9, "romance");
  };
  const allHigh = { ...args.score, categories: args.score.categories.map((c) => ({ ...c, similarity: 0.9 })) };

  it("is 'alta' only with margin, every core area over the floor and enough information", () => {
    expect(computeMatchConfidence(at(CFG.confidence_high_margin + 0.1), allHigh, CFG.confidence_max_uncertainty - 0.05).level).toBe("alta");
    expect(computeMatchConfidence(at(CFG.confidence_high_margin / 2), allHigh, 0.1).level).toBe("media");
    expect(computeMatchConfidence(at(CFG.confidence_high_margin + 0.1), allHigh, CFG.confidence_max_uncertainty + 0.05).level).toBe("media");
    const lowArea = { ...allHigh, categories: allHigh.categories.map((c, i) => (i === 0 ? { ...c, similarity: CFG.category_floor / 200 } : c)) };
    expect(computeMatchConfidence(at(0.9), lowArea, 0.1).level).toBe("media");
  });

  it("puts core-only pairs above the uncertainty ceiling (they cannot be 'alta')", () => {
    const coreOnlySe = 0.84; // √0.70: mean posterior variance of a core-only respondent
    expect(pairUncertainty(latent(1, coreOnlySe), latent(2, coreOnlySe), "romance")).toBeGreaterThan(CFG.confidence_max_uncertainty);
    expect(pairUncertainty(latent(1, 0.68), latent(2, 0.68), "romance")).toBeLessThan(CFG.confidence_max_uncertainty);
  });
});
