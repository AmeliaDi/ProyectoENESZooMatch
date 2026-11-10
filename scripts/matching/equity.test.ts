import { describe, expect, it } from "vitest";

import { equityFloor, exposureOf } from "./track-analysis";

describe("exposureOf", () => {
  it("reports a flat distribution as perfectly equal", () => {
    const e = exposureOf([2, 2, 2, 2]);
    expect(e.gini).toBe(0);
    expect(e.maxShare).toBeCloseTo(0.25, 12);
    expect(e.zeroMatches).toBe(0);
    expect(e.meanMatches).toBe(2);
  });

  it("counts both endpoints of every published pair", () => {
    const byPerson = [2, 1, 1, 0];
    const e = exposureOf(byPerson);
    expect(e.meanMatches * byPerson.length).toBe(4);
    expect(e.maxShare).toBeCloseTo(0.5, 12);
    expect(e.zeroMatches).toBe(1);
    expect(e.gini).toBeGreaterThan(0);
  });

  it("separates concentration from mere scarcity", () => {
    const concentrated = exposureOf([0, 0, 0, 12]);
    const spread = exposureOf([3, 3, 3, 3]);
    expect(concentrated.meanMatches).toBe(spread.meanMatches);
    expect(concentrated.gini).toBeGreaterThan(spread.gini);
    expect(concentrated.maxShare).toBe(1);
    expect(concentrated.zeroMatches).toBe(3);
    expect(concentrated.p90).toBeGreaterThan(spread.p90);
  });

  it("handles a population where nobody matched", () => {
    const e = exposureOf([0, 0, 0]);
    expect(e.gini).toBe(0);
    expect(e.maxShare).toBe(0);
    expect(e.zeroMatches).toBe(3);
    expect(e.meanMatches).toBe(0);
  });
});

describe("equityFloor", () => {
  const row = (poolCoverage: number, optedOut = 0, n = 10) => ({ n, optedOut, poolCoverage });

  it("is 1 when every subpopulation has the same coverage", () => {
    expect(equityFloor([row(0.8), row(0.8), row(0.8)])).toBe(1);
  });

  it("is the worst-over-median ratio the rollout gate compares against 0.7", () => {
    expect(equityFloor([row(0.9), row(0.8), row(0.5)])).toBeCloseTo(0.625, 12);
    expect(equityFloor([row(0.9), row(0.8), row(0.6)])).toBeCloseTo(0.75, 12);
  });

  it("ignores a group whose members all opted out of the track by declaration", () => {
    const optedOut = row(0, 10, 10);
    expect(equityFloor([row(0.9), row(0.8), optedOut])).toBeCloseTo(0.8 / 0.85, 12);
    expect(equityFloor([optedOut])).toBe(0);
  });

  it("fails closed when the median group has no coverage", () => {
    expect(equityFloor([row(0), row(0), row(0.4)])).toBe(0);
    expect(equityFloor([row(0), row(0)])).toBe(0);
    expect(equityFloor([])).toBe(0);
  });
});