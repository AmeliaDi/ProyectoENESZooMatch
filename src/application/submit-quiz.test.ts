import { describe, expect, it } from "vitest";

import { MATCHING_CONFIG, QUIZ_ITEMS } from "@/config";
import { PSYCHOMETRIC_PARAMS } from "@/config/psychometric-params";
import { hatchRequiredItemIds } from "@/domain/identity/hatch-condition";
import { buildMeasurementModel, scoreLatent } from "@/domain/psychometrics/latent";
import type { LikertValue, QuizSubmission } from "@/types/microtest";

import { getResult } from "./get-result";
import { identityOf } from "./hatch";
import { submitQuiz, type SubmitQuizDeps } from "./submit-quiz";
import {
  MemoryStore,
  instantScheduler,
  memoryMatches,
  memoryNotifications,
  memoryProfiles,
} from "./testing/in-memory";

const MODEL = buildMeasurementModel(PSYCHOMETRIC_PARAMS);
const USER_A = "00000000-0000-4000-8000-00000000000a";
const USER_B = "00000000-0000-4000-8000-00000000000b";
/** Fixed test seed: `hatchIdentity` is deterministic, so the alias is reproducible. */
const SECRET = "zm-test-secret";

function submission(value: LikertValue): QuizSubmission {
  return {
    likert: QUIZ_ITEMS.filter((i) => i.tipo_respuesta === "likert_5").map((i) => ({
      itemId: i.id,
      value,
    })),
    filters: QUIZ_ITEMS.filter((i) => i.tipo_respuesta === "seleccion_multiple").map((i) => ({
      itemId: i.id,
      selected: ["prefiero no decir"],
    })),
  };
}

function wire(store: MemoryStore): SubmitQuizDeps {
  return {
    profiles: memoryProfiles(store),
    matches: memoryMatches(store),
    notifications: memoryNotifications(store),
    scheduler: instantScheduler,
    latentScorer: (responses) => scoreLatent(MODEL, responses, MATCHING_CONFIG.quality),
    secret: SECRET,
  };
}

describe("submitQuiz", () => {
  it("persists the result and returns the public profile only", async () => {
    const store = new MemoryStore();
    const result = await submitQuiz({ userId: USER_A, submission: submission(4) }, wire(store));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.recomputePending).toBe(false);
    // Own profile only: display names, MBTI and enneagram for the reveal; no
    // vectors, scores or answers.
    expect(Object.keys(result.value.profile).sort()).toEqual([
      "enneagram",
      "identity",
      "mbtiCode",
      "narrative",
      "progressPercent",
    ]);
    // A clear readout shows type (+ wing when it is distinguishable); an
    // ambiguous one never forces a type.
    expect(result.value.profile.enneagram.code).toMatch(/^([1-9](w[1-9])?|—)$/);
    expect(result.value.profile.identity.colorId).toMatch(/^ennea-/);
    expect(store.results.get(USER_A)?.answers).toHaveLength(QUIZ_ITEMS.length);
  });

  it("sends a welcome only on the first submission", async () => {
    const store = new MemoryStore();
    const deps = wire(store);
    await submitQuiz({ userId: USER_A, submission: submission(4) }, deps);
    await submitQuiz({ userId: USER_A, submission: submission(2) }, deps);
    expect(store.notifications.filter((n) => n.type === "welcome")).toHaveLength(1);
  });

  it("refuses a submission with an unanswered core item and stores nothing", async () => {
    const store = new MemoryStore();
    const [missing] = hatchRequiredItemIds(QUIZ_ITEMS);
    const partial: QuizSubmission = {
      likert: submission(4).likert.filter((answer) => answer.itemId !== missing),
      filters: [],
    };

    const result = await submitQuiz({ userId: USER_A, submission: partial }, wire(store));

    // The mandatory core is exactly what hatching reads, so an egg never comes
    // out of a scored submission: the request is refused before anything is
    // written, and no half-named row can reach a screen.
    expect(result).toEqual({ ok: false, error: "request.invalid" });
    expect(store.results.has(USER_A)).toBe(false);
    expect(store.identities.has(USER_A)).toBe(false);
  });

  it("keeps the first alias when the profile is retaken (ADR-024)", async () => {
    const store = new MemoryStore();
    const deps = wire(store);
    const first = await submitQuiz({ userId: USER_A, submission: submission(5) }, deps);
    const second = await submitQuiz({ userId: USER_A, submission: submission(1) }, deps);
    if (!first.ok || !second.ok) throw new Error("submit failed");
    // Opposite answers change the avatar the hatch would propose, which would
    // otherwise yield a new alias.
    const rescored = store.results.get(USER_A)!;
    const proposed = identityOf(USER_A, rescored.scored, SECRET, new Set());
    expect([proposed.animalId, proposed.colorId, proposed.mark]).not.toEqual([
      first.value.profile.identity.animalId,
      first.value.profile.identity.colorId,
      first.value.profile.identity.mark,
    ]);
    expect(second.value.profile.identity).toEqual(first.value.profile.identity);
    expect(second.value.profile.identity.aliasCompleto).toBe(first.value.profile.identity.aliasCompleto);
    expect(store.identities.get(USER_A)?.aliasCompleto).toBe(first.value.profile.identity.aliasCompleto);
  });

  it("is deterministic for the same user and answers", async () => {
    const first = await submitQuiz({ userId: USER_A, submission: submission(5) }, wire(new MemoryStore()));
    const second = await submitQuiz({ userId: USER_A, submission: submission(5) }, wire(new MemoryStore()));
    expect(first).toEqual(second);
  });

  it("keeps the saved result and flags recomputePending when the pool never settles", async () => {
    const store = new MemoryStore();
    store.concurrentArrivals = 99;
    const result = await submitQuiz({ userId: USER_A, submission: submission(3) }, wire(store));
    expect(result.ok && result.value.recomputePending).toBe(true);
    expect(store.results.has(USER_A)).toBe(true);
    expect(store.notified).toEqual([]);
  });

  it("fails with storage.failed when the result cannot be saved", async () => {
    const store = new MemoryStore();
    store.faults.save = true;
    const result = await submitQuiz({ userId: USER_A, submission: submission(3) }, wire(store));
    expect(result).toEqual({ ok: false, error: "storage.failed" });
    expect(store.notifications).toEqual([]);
  });

  it("treats notification failures as cosmetic", async () => {
    const store = new MemoryStore();
    store.faults.notify = true;
    const result = await submitQuiz({ userId: USER_A, submission: submission(3) }, wire(store));
    expect(result.ok && result.value.recomputePending).toBe(false);
  });

  it("notifies the submitter and every new counterpart", async () => {
    const store = new MemoryStore();
    const deps = wire(store);
    await submitQuiz({ userId: USER_B, submission: submission(4) }, deps);
    store.notified.length = 0;
    await submitQuiz({ userId: USER_A, submission: submission(4) }, deps);

    expect(store.notified[0]).toBe(USER_A);
    const paired = store.matches.some(
      (m) => [m.userA, m.userB].includes(USER_A) && [m.userA, m.userB].includes(USER_B),
    );
    expect(store.notified.includes(USER_B)).toBe(paired);
  });

  it("stores the inclusive-language preference when provided", async () => {
    const store = new MemoryStore();
    await submitQuiz(
      { userId: USER_A, submission: submission(3), inclusiveMode: "neutro_e" },
      wire(store),
    );
    expect(store.inclusiveModes.get(USER_A)).toBe("neutro_e");
  });

  it("deduplicates concurrent double submissions and clientKey retries idempotently", async () => {
    const store = new MemoryStore();
    const deps = wire(store);
    let saveCalls = 0;
    const origSave = deps.profiles.saveQuizResult.bind(deps.profiles);
    deps.profiles.saveQuizResult = async (record) => {
      saveCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 15));
      return origSave(record);
    };

    const [first, second] = await Promise.all([
      submitQuiz({ userId: USER_A, submission: submission(4), clientKey: "attempt-1" }, deps),
      submitQuiz({ userId: USER_A, submission: submission(4), clientKey: "attempt-1" }, deps),
    ]);

    expect(first).toEqual(second);
    expect(saveCalls).toBe(1);
    expect(store.notifications.filter((n) => n.type === "welcome")).toHaveLength(1);

    // Subsequent retry with the same clientKey also returns cached result without re-saving
    const retry = await submitQuiz(
      { userId: USER_A, submission: submission(4), clientKey: "attempt-1" },
      deps,
    );
    expect(retry).toEqual(first);
    expect(saveCalls).toBe(1);
  });

  it("produces identical romance and amistad match sets and scores across 3 permutations of N=20 arrivals", async () => {
    const likertItems = QUIZ_ITEMS.filter((i) => i.tipo_respuesta === "likert_5");
    const filterItems = QUIZ_ITEMS.filter((i) => i.tipo_respuesta === "seleccion_multiple");

    const users = Array.from({ length: 20 }, (_, idx) => {
      const userId = `00000000-0000-4000-8000-${String(idx + 1).padStart(12, "0")}`;
      const sub: QuizSubmission = {
        likert: likertItems.map((item, qIdx) => ({
          itemId: item.id,
          value: (((idx * 7 + qIdx * 3) % 5) + 1) as LikertValue,
        })),
        filters: filterItems.map((item) => {
          if (item.subcategoria === "identidad_genero") {
            return { itemId: item.id, selected: [idx % 2 === 0 ? "mujer" : "hombre"] };
          }
          if (item.subcategoria === "orientacion_sexual") {
            return { itemId: item.id, selected: ["bisexual/pansexual"] };
          }
          return { itemId: item.id, selected: ["relación seria", "amistad"] };
        }),
      };
      return { userId, submission: sub };
    });

    const permutations = [
      users,
      [...users].reverse(),
      users.filter((_, i) => i % 2 === 0).concat(users.filter((_, i) => i % 2 === 1)),
    ];

    const snapshots: string[] = [];
    for (const order of permutations) {
      const store = new MemoryStore();
      const deps = wire(store);
      for (const u of order) {
        const res = await submitQuiz(u, deps);
        expect(res.ok).toBe(true);
      }
      const canonical = [...store.matches]
        .sort((a, b) =>
          `${a.track}:${a.userA}:${a.userB}`.localeCompare(`${b.track}:${b.userA}:${b.userB}`),
        )
        .map((m) => `${m.track}:${m.userA}:${m.userB}:${m.similarity.toFixed(6)}`)
        .join("|");
      snapshots.push(canonical);
    }

    expect(snapshots[0]?.length).toBeGreaterThan(0);
    expect(snapshots[1]).toBe(snapshots[0]);
    expect(snapshots[2]).toBe(snapshots[0]);
  });

  it("incrementally updates existing user results when user k+1 joins and sends notification only once per match set change", async () => {
    const store = new MemoryStore();
    const deps = wire(store);
    const resultDeps = {
      profiles: memoryProfiles(store),
      matches: memoryMatches(store),
      digest: (s: string) => s.slice(0, 16).padEnd(16, "0"),
    };

    // User A joins alone: 0 matches initially
    await submitQuiz({ userId: USER_A, submission: submission(4) }, deps);
    const beforeB = await getResult(USER_A, resultDeps);
    expect(beforeB.ok && beforeB.value.matches.amistad).toHaveLength(0);

    // User B joins with compatible profile: User A immediately sees User B on next getResult without re-submitting
    await submitQuiz({ userId: USER_B, submission: submission(4) }, deps);
    const afterB = await getResult(USER_A, resultDeps);
    expect(afterB.ok && afterB.value.matches.amistad.length).toBeGreaterThan(0);

    // Count notifications for USER_A so far
    const countAfterB = store.notifications.filter(
      (n) => n.userId === USER_A && (n.type === "match_amistad" || n.type === "match_romance"),
    ).length;
    expect(countAfterB).toBeGreaterThan(0);

    // Calling notifyMatches again when USER_A's match set has NOT changed must be idempotent (no new notification)
    await deps.notifications.notifyMatches(USER_A);
    const countAfterDuplicateNotify = store.notifications.filter(
      (n) => n.userId === USER_A && (n.type === "match_amistad" || n.type === "match_romance"),
    ).length;
    expect(countAfterDuplicateNotify).toBe(countAfterB);
  });
});
