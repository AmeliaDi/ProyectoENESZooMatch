import { describe, expect, it } from "vitest";

import { getBigFiveWeights, SCORING_CALIBRATION } from "@/lib/scoring/calibration";
import { rankBestMatches } from "@/lib/scoring/rank";
import type { BigFive, ScoringProfile } from "@/lib/scoring/types";

function mulberry32(seed: number): () => number {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(random: () => number): number {
  const first = Math.max(Number.MIN_VALUE, random());
  const second = random();
  return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second);
}

function pairSeed(left: string, right: string): number {
  const key = [left, right].sort().join("|");
  let hash = 2166136261;
  for (const character of key) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function clippedNormal(random: () => number): number {
  return Math.min(100, Math.max(0, 50 + 15 * gaussian(random)));
}

function randomMbti(random: () => number): string {
  const axes = ["EI", "SN", "TF", "JP"];
  return axes.map((axis) => axis[Math.floor(random() * 2)]).join("");
}

function makeSyntheticProfiles(): ScoringProfile[] {
  const random = mulberry32(20261026);
  return Array.from({ length: 400 }, (_, index) => {
    const bigFive: BigFive = {
      O: clippedNormal(random),
      C: clippedNormal(random),
      E: clippedNormal(random),
      A: clippedNormal(random),
      N: clippedNormal(random),
    };
    return {
      userId: `synthetic-${String(index).padStart(3, "0")}`,
      bigFive,
      mbti: randomMbti(random),
      sociocultural: {
        orientacion: ["todxs"],
        identidadGenero: ["hombre"],
        tipoRelacion: ["sin_definir"],
        ordinal: {
          valores_gestion_conflicto: random(),
          valores_empatia: random(),
        },
      },
    };
  });
}

function similarity(a: BigFive, b: BigFive): number {
  const distance = Math.sqrt(
    (a.O - b.O) ** 2 +
      (a.C - b.C) ** 2 +
      (a.E - b.E) ** 2 +
      (a.A - b.A) ** 2 +
      (a.N - b.N) ** 2,
  );
  return 1 - distance / (100 * Math.sqrt(5));
}

function satisfaction(a: ScoringProfile, b: ScoringProfile): number {
  const left = a.bigFive!;
  const right = b.bigFive!;
  const z = (value: number) => (value - 50) / 15;
  const noise = gaussian(mulberry32(pairSeed(a.userId, b.userId))) * 0.5;
  return (
    -0.25 * z(left.N) -
    0.25 * z(right.N) +
    0.12 * (z(left.A) + z(right.A)) +
    0.1 * (z(left.C) + z(right.C)) +
    0.05 * similarity(left, right) +
    noise
  );
}

function ndcgAt3(ranked: string[], relevance: Map<string, number>): number {
  const ideal = [...relevance.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => id);
  const dcg = (ids: string[]) =>
    ids.slice(0, 3).reduce((sum, id, index) => {
      const gain = 2 ** (relevance.get(id) ?? 0) - 1;
      return sum + gain / Math.log2(index + 2);
    }, 0);
  const idealDcg = dcg(ideal);
  return idealDcg === 0 ? 0 : dcg(ranked) / idealDcg;
}

function evaluate(profiles: ScoringProfile[]) {
  const weights = {
    baseline: getBigFiveWeights("baseline"),
    calibrated: getBigFiveWeights("literature-2026-10"),
  };
  const totals = { baseline: 0, calibrated: 0, overlap: 0 };
  for (const target of profiles.slice(0, 50)) {
    const candidates = profiles.filter((candidate) => candidate.userId !== target.userId);
    const rawRelevance = new Map(
      candidates.map((candidate) => [
        candidate.userId,
        satisfaction(target, candidate),
      ]),
    );
    const values = [...rawRelevance.values()];
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const relevance = new Map(
      [...rawRelevance].map(([id, value]) => [
        id,
        maximum === minimum ? 0 : (value - minimum) / (maximum - minimum),
      ]),
    );
    const baseline = rankBestMatches(target, candidates, 3, weights.baseline);
    const calibrated = rankBestMatches(target, candidates, 3, weights.calibrated);
    if (baseline.status !== "ok" || calibrated.status !== "ok") {
      throw new Error("Synthetic profiles should always produce ranked candidates.");
    }
    const baselineIds = baseline.matches.map(({ userId }) => userId);
    const calibratedIds = calibrated.matches.map(({ userId }) => userId);
    totals.baseline += ndcgAt3(baselineIds, relevance);
    totals.calibrated += ndcgAt3(calibratedIds, relevance);
    totals.overlap += baselineIds.filter((id) => calibratedIds.includes(id)).length / 3;
  }
  return {
    baseline: totals.baseline / 50,
    calibrated: totals.calibrated / 50,
    top3Overlap: totals.overlap / 50,
  };
}

describe("Big Five calibration", () => {
  it("validates both weight profiles and their active selection", () => {
    expect(SCORING_CALIBRATION.active).toBe("literature-2026-10");
    expect(getBigFiveWeights("baseline")).toEqual({
      similarity: 0.5,
      lowNeuroticism: 0.3,
      conscientiousAgreeable: 0.2,
    });
    expect(getBigFiveWeights("literature-2026-10")).toEqual({
      similarity: 0.4,
      lowNeuroticism: 0.35,
      conscientiousAgreeable: 0.25,
    });
  });

  it("is deterministic and does not degrade synthetic NDCG@3 by more than 0.01", () => {
    const profiles = makeSyntheticProfiles();
    const first = evaluate(profiles);
    const second = evaluate(profiles);
    expect(first).toEqual(second);
    expect(first.baseline).toBeGreaterThanOrEqual(0);
    expect(first.calibrated).toBeGreaterThanOrEqual(first.baseline - 0.01);
    console.log(
      `Synthetic NDCG@3 baseline=${first.baseline.toFixed(6)} ` +
        `calibrated=${first.calibrated.toFixed(6)} top3-overlap=${first.top3Overlap.toFixed(6)}`,
    );
  });
});
