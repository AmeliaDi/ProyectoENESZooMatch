import { describe, expect, it } from "vitest";

import { MATCHING_CONFIG, QUIZ_ITEMS } from "@/config";
import { PSYCHOMETRIC_PARAMS } from "@/config/psychometric-params";
import { buildMeasurementModel, scoreLatent } from "@/domain/psychometrics/latent";
import { coreRequiredItemIds } from "@/domain/psychometrics/core-complete";
import type { LikertValue, QuizSubmission } from "@/types/microtest";

import { ensureIdentity, hatchProfile, type HatchDeps } from "./hatch";
import { submitQuiz } from "./submit-quiz";
import {
  MemoryStore,
  instantScheduler,
  memoryMatches,
  memoryNotifications,
  memoryProfiles,
} from "./testing/in-memory";

const MODEL = buildMeasurementModel(PSYCHOMETRIC_PARAMS);
const USER = "00000000-0000-4000-8000-00000000000a";
const SECRET = "zm-test-secret";
const REQUIRED_IDS = coreRequiredItemIds(QUIZ_ITEMS);

function fullSubmission(value: LikertValue): QuizSubmission {
  return {
    likert: QUIZ_ITEMS.filter((i) => i.tipo_respuesta === "likert_5").map((i) => ({ itemId: i.id, value })),
    filters: QUIZ_ITEMS.filter((i) => i.tipo_respuesta === "seleccion_multiple").map((i) => ({
      itemId: i.id,
      selected: ["prefiero no decir"],
    })),
  };
}

function wire(store: MemoryStore) {
  return {
    profiles: memoryProfiles(store),
    matches: memoryMatches(store),
    notifications: memoryNotifications(store),
    scheduler: instantScheduler,
    latentScorer: (responses: Parameters<typeof scoreLatent>[1]) => scoreLatent(MODEL, responses, MATCHING_CONFIG.quality),
    secret: SECRET,
  };
}

function hatchDeps(store: MemoryStore): HatchDeps {
  return { profiles: memoryProfiles(store), secret: SECRET, scheduler: instantScheduler };
}

describe("ensureIdentity", () => {
  it("returns quiz.not_completed when no profile exists", async () => {
    const store = new MemoryStore();
    const result = await ensureIdentity(USER, hatchDeps(store));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("quiz.not_completed");
  });

  it("returns the existing identity when already hatched (idempotent)", async () => {
    const store = new MemoryStore();
    const deps = wire(store);
    await submitQuiz({ userId: USER, submission: fullSubmission(4) }, deps);
    const before = store.identities.get(USER)!;

    const result = await ensureIdentity(USER, hatchDeps(store));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.outcome).toBe("already");
    expect(result.value.identity.aliasCompleto).toBe(before.aliasCompleto);
    expect(store.identities.get(USER)!.aliasCompleto).toBe(before.aliasCompleto);
  });

  it("hatches an egg whose core is complete (self-repair)", async () => {
    const store = new MemoryStore();
    const deps = wire(store);
    await submitQuiz({ userId: USER, submission: fullSubmission(3) }, deps);
    // Force back to egg to simulate a lost hatch write.
    const hatched = store.identities.get(USER)!;
    store.identities.set(USER, { ...hatched, estadoIdentidad: "huevo", aliasCompleto: null, animalId: null, colorId: null });

    const result = await ensureIdentity(USER, hatchDeps(store));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.identity.estadoIdentidad).toBe("eclosionado");
    expect(result.value.identity.aliasCompleto).toBeTruthy();
  });

  it("returns missingItemIds when the egg core is incomplete", async () => {
    const store = new MemoryStore();
    // Store partial answers: only half the required items.
    const partial = REQUIRED_IDS.slice(0, Math.floor(REQUIRED_IDS.length / 2));
    store.results.set(USER, {
      userId: USER,
      answers: partial.map((id) => ({ itemId: id, value: 3 as const })),
      scored: { latent: null, normalizedScores: {}, hardFilters: { orientacion_sexual: [], identidad_genero: [], tipo_relacion_busca: [] } } as never,
      narrative: null,
      completedModules: [],
    });
    store.identities.set(USER, {
      estadoIdentidad: "huevo", aliasCompleto: null, aliasAnimal: null, aliasColor: null,
      aliasSufijo: null, animalId: null, colorId: null, mbtiCode: null, enneagramCode: null,
      narrative: null, mark: null, revelacionVista: false, quizCompletedAt: null,
    });

    const result = await ensureIdentity(USER, hatchDeps(store));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.identity.estadoIdentidad).toBe("huevo");
    expect(result.value.missingItemIds!.length).toBeGreaterThan(0);
    expect(result.value.missingItemIds!.length).toBe(REQUIRED_IDS.length - partial.length);
  });

  it("retries transient storage failures then succeeds", async () => {
    const store = new MemoryStore();
    const deps = wire(store);
    await submitQuiz({ userId: USER, submission: fullSubmission(4) }, deps);
    const hatched = store.identities.get(USER)!;
    store.identities.set(USER, { ...hatched, estadoIdentidad: "huevo", aliasCompleto: null, animalId: null, colorId: null });

    // Fail the first two write attempts, then succeed.
    let writeCount = 0;
    const profiles = memoryProfiles(store);
    const originalWrite = profiles.writeIdentity.bind(profiles);
    profiles.writeIdentity = async (userId, hatch) => {
      writeCount++;
      if (writeCount <= 2) return { ok: false, error: "storage.failed" } as never;
      return originalWrite(userId, hatch);
    };

    const result = await ensureIdentity(USER, { profiles, secret: SECRET, scheduler: instantScheduler });
    expect(result.ok).toBe(true);
    expect(writeCount).toBe(3);
  });

  it("gives up after MAX_STORAGE_RETRIES persistent failures", async () => {
    const store = new MemoryStore();
    const deps = wire(store);
    await submitQuiz({ userId: USER, submission: fullSubmission(4) }, deps);
    const hatched = store.identities.get(USER)!;
    store.identities.set(USER, { ...hatched, estadoIdentidad: "huevo", aliasCompleto: null, animalId: null, colorId: null });

    store.faults.save = true;
    const result = await ensureIdentity(USER, hatchDeps(store));
    expect(result.ok).toBe(false);
  });
});

describe("hatchProfile idempotency", () => {
  it("never renames someone already hatched", async () => {
    const store = new MemoryStore();
    const deps = wire(store);
    await submitQuiz({ userId: USER, submission: fullSubmission(4) }, deps);
    const alias = store.identities.get(USER)!.aliasCompleto;

    const own = await memoryProfiles(store).findOwn(USER);
    if (!own.ok || !own.value) throw new Error("expected own profile");
    const result = await hatchProfile(USER, own.value, hatchDeps(store));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.outcome).toBe("already");
    expect(store.identities.get(USER)!.aliasCompleto).toBe(alias);
  });
});