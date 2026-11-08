import { describe, expect, it } from "vitest";

import { MATCHING_CONFIG, QUIZ_ITEMS } from "@/config";
import { PSYCHOMETRIC_PARAMS } from "@/config/psychometric-params";
import { buildMeasurementModel, scoreLatent } from "@/domain/psychometrics/latent";
import { coreRequiredItemIds } from "@/domain/psychometrics/core-complete";
import type { LikertValue, QuizSubmission } from "@/types/microtest";

import { reconcileEggs, type ReconcileDeps } from "./reconcile-eggs";
import { submitQuiz } from "./submit-quiz";
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

function wire(store: MemoryStore): ReconcileDeps {
  const profiles = memoryProfiles(store);
  return {
    profiles,
    matches: memoryMatches(store),
    notifications: memoryNotifications(store),
    scheduler: instantScheduler,
    hatch: { profiles, secret: SECRET, scheduler: instantScheduler },
  };
}

function submitDeps(store: MemoryStore) {
  return {
    profiles: memoryProfiles(store),
    matches: memoryMatches(store),
    notifications: memoryNotifications(store),
    scheduler: instantScheduler,
    latentScorer: (responses: Parameters<typeof scoreLatent>[1]) => scoreLatent(MODEL, responses, MATCHING_CONFIG.quality),
    secret: SECRET,
  };
}

describe("reconcileEggs", () => {
  it("returns zero counts when there are no eggs", async () => {
    const store = new MemoryStore();
    const result = await reconcileEggs(wire(store));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.eggsScanned).toBe(0);
    expect(result.value.hatched).toBe(0);
  });

  it("skips eggs with incomplete core (cohort a)", async () => {
    const store = new MemoryStore();
    store.identities.set(USER_A, {
      estadoIdentidad: "huevo", aliasCompleto: null, aliasAnimal: null, aliasColor: null,
      aliasSufijo: null, animalId: null, colorId: null, mbtiCode: null, enneagramCode: null,
      narrative: null, mark: null, revelacionVista: false, quizCompletedAt: null,
    });
    // No answers stored → core incomplete.
    const result = await reconcileEggs(wire(store));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.eggsScanned).toBe(1);
    expect(result.value.notEligible).toBe(1);
    expect(result.value.hatched).toBe(0);
  });

  it("hatches an egg with complete core (cohort b/c self-repair)", async () => {
    const store = new MemoryStore();
    // Submit a full quiz to get scored data, then force back to egg.
    await submitQuiz({ userId: USER_A, submission: fullSubmission(4) }, submitDeps(store));
    const hatched = store.identities.get(USER_A)!;
    store.identities.set(USER_A, { ...hatched, estadoIdentidad: "huevo", aliasCompleto: null, animalId: null, colorId: null });

    const result = await reconcileEggs(wire(store));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.eggsScanned).toBe(1);
    expect(result.value.eligible).toBe(1);
    expect(result.value.hatched).toBe(1);
    expect(result.value.matchesRecomputed).toBe(true);
    expect(store.identities.get(USER_A)!.estadoIdentidad).toBe("eclosionado");
  });

  it("is idempotent: second run finds nothing to do", async () => {
    const store = new MemoryStore();
    await submitQuiz({ userId: USER_A, submission: fullSubmission(3) }, submitDeps(store));
    const hatched = store.identities.get(USER_A)!;
    store.identities.set(USER_A, { ...hatched, estadoIdentidad: "huevo", aliasCompleto: null, animalId: null, colorId: null });

    const deps = wire(store);
    const first = await reconcileEggs(deps);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.hatched).toBe(1);

    const second = await reconcileEggs(deps);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.eggsScanned).toBe(0);
    expect(second.value.hatched).toBe(0);
  });

  it("continues past individual failures", async () => {
    const store = new MemoryStore();
    // USER_A: egg with no answers (not eligible).
    store.identities.set(USER_A, {
      estadoIdentidad: "huevo", aliasCompleto: null, aliasAnimal: null, aliasColor: null,
      aliasSufijo: null, animalId: null, colorId: null, mbtiCode: null, enneagramCode: null,
      narrative: null, mark: null, revelacionVista: false, quizCompletedAt: null,
    });
    // USER_B: egg with complete core (eligible).
    await submitQuiz({ userId: USER_B, submission: fullSubmission(5) }, submitDeps(store));
    const hatchedB = store.identities.get(USER_B)!;
    store.identities.set(USER_B, { ...hatchedB, estadoIdentidad: "huevo", aliasCompleto: null, animalId: null, colorId: null });

    const result = await reconcileEggs(wire(store));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.eggsScanned).toBe(2);
    expect(result.value.notEligible).toBe(1);
    expect(result.value.hatched).toBe(1);
  });

  it("aborts on pool scan failure", async () => {
    const store = new MemoryStore();
    const deps = wire(store);
    const profiles = deps.profiles;
    profiles.listEggUserIds = async () => ({ ok: false, error: "storage.failed" }) as never;

    const result = await reconcileEggs(deps);
    expect(result.ok).toBe(false);
  });
});