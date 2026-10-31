import { describe, expect, it } from "vitest";

import {
  andThen,
  clampSimilarity,
  err,
  fixedClock,
  fnv1a32,
  mapResult,
  mulberry32,
  ok,
  stringHash,
  toAlias,
  toLikert,
  toSimilarity,
  toUserId,
  unwrap,
  type Result,
} from "./index";

describe("stringHash", () => {
  it("is deterministic and non-negative", () => {
    for (const s of ["", "ajolotito", "🦎 lagartija", "x".repeat(500)]) {
      const h = stringHash(s);
      expect(stringHash(s)).toBe(h);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(2 ** 31);
    }
  });

  it("keeps the shipped values so avatars stay stable", () => {
    expect(stringHash("")).toBe(0);
    expect(stringHash("a")).toBe(97);
    expect(stringHash("ab")).toBe(97 * 31 + 98);
  });
});

describe("fnv1a32", () => {
  it("matches the FNV-1a reference vectors", () => {
    expect(fnv1a32("")).toBe(0x811c9dc5);
    expect(fnv1a32("a")).toBe(0xe40c292c);
    expect(fnv1a32("foobar")).toBe(0xbf9cf968);
  });

  it("returns unsigned 32-bit integers", () => {
    for (const s of ["x", "user-123", "🦎"]) {
      const h = fnv1a32(s);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(0xffffffff);
    }
  });
});

describe("mulberry32", () => {
  it("is deterministic for a seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 50; i += 1) expect(a()).toBe(b());
  });

  it("stays in [0, 1)", () => {
    const rand = mulberry32(fnv1a32("distribution-check"));
    for (let i = 0; i < 5000; i += 1) {
      const v = rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("diverges across seeds", () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe("Result", () => {
  it("maps and chains", () => {
    const doubled = mapResult<number, number, "boom">(ok(2), (n) => n * 2);
    expect(doubled).toEqual(ok(4));
    const failed = andThen(doubled, (): Result<number, "boom"> => err("boom"));
    expect(failed).toEqual(err("boom"));
    expect(mapResult(failed, (n) => n + 1)).toEqual(err("boom"));
  });

  it("unwrap throws on Err", () => {
    expect(unwrap(ok("v"))).toBe("v");
    expect(() => unwrap(err("nope"))).toThrow(/nope/);
  });
});

describe("brands", () => {
  it("validates user ids as UUIDs", () => {
    expect(toUserId("3f2504e0-4f89-41d3-9a0c-0305e82c3301").ok).toBe(true);
    expect(toUserId("not-a-uuid")).toEqual(err("brand.user_id_invalid"));
  });

  it("validates similarity range", () => {
    expect(toSimilarity(0).ok).toBe(true);
    expect(toSimilarity(1).ok).toBe(true);
    expect(toSimilarity(1.0001)).toEqual(err("brand.similarity_out_of_range"));
    expect(toSimilarity(Number.NaN).ok).toBe(false);
    expect(clampSimilarity(-3)).toBe(0);
    expect(clampSimilarity(7)).toBe(1);
    expect(clampSimilarity(Number.NaN)).toBe(0);
  });

  it("validates Likert answers", () => {
    expect(toLikert(3).ok).toBe(true);
    expect(toLikert(0).ok).toBe(false);
    expect(toLikert(2.5).ok).toBe(false);
  });

  it("trims aliases and rejects empty ones", () => {
    expect(toAlias("  zorrito  ")).toEqual(ok("zorrito"));
    expect(toAlias("   ")).toEqual(err("brand.alias_empty"));
  });
});

describe("fixedClock", () => {
  it("always returns the same instant without sharing the Date", () => {
    const clock = fixedClock(new Date("2026-10-31T00:00:00Z"));
    const first = clock.now();
    first.setFullYear(2000);
    expect(clock.now().toISOString()).toBe("2026-10-31T00:00:00.000Z");
  });
});
