import { describe, expect, it } from "vitest";

import { MATCHING_CONFIG, QUIZ_ITEMS } from "@/config";
import { PSYCHOMETRIC_PARAMS } from "@/config/psychometric-params";
import { buildMeasurementModel, scoreLatent } from "@/domain/psychometrics/latent";
import type { LikertValue, QuizSubmission } from "@/types/microtest";

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
      "alias",
      "animal",
      "animalName",
      "color",
      "colorName",
      "enneagram",
      "mark",
      "mbtiCode",
      "narrative",
    ]);
    // A clear readout shows type (+ wing when it is distinguishable); an
    // ambiguous one never forces a type.
    expect(result.value.profile.enneagram.code).toMatch(/^([1-9](w[1-9])?|—)$/);
    expect(result.value.profile.color).toMatch(/^ennea-/);
    expect(store.results.get(USER_A)?.answers).toHaveLength(QUIZ_ITEMS.length);
  });

  it("sends a welcome only on the first submission", async () => {
    const store = new MemoryStore();
    const deps = wire(store);
    await submitQuiz({ userId: USER_A, submission: submission(4) }, deps);
    await submitQuiz({ userId: USER_A, submission: submission(2) }, deps);
    expect(store.notifications.filter((n) => n.type === "welcome")).toHaveLength(1);
  });

  it("keeps the first alias when the profile is retaken (ADR-024)", async () => {
    const store = new MemoryStore();
    const deps = wire(store);
    const first = await submitQuiz({ userId: USER_A, submission: submission(5) }, deps);
    const second = await submitQuiz({ userId: USER_A, submission: submission(1) }, deps);
    if (!first.ok || !second.ok) throw new Error("submit failed");
    // Opposite answers change the avatar, which would otherwise yield a new alias.
    expect(second.value.profile.animal + second.value.profile.color).not.toBe(
      first.value.profile.animal + first.value.profile.color,
    );
    expect(second.value.profile.alias).toBe(first.value.profile.alias);
    expect(store.results.get(USER_A)?.identity.alias).toBe(first.value.profile.alias);
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
});
