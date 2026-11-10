/**
 * Rollout gates (Fase 6): the decision is a conjunction, so ONE failing gate
 * must block activation, and the reason must name the gate. Conservation and
 * structural symmetry are checked as pure functions, not assumed.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { ROLLOUT_GATES } from "@/config/rollout-gates";
import type { MatchTrack } from "@/types/microtest";
import type { EngineMeasurement, RolloutGates, TrackMeasurement } from "@/types/rollout-gates";

import type { GlobalMatch } from "./compute-matches";
import { conservationLoss, conserveProtected, evaluateGates, structuralViolations, type ProtectedPair } from "./rollout";

const track = (overrides: Partial<TrackMeasurement> = {}): TrackMeasurement => ({
  coverage: 0.99,
  poolCoverage: 0.99,
  gini: 0.3,
  equityFloor: 0.95,
  spearmanVsIncumbent: 0.95,
  noise: { spearman: 0.96, jaccard: 0.55 },
  ...overrides,
});

function measurement(overrides: Partial<EngineMeasurement> = {}): EngineMeasurement {
  return {
    engine: "coseno",
    people: 600,
    pairs: 207400,
    elapsedMs: 1000,
    tracks: { romance: track(), amistad: track() },
    violations: 0,
    lostProtectedPairs: 0,
    ...overrides,
  };
}

const incumbent = (): EngineMeasurement => measurement({ engine: "capas" });

const match = (track_: MatchTrack, a: string, b: string, similarity = 0.6): GlobalMatch => ({
  track: track_,
  userA: a,
  userB: b,
  similarity,
  badges: [],
});

describe("conservationLoss", () => {
  const protectedPairs: ProtectedPair[] = [
    { track: "romance", userA: "a", userB: "b", similarity: 0.61 },
    { track: "amistad", userA: "a", userB: "c", similarity: 0.52 },
  ];

  it("is zero when every protected pair survives", () => {
    expect(conservationLoss([match("romance", "a", "b"), match("amistad", "a", "c")], protectedPairs)).toBe(0);
  });

  it("counts each dropped pair once, per track", () => {
    expect(conservationLoss([match("romance", "a", "b")], protectedPairs)).toBe(1);
    expect(conservationLoss([], protectedPairs)).toBe(2);
  });

  it("ignores endpoint order and case: a canonical change is not a loss", () => {
    expect(conservationLoss([match("romance", "B", "A"), match("amistad", "C", "A")], protectedPairs)).toBe(0);
  });

  it("does not let a pair on the wrong track count as conserved", () => {
    expect(conservationLoss([match("amistad", "a", "b"), match("amistad", "a", "c")], protectedPairs)).toBe(1);
  });

  it("is zero when there is nothing to conserve", () => {
    expect(conservationLoss([], [])).toBe(0);
  });
});

describe("conserveProtected", () => {
  const protectedPairs: ProtectedPair[] = [
    { track: "romance", userA: "a", userB: "b", similarity: 0.61 },
    { track: "amistad", userA: "a", userB: "c", similarity: 0.52 },
  ];

  it("puts back every pair the new engine dropped, with its stored similarity", () => {
    const next = [match("romance", "a", "d", 0.7)];
    const conserved = conserveProtected(next, protectedPairs);
    expect(conservationLoss(conserved, protectedPairs)).toBe(0);
    expect(conserved.find((m) => m.track === "romance" && m.userB === "b")!.similarity).toBe(0.61);
    expect(conserved).toHaveLength(3);
  });

  it("never overwrites a pair the new engine already publishes", () => {
    const next = [match("romance", "a", "b", 0.9), match("amistad", "a", "c", 0.8)];
    const conserved = conserveProtected(next, protectedPairs);
    expect(conserved).toHaveLength(2);
    expect(conserved.find((m) => m.track === "romance")!.similarity).toBe(0.9);
  });

  it("is idempotent and canonicalizes the restored rows", () => {
    const reversed: ProtectedPair[] = [{ track: "romance", userA: "B", userB: "A", similarity: 0.61 }];
    const once = conserveProtected([], reversed);
    expect(once).toEqual([match("romance", "a", "b", 0.61)]);
    expect(conserveProtected(once, reversed)).toEqual(once);
    expect(structuralViolations(once)).toBe(0);
  });

  it("leaves an unprotected set untouched", () => {
    const next = [match("romance", "a", "b")];
    expect(conserveProtected(next, [])).toEqual(next);
  });
});

describe("structuralViolations", () => {
  it("accepts a canonical, unique, in-range set", () => {
    expect(structuralViolations([match("romance", "a", "b"), match("amistad", "a", "c")])).toBe(0);
  });

  it("flags reversed order, self-pairs and duplicates", () => {
    expect(structuralViolations([match("romance", "b", "a")])).toBe(1);
    expect(structuralViolations([match("romance", "a", "a")])).toBe(1);
    expect(structuralViolations([match("romance", "a", "b"), match("romance", "a", "b")])).toBe(1);
  });

  it("flags similarities outside [0, 1] and non-finite ones", () => {
    expect(structuralViolations([match("romance", "a", "b", 1.4)])).toBe(1);
    expect(structuralViolations([match("romance", "a", "b", Number.NaN)])).toBe(1);
  });

  it("counts every defect, not just the first", () => {
    expect(structuralViolations([match("romance", "b", "a", 2), match("romance", "b", "a", 2)])).toBe(5);
  });

  it("is zero on an empty set", () => {
    expect(structuralViolations([])).toBe(0);
  });
});

describe("evaluateGates", () => {
  it("activates only when every gate passes", () => {
    const decision = evaluateGates(measurement(), incumbent(), ROLLOUT_GATES);
    expect(decision.failed).toEqual([]);
    expect(decision.activate).toBe(true);
    expect(decision.gates.every((g) => g.passed && g.reason === "")).toBe(true);
  });

  it("names every gate the prompt requires", () => {
    const ids = evaluateGates(measurement(), incumbent(), ROLLOUT_GATES).gates.map((g) => g.id);
    expect(ids).toEqual([
      "cobertura.romance",
      "cobertura.amistad",
      "equidad",
      "exposicion",
      "correlacion_rangos",
      "estabilidad_ruido",
      "invariantes",
      "tiempo",
      "conservacion",
    ]);
  });

  const blocks: Array<[string, Partial<EngineMeasurement>, string]> = [
    ["low romance coverage", { tracks: { romance: track({ poolCoverage: 0.1 }), amistad: track() } }, "cobertura.romance"],
    ["low amistad coverage", { tracks: { romance: track(), amistad: track({ poolCoverage: 0.1 }) } }, "cobertura.amistad"],
    ["equity gap", { tracks: { romance: track({ equityFloor: 0.5 }), amistad: track() } }, "equidad"],
    ["concentrated exposure", { tracks: { romance: track({ gini: 0.99 }), amistad: track() } }, "exposicion"],
    ["abrupt reranking", { tracks: { romance: track({ spearmanVsIncumbent: 0.1 }), amistad: track() } }, "correlacion_rangos"],
    ["noise sensitivity", { tracks: { romance: track({ noise: { spearman: 0.95, jaccard: 0.1 } }), amistad: track() } }, "estabilidad_ruido"],
    ["structural defect", { violations: 1 }, "invariantes"],
    ["over budget", { elapsedMs: 10_000_000 }, "tiempo"],
    ["lost conversation", { lostProtectedPairs: 1 }, "conservacion"],
  ];

  it.each(blocks)("blocks activation on %s and records the reason", (_label, overrides, gateId) => {
    const decision = evaluateGates(measurement(overrides), incumbent(), ROLLOUT_GATES);
    expect(decision.activate).toBe(false);
    expect(decision.failed).toContain(gateId);
    const failed = decision.gates.find((g) => g.id === gateId)!;
    expect(failed.passed).toBe(false);
    expect(failed.reason.length).toBeGreaterThan(0);
  });

  it("blocks when exposure is worse than the incumbent even below the absolute ceiling", () => {
    const gates: RolloutGates = {
      ...ROLLOUT_GATES,
      exposicion: { gini_max: { romance: 1, amistad: 1 }, no_peor_que_actual: true },
    };
    const decision = evaluateGates(
      measurement({ tracks: { romance: track({ gini: 0.5 }), amistad: track() } }),
      measurement({ engine: "capas", tracks: { romance: track({ gini: 0.2 }), amistad: track() } }),
      gates,
    );
    expect(decision.failed).toContain("exposicion");
  });

  it("allows worse-than-incumbent exposure when the comparison is disabled", () => {
    const gates: RolloutGates = {
      ...ROLLOUT_GATES,
      exposicion: { gini_max: { romance: 1, amistad: 1 }, no_peor_que_actual: false },
    };
    const decision = evaluateGates(
      measurement({ tracks: { romance: track({ gini: 0.5 }), amistad: track() } }),
      measurement({ engine: "capas", tracks: { romance: track({ gini: 0.2 }), amistad: track() } }),
      gates,
    );
    expect(decision.failed).not.toContain("exposicion");
  });

  it("reports the worst track, not the average, for equity and stability", () => {
    const decision = evaluateGates(
      measurement({ tracks: { romance: track({ equityFloor: 0.99 }), amistad: track({ equityFloor: 0.4 }) } }),
      incumbent(),
      ROLLOUT_GATES,
    );
    const equity = decision.gates.find((g) => g.id === "equidad")!;
    expect(equity.passed).toBe(false);
    expect(equity.observed).toContain("amistad");
  });

  it("treats an empty pool as zero compute cost, not a division by zero", () => {
    const decision = evaluateGates(measurement({ pairs: 0, elapsedMs: 0 }), incumbent(), ROLLOUT_GATES);
    expect(decision.gates.find((g) => g.id === "tiempo")!.passed).toBe(true);
  });
});

describe("rollout gates config", () => {
  it("ships the activation flag and a single affinity notice", () => {
    expect(ROLLOUT_GATES.activacion.variable).toBe("MATCHING_ENGINE");
    expect(ROLLOUT_GATES.activacion.notificacion.type).toBe("afinidad_afinada");
    expect(ROLLOUT_GATES.activacion.notificacion.cuerpo.length).toBeGreaterThan(0);
  });

  it("forbids any structural violation and any lost conversation", () => {
    expect(ROLLOUT_GATES.invariantes.max_violaciones).toBe(0);
    expect(ROLLOUT_GATES.conservacion.max_perdida).toBe(0);
  });

  it("keeps the pending notice migration in step with the configured type", () => {
    // La migración que ensancha notifications.type está fuera de supabase/migrations
    // a propósito (rompería la paridad de db:migrate-test mientras producción no la
    // tenga). Si el config cambia de tipo, el DDL pendiente tiene que cambiar con él.
    const ddl = readFileSync(
      resolve(process.cwd(), "supabase/maintenance/pending/20261126000000_afinidad_notification.sql"),
      "utf8",
    ).replace(/\r\n/g, "\n");
    expect(ddl).toContain(`'${ROLLOUT_GATES.activacion.notificacion.type}'`);
    expect(ddl).toContain("notifications_afinidad_unique_idx");
    expect(ddl).toMatch(/^-- ?Idempotente/m);
    // No puede estar en migrations/: producción aún no la tiene.
    expect(readdirSync(resolve(process.cwd(), "supabase/migrations"))).not.toContain("20261126000000_afinidad_notification.sql");
  });

  it("rejects a coverage range whose min exceeds its max", async () => {
    const { rolloutGatesSchema } = await import("@/config/rollout-gates");
    const raw = await import("../../../data/rollout-gates.json");
    const broken = structuredClone(raw.default);
    broken.cobertura.romance.min.valor = 0.99;
    broken.cobertura.romance.max.valor = 0.5;
    expect(rolloutGatesSchema.safeParse(broken).success).toBe(false);
  });
});