/**
 * Reading of the observatory: which window a request may ask for, and what
 * the four similarity anchors of the running matcher have to do with it. The
 * charts are drawn on an axis defined by those numbers, so a read that sent
 * anything else would be drawing a shape that means nothing.
 */
import { describe, expect, it } from "vitest";

import { ADMIN_CONFIG } from "@/config";
import { hasObservatory } from "@/contracts/admin-metrics";
import { getAmistadReference, getAmistadThreshold, getRomanceReference, getRomanceThreshold } from "@/domain/matching";
import { err, ok, type Result } from "@/domain/shared";

import { loadAdminMetrics, windowDays } from "./admin-metrics";
import type { StorageError } from "./errors";
import type { AdminRepository } from "./ports";

type DashboardArgs = Parameters<AdminRepository["loadDashboard"]>[0];

/** The whole legacy payload of the deployed two-argument RPC, and nothing new. */
const LEGACY = {
  generatedAt: "2026-11-08T23:00:00Z",
  romanceThreshold: 0.5374,
  amistadThreshold: 0.4643,
  totalProfiles: 167,
  huevos: 54,
  romanceMatches: 276,
  amistadMatches: 720,
  usersWithRomanceMatch: 132,
  usersWithAmistadMatch: 163,
  topAnimals: [{ id: "ajolote", name: "ajolote", count: 21 }],
  topColors: [{ id: "turquesa", name: "turquesa", count: 18 }],
  mbtiDistribution: { INTJ: 26, ENFP: 11 },
};

function recorder(payload: Result<unknown, StorageError>) {
  const calls: DashboardArgs[] = [];
  return {
    calls,
    repo: {
      async loadDashboard(args: DashboardArgs) {
        calls.push(args);
        return payload;
      },
    } satisfies Pick<AdminRepository, "loadDashboard">,
  };
}

describe("windowDays", () => {
  it("honours only the windows the console offers", () => {
    for (const days of ADMIN_CONFIG.metrics.windowsDays) expect(windowDays(days)).toBe(days);
  });

  it("falls back to the default for anything else, including an invented length", () => {
    const { defaultWindowDays } = ADMIN_CONFIG.metrics;
    for (const asked of [null, undefined, 0, -30, 1, 15, 91, 120, 100_000, Number.NaN]) {
      expect(windowDays(asked), String(asked)).toBe(defaultWindowDays);
    }
  });
});

describe("loadAdminMetrics", () => {
  it("sends the thresholds and the references the matcher is running with", async () => {
    const { repo, calls } = recorder(ok(LEGACY));
    expect((await loadAdminMetrics(repo, 7)).ok).toBe(true);
    expect(calls).toEqual([
      {
        romance: getRomanceThreshold(),
        amistad: getAmistadThreshold(),
        romanceReference: getRomanceReference(),
        amistadReference: getAmistadReference(),
        windowDays: 7,
      },
    ]);
    // The loader guarantees a positive denominator, so the axis is never a
    // division by zero: the reference always sits above the cut.
    expect(getRomanceReference()).toBeGreaterThan(getRomanceThreshold());
    expect(getAmistadReference()).toBeGreaterThan(getAmistadThreshold());
  });

  it("reads the default window when the request did not choose one", async () => {
    const { repo, calls } = recorder(ok(LEGACY));
    await loadAdminMetrics(repo);
    expect(calls[0]?.windowDays).toBe(ADMIN_CONFIG.metrics.defaultWindowDays);
  });

  it("keeps answering for the old payload, without an observatory", async () => {
    const { repo } = recorder(ok(LEGACY));
    const metrics = await loadAdminMetrics(repo, 30);
    expect(metrics.ok && hasObservatory(metrics.value)).toBe(false);
    expect(metrics.ok && metrics.value.totalProfiles).toBe(167);
    expect(metrics.ok && metrics.value.series).toEqual([]);
  });

  it("refuses a payload the base could not have produced", async () => {
    const { repo } = recorder(ok({ ...LEGACY, windowDays: 30, eclosion: { medianaHoras: -1, p75Horas: 2, muestra: 3 } }));
    expect(await loadAdminMetrics(repo, 30)).toEqual(err("service.unavailable"));
  });

  it("propagates the storage failure instead of showing an empty panel", async () => {
    const { repo } = recorder(err("storage.failed"));
    expect(await loadAdminMetrics(repo, 30)).toEqual(err("storage.failed"));
  });
});
