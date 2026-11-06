import { describe, expect, it, vi } from "vitest";

import { err, ok } from "@/domain/shared";
import { normalizeMatchPairs } from "@/domain/matching";

import type { ReplaceOutcome } from "./ports";
import {
  RECOMPUTE_MAX_ATTEMPTS,
  recomputeBackoffMs,
  recomputeMatches,
  type RecomputeDeps,
} from "./recompute-matches";

function deps(outcomes: ReplaceOutcome[]) {
  const replaceAll = vi.fn(async () => ok(outcomes.shift() ?? "replaced"));
  const sleep = vi.fn(async () => {});
  const value: RecomputeDeps = {
    profiles: { loadCompletedPool: async () => ok([]) },
    matches: { poolVersion: async () => ok("v1"), replaceAll },
    scheduler: { sleep, random: () => 0 },
  };
  return { value, replaceAll, sleep };
}

describe("recomputeBackoffMs", () => {
  it("uses a short 50-200ms exponential backoff with jitter", () => {
    expect(recomputeBackoffMs(0, () => 0)).toBe(50);
    expect(recomputeBackoffMs(0, () => 0.999)).toBe(99);
    expect(recomputeBackoffMs(1, () => 0)).toBe(100);
    expect(recomputeBackoffMs(2, () => 0.999)).toBe(200);
    expect(recomputeBackoffMs(8, () => 0)).toBe(200);
  });
});

describe("recomputeMatches", () => {
  it("retries when the pool changed and returns the published pairs", async () => {
    const { value, replaceAll, sleep } = deps(["pool_changed", "pool_changed", "replaced"]);
    await expect(recomputeMatches(value)).resolves.toEqual(ok([]));
    expect(replaceAll).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("gives up after the bounded number of attempts", async () => {
    const { value, replaceAll, sleep } = deps(
      Array<ReplaceOutcome>(RECOMPUTE_MAX_ATTEMPTS).fill("pool_changed"),
    );
    await expect(recomputeMatches(value)).resolves.toEqual(err("match.pool_unstable"));
    expect(replaceAll).toHaveBeenCalledTimes(RECOMPUTE_MAX_ATTEMPTS);
    expect(sleep).toHaveBeenCalledTimes(RECOMPUTE_MAX_ATTEMPTS - 1);
  });

  it("publishes against the version read before the pool", async () => {
    const { value, replaceAll } = deps(["replaced"]);
    await recomputeMatches(value);
    expect(replaceAll).toHaveBeenCalledWith([], "v1");
  });

  it("propagates storage failures without retrying", async () => {
    const { value, replaceAll } = deps([]);
    value.profiles = { loadCompletedPool: async () => err("storage.failed") };
    await expect(recomputeMatches(value)).resolves.toEqual(err("storage.failed"));
    expect(replaceAll).not.toHaveBeenCalled();
  });

  it("normalizes inverted pairs so userA < userB and deduplicates same-track pairs keeping highest similarity", () => {
    const pairs = normalizeMatchPairs([
      {
        track: "romance",
        userA: "00000000-0000-4000-8000-00000000000b",
        userB: "00000000-0000-4000-8000-00000000000a",
        similarity: 0.71,
        badges: [],
      },
      {
        track: "romance",
        userA: "00000000-0000-4000-8000-00000000000a",
        userB: "00000000-0000-4000-8000-00000000000b",
        similarity: 0.83,
        badges: [{ dimension: "valores", affinity: 0.9 }],
      },
      {
        track: "romance",
        userA: "00000000-0000-4000-8000-00000000000a",
        userB: "00000000-0000-4000-8000-00000000000a",
        similarity: 0.99,
        badges: [],
      },
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.userA).toBe("00000000-0000-4000-8000-00000000000a");
    expect(pairs[0]?.userB).toBe("00000000-0000-4000-8000-00000000000b");
    expect(pairs[0]?.similarity).toBe(0.83);
  });
});
