import { describe, expect, it } from "vitest";

import { ROMANCE_VECTOR_LENGTH, FRIENDSHIP_VECTOR_LENGTH } from "@/types/microtest";
import type { ScoredProfile } from "@/types/microtest";

import {
  deleteMyData,
  getPrivacyState,
  setProfilePaused,
  setSharedLayers,
  setShowAvatarDetail,
} from "./privacy";
import type { IdentityRecord } from "./ports";
import { MemoryStore, instantScheduler, memoryMatches, memoryProfiles } from "./testing/in-memory";

function profile(): ScoredProfile {
  return {
    rawScores: {} as ScoredProfile["rawScores"],
    normalizedScores: {} as ScoredProfile["normalizedScores"],
    mbtiCode: "INFP",
    hardFilters: { orientacion_sexual: [], identidad_genero: [], tipo_relacion_busca: [] },
    romanceVector: Array.from({ length: ROMANCE_VECTOR_LENGTH }, () => 0.5),
    friendshipVector: Array.from({ length: FRIENDSHIP_VECTOR_LENGTH }, () => 0.5),
    latent: { theta: {}, se: {}, quality: 1, answered: 0 },
  };
}

/** The identity each row carries after eclosion: read from the store, never built here. */
const HATCHED: Record<string, IdentityRecord> = {
  a: {
    estadoIdentidad: "eclosionado",
    aliasCompleto: "zorrito naranja mandarina · DRRS",
    aliasAnimal: "zorrito",
    aliasColor: "naranja mandarina",
    aliasSufijo: "DRRS",
    animalId: "zorrito",
    colorId: "ennea-7",
    mbtiCode: "INFP",
    enneagramCode: "7w6",
    narrative: null,
    mark: "sx",
    revelacionVista: true,
    quizCompletedAt: "2026-10-31T00:00:00.000Z",
  },
  b: {
    estadoIdentidad: "eclosionado",
    aliasCompleto: "pulpito violeta amatista · KMPQ",
    aliasAnimal: "pulpito",
    aliasColor: "violeta amatista",
    aliasSufijo: "KMPQ",
    animalId: "pulpito",
    colorId: "ennea-4",
    mbtiCode: "ENFP",
    enneagramCode: "4w5",
    narrative: null,
    mark: "so",
    revelacionVista: true,
    quizCompletedAt: "2026-10-31T00:00:00.000Z",
  },
};

function setup() {
  const store = new MemoryStore();
  for (const userId of ["a", "b"]) {
    store.results.set(userId, { userId, answers: [], completedModules: [], scored: profile(), narrative: null });
    store.identities.set(userId, HATCHED[userId]!);
  }
  const deps = {
    profiles: memoryProfiles(store),
    matches: memoryMatches(store),
    scheduler: instantScheduler,
  };
  return { store, deps };
}

describe("privacy use cases", () => {
  it("pauses: leaves the pool and republishes matches", async () => {
    const { store, deps } = setup();
    const result = await setProfilePaused("a", true, deps);
    expect(result).toEqual({ ok: true, value: { paused: true, recomputePending: false } });
    expect(store.pool().map((p) => p.userId)).toEqual(["b"]);
    expect(await getPrivacyState("a", deps)).toEqual({ ok: true, value: { paused: true, showAvatarDetail: false, sharedLayers: [] } });
  });

  it("resumes: rejoins the pool", async () => {
    const { store, deps } = setup();
    await setProfilePaused("a", true, deps);
    await setProfilePaused("a", false, deps);
    expect(store.pool().map((p) => p.userId).sort()).toEqual(["a", "b"]);
  });

  it("deletes: removes the profile and republishes", async () => {
    const { store, deps } = setup();
    const result = await deleteMyData("a", deps);
    expect(result).toEqual({ ok: true, value: { recomputePending: false } });
    expect(store.results.has("a")).toBe(false);
  });

  it("toggles the avatar detail opt-in without touching the pool", async () => {
    const { store, deps } = setup();
    const version = store.version;
    expect(await setShowAvatarDetail("a", true, deps)).toEqual({ ok: true, value: undefined });
    expect(await getPrivacyState("a", deps)).toEqual({ ok: true, value: { paused: false, showAvatarDetail: true, sharedLayers: [] } });
    expect(store.version).toBe(version);
  });

  it("stores shared layers deduplicated, in canonical order, without touching the pool", async () => {
    const { store, deps } = setup();
    const version = store.version;
    expect(await getPrivacyState("a", deps)).toMatchObject({ value: { sharedLayers: [] } });
    expect(await setSharedLayers("a", ["valores", "hexaco", "valores"], deps)).toEqual({ ok: true, value: ["hexaco", "valores"] });
    expect(await getPrivacyState("a", deps)).toMatchObject({ value: { sharedLayers: ["hexaco", "valores"] } });
    expect(await setSharedLayers("a", [], deps)).toEqual({ ok: true, value: [] });
    expect(store.version).toBe(version);
  });

  it("surfaces storage failures without recomputing", async () => {
    const { store, deps } = setup();
    store.faults.save = true;
    expect(await deleteMyData("a", deps)).toEqual({ ok: false, error: "storage.failed" });
    expect(store.results.has("a")).toBe(true);
  });
});
