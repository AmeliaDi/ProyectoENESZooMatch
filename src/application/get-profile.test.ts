import { describe, expect, it } from "vitest";

import { SELF_READING } from "@/config/self-reading";



import { getProfile, type GetProfileDeps } from "./get-profile";
import type { CounterpartProfile, OwnProfile, StoredMatch } from "./ports";
import { MemoryStore, memoryMatches, memoryProfiles } from "./testing/in-memory";
import { ConversationStore, memoryConversations } from "./testing/memory-conversations";
import { badgeAttempts, memoryBadges } from "./testing/memory-badges";
import type { BadgeDeps } from "./profile-badges";

const VIEWER = "00000000-0000-4000-8000-00000000000a";
const FACTORS = SELF_READING.sections.flatMap((s) => s.scales.map((x) => x.factor));

const OWN: OwnProfile = {
  identity: {
    estadoIdentidad: "eclosionado",
    aliasCompleto: "zorrito naranja mandarina · DRRS",
    aliasAnimal: "zorrito",
    aliasColor: "naranja mandarina",
    aliasSufijo: "DRRS",
    animalId: "zorrito",
    colorId: "ennea-7",
    mbtiCode: "INFP",
    enneagramCode: "7w6",
    narrative: "Una narrativa",
    mark: "sx",
    revelacionVista: false,
    quizCompletedAt: "2026-10-31T00:00:00.000Z",
  },
  narrative: "Una narrativa",
  animal: { id: "zorrito", diminutivo_es: "zorrito", categoria_fauna: "mamifero" },
  color: { id: "ennea-7", nombre: "Naranja mandarina", hex: "#C05722" },
  latent: {
    theta: Object.fromEntries(FACTORS.map((f, i) => [f, i % 2 === 0 ? 1.3 : -0.2])),
    se: Object.fromEntries(FACTORS.map((f) => [f, 0.55])),
    quality: 0.9,
    answered: 60,
  },
  normalizedScores: null,
  completedModules: [],
};

const match = (similarity: number, i: number): StoredMatch => ({
  track: "amistad",
  otherUser: `00000000-0000-4000-8000-0000000000${10 + i}`,
  similarity,
  badges: [],
});

/** The counterpart as the pool stores them: their own frozen identity, no names invented here. */
const counterpart = (i: number): CounterpartProfile => ({
  userId: `00000000-0000-4000-8000-0000000000${10 + i}`,
  estadoIdentidad: "eclosionado",
  aliasCompleto: `pulpito violeta amatista · KMP${i}`,
  aliasAnimal: "pulpito",
  aliasColor: "violeta amatista",
  aliasSufijo: `KMP${i}`,
  mbtiCode: "ENFP",
  enneagramCode: "4w5",
  latent: null,
  animalId: "pulpito",
  colorId: "ennea-4",
  mark: "so",
  showAvatarDetail: false,
  sharedLayers: [],
});

function wire(store: MemoryStore, badges?: BadgeDeps): GetProfileDeps {
  return {
    profiles: memoryProfiles(store),
    matches: memoryMatches(store),
    badges: badges ?? memoryBadges(memoryConversations(new ConversationStore())),
  };
}

describe("getProfile", () => {
  it("reports quiz.not_completed without a profile", async () => {
    await expect(getProfile(VIEWER, wire(new MemoryStore()))).resolves.toEqual({ ok: false, error: "quiz.not_completed" });
  });

  it("never leaks raw latent values, vectors, answers or other user ids", async () => {
    const store = new MemoryStore();
    store.own = OWN;
    store.stored = [match(0.8, 1)];
    store.counterparts = [counterpart(1)];
    const result = await getProfile(VIEWER, wire(store));
    if (!result.ok) throw new Error("expected ok");
    const json = JSON.stringify(result.value);
    for (const banned of ["theta", "\"se\"", "vector", "answers", "otherUser", "00000000-0000-4000-8000-000000000011"]) {
      expect(json).not.toContain(banned);
    }
    expect(result.value.virtues.length).toBeGreaterThan(0);
  });

  it("sorts affinities by similarity and keeps the configured top", async () => {
    const store = new MemoryStore();
    store.own = OWN;
    store.stored = [0.71, 0.93, 0.8, 0.88, 0.75].map(match);
    store.counterparts = [0, 1, 2, 3, 4].map(counterpart);
    const result = await getProfile(VIEWER, wire(store));
    if (!result.ok) throw new Error("expected ok");
    const { amistad, romance } = result.value.affinities;
    expect(amistad.count).toBe(5);
    expect(amistad.top.map((a) => a.percent)).toEqual([93, 88, 80].slice(0, SELF_READING.affinitiesTop));
    expect(romance).toEqual({ count: 0, top: [] });
  });

  it("falls back to the prior (all open) when no latent profile is stored", async () => {
    const store = new MemoryStore();
    store.own = { ...OWN, latent: null };
    const result = await getProfile(VIEWER, wire(store));
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.openScales.open).toBe(result.value.openScales.total);
    expect(result.value.virtues).toEqual([]);
  });

  it("carries the derived grid as ids only, with the match counted from the same read", async () => {
    const store = new MemoryStore();
    store.own = OWN;
    store.stored = [match(0.8, 1)];
    store.counterparts = [counterpart(1)];
    const day = 86_400_000;
    const now = new Date("2026-11-10T12:00:00-06:00");
    const badges = memoryBadges(
      memoryConversations(new ConversationStore()),
      ["gustos", "gaming", "vida"].map((quiz, i) => badgeAttempts(quiz, new Date(now.getTime() - i * day))),
      () => now,
    );
    const result = await getProfile(VIEWER, wire(store, badges));
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.unlockedBadges).toEqual(["primer_match", "tres_rompehielos"]);
    expect(JSON.stringify(result.value.unlockedBadges)).not.toContain("00000000");
  });

  it("says nothing about logros when the badge read fails, instead of counting zero", async () => {
    const store = new MemoryStore();
    store.own = OWN;
    const broken = memoryBadges(memoryConversations(new ConversationStore()), [], () => new Date(), true);
    const result = await getProfile(VIEWER, wire(store, broken));
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.unlockedBadges).toBeNull();
  });

});
