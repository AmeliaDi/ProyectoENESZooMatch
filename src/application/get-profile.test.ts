import { describe, expect, it } from "vitest";

import { SELF_READING } from "@/config/self-reading";



import { getProfile, type GetProfileDeps } from "./get-profile";
import type { OwnProfile, StoredMatch } from "./ports";
import { MemoryStore, memoryMatches, memoryProfiles } from "./testing/in-memory";

const VIEWER = "00000000-0000-4000-8000-00000000000a";
const FACTORS = SELF_READING.sections.flatMap((s) => s.scales.map((x) => x.factor));

const OWN: OwnProfile = {
  alias: "zorrito ámbar",
  narrative: "Una narrativa",
  mbtiCode: "INFP",
  animal: { id: "zorrito", diminutivo_es: "zorrito", categoria_fauna: "mamifero" },
  color: { id: "ennea-7", nombre: "Naranja mandarina", hex: "#C05722" },
  mark: "sx",
  latent: {
    theta: Object.fromEntries(FACTORS.map((f, i) => [f, i % 2 === 0 ? 1.3 : -0.2])),
    se: Object.fromEntries(FACTORS.map((f) => [f, 0.55])),
    quality: 0.9,
    answered: 60,
  },
  completedModules: [],
};

const match = (similarity: number, i: number): StoredMatch => ({
  track: "amistad",
  otherUser: `00000000-0000-4000-8000-0000000000${10 + i}`,
  otherAlias: `alias ${i}`,
  otherAnimal: "pulpito",
  otherColor: "Azul abisal",
  similarity,
  badges: [],
});

function wire(store: MemoryStore): GetProfileDeps {
  return { profiles: memoryProfiles(store), matches: memoryMatches(store) };
}

describe("getProfile", () => {
  it("reports quiz.not_completed without a profile", async () => {
    await expect(getProfile(VIEWER, wire(new MemoryStore()))).resolves.toEqual({ ok: false, error: "quiz.not_completed" });
  });

  it("never leaks raw latent values, vectors, answers or other user ids", async () => {
    const store = new MemoryStore();
    store.own = OWN;
    store.stored = [match(0.8, 1)];
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

});
