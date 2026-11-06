import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { NO_MATCH_MESSAGE } from "@/domain/messages/notification-copy";
import { MATCHING_CONFIG, pairScore } from "@/domain/matching";
import type { LatentProfile } from "@/types/latent";

import { getResult, type GetResultDeps } from "./get-result";
import type { CounterpartProfile, OwnProfile, StoredMatch } from "./ports";
import { MemoryStore, memoryMatches, memoryProfiles } from "./testing/in-memory";

const VIEWER = "00000000-0000-4000-8000-00000000000a";
const OTHER = "00000000-0000-4000-8000-00000000000b";

/** Posteriors with distinctive values so a leak would be detectable in the JSON. */
function latent(shift: number): LatentProfile {
  const factors = [...new Set(Object.values(MATCHING_CONFIG.categories).flatMap((c) => Object.keys(c.factors)))];
  const theta = Object.fromEntries(factors.map((f, i) => [f, 0.123456 + shift + ((i * 37) % 11) / 10 - 0.5]));
  const se = Object.fromEntries(factors.map((f) => [f, 0.654321]));
  return { theta, se, quality: 1, answered: 60 };
}
const OWN_LATENT = latent(0);
const OTHER_LATENT = latent(0.2);

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

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
  latent: OWN_LATENT,
  normalizedScores: null,
  completedModules: [],
};

const COUNTERPART: CounterpartProfile = {
  userId: OTHER,
  estadoIdentidad: "eclosionado",
  aliasCompleto: "pulpito violeta amatista claro · KMPQ",
  aliasAnimal: "pulpito",
  aliasColor: "violeta amatista claro",
  aliasSufijo: "KMPQ",
  mbtiCode: "ENFP",
  enneagramCode: "4w5",
  latent: OTHER_LATENT,
  animalId: "pulpito",
  colorId: "ennea-4-w5",
  mark: "so",
  showAvatarDetail: false,
  sharedLayers: [],
};

const MATCH: StoredMatch = {
  track: "amistad",
  otherUser: OTHER,
  similarity: 0.87,
  badges: [{ dimension: "personalidad_apertura", affinity: 0.9 }],
};

function wire(store: MemoryStore): GetResultDeps {
  return { profiles: memoryProfiles(store), matches: memoryMatches(store), digest: sha256 };
}

describe("getResult", () => {
  it("reports quiz.not_completed when the viewer has no profile", async () => {
    await expect(getResult(VIEWER, wire(new MemoryStore()))).resolves.toEqual({
      ok: false,
      error: "quiz.not_completed",
    });
  });

  it("returns an empty, well-formed result with the no-match copy", async () => {
    const store = new MemoryStore();
    store.own = OWN;
    const result = await getResult(VIEWER, wire(store));
    expect(result.ok && result.value).toMatchObject({
      identity: { aliasCompleto: OWN.identity.aliasCompleto },
      matches: { romance: [], amistad: [] },
      few_people: true,
      no_match_message: NO_MATCH_MESSAGE,
    });
  });

  it("exposes only a coarse few-people flag, never the pool size", async () => {
    const store = new MemoryStore();
    store.own = OWN;
    const result = await getResult(VIEWER, wire(store));
    if (!result.ok) throw new Error("expected ok");
    expect(typeof result.value.few_people).toBe("boolean");
    expect(Object.keys(result.value)).not.toContain("pool_size");
  });

  it("never leaks the counterpart user id and keeps handles stable per viewer", async () => {
    const store = new MemoryStore();
    store.own = OWN;
    store.stored = [MATCH];
    store.counterparts = [COUNTERPART];
    const first = await getResult(VIEWER, wire(store));
    const again = await getResult(VIEWER, wire(store));
    const other = await getResult(OTHER, wire(store));
    if (!first.ok || !again.ok || !other.ok) throw new Error("expected ok");

    expect(JSON.stringify(first.value)).not.toContain(OTHER);
    const handle = first.value.matches.amistad[0]?.id;
    expect(handle).toMatch(/^[0-9a-f]{16}$/);
    expect(again.value.matches.amistad[0]?.id).toBe(handle);
    expect(other.value.matches.amistad[0]?.id).not.toBe(handle);
  });

  it("builds an explanation when both posteriors exist and degrades otherwise", async () => {
    const store = new MemoryStore();
    store.own = OWN;
    store.stored = [MATCH];
    store.counterparts = [COUNTERPART];
    const full = await getResult(VIEWER, wire(store));
    expect(full.ok && full.value.matches.amistad[0]?.explanation).not.toBeNull();

    store.counterparts = [{ ...COUNTERPART, latent: null }];
    const degraded = await getResult(VIEWER, wire(store));
    expect(degraded.ok && degraded.value.matches.amistad[0]?.explanation).toBeNull();
    expect(degraded.ok && degraded.value.matches.amistad[0]?.identity.colorHex).toBe("#9D56C7");
  });

  it("hides the counterpart's wing tone and subtype mark unless they opted in", async () => {
    const store = new MemoryStore();
    store.own = OWN;
    store.stored = [MATCH];
    store.counterparts = [COUNTERPART];
    const hidden = await getResult(VIEWER, wire(store));
    if (!hidden.ok) throw new Error("expected ok");
    expect(hidden.value.matches.amistad[0]).toMatchObject({
      identity: { colorId: "ennea-4", colorHex: "#9D56C7", mark: null },
    });
    expect(JSON.stringify(hidden.value)).not.toContain("ennea-4-w5");

    store.counterparts = [{ ...COUNTERPART, showAvatarDetail: true }];
    const shown = await getResult(VIEWER, wire(store));
    if (!shown.ok) throw new Error("expected ok");
    expect(shown.value.matches.amistad[0]).toMatchObject({ identity: { colorId: "ennea-4-w5", mark: "so" } });
  });

  it("always shows the viewer their own full avatar", async () => {
    const store = new MemoryStore();
    store.own = OWN;
    const result = await getResult(VIEWER, wire(store));
    expect(result.ok && result.value.identity.mark).toBe("sx");
  });

  it("splits matches by track", async () => {
    const store = new MemoryStore();
    store.own = OWN;
    store.stored = [MATCH, { ...MATCH, track: "romance", similarity: 0.91 }];
    store.counterparts = [COUNTERPART];
    const result = await getResult(VIEWER, wire(store));
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.matches.romance).toHaveLength(1);
    expect(result.value.matches.amistad).toHaveLength(1);
    expect(result.value.matches.romance[0]?.similarity).toBe(0.91);
  });

  it("explains with the model's own numbers: points sum to the recomputed score", async () => {
    const store = new MemoryStore();
    store.own = OWN;
    store.stored = [MATCH, { ...MATCH, track: "romance" }];
    store.counterparts = [COUNTERPART];
    const result = await getResult(VIEWER, wire(store));
    if (!result.ok) throw new Error("expected ok");
    for (const track of ["romance", "amistad"] as const) {
      const explanation = result.value.matches[track][0]?.explanation;
      if (!explanation) throw new Error("expected explanation");
      const score = pairScore(OWN_LATENT, OTHER_LATENT, MATCHING_CONFIG.tracks[track], MATCHING_CONFIG.categories);
      const byId = new Map(score.categories.map((c) => [c.id, c]));
      for (const c of explanation.connects) {
        expect(c.points).toBeCloseTo(byId.get(c.category)!.contribution * 100, 1);
        expect(c.percentage).toBe(Math.round(byId.get(c.category)!.similarity * 100));
      }
      const identity = score.categories.filter((c) => c.id === "mbti" || c.id === "eneagrama");
      expect(explanation.talk.points).toBeCloseTo(identity.reduce((s, c) => s + c.contribution, 0) * 100, 1);
      expect(explanation.connects.map((c) => c.category)).not.toContain("mbti");
    }
  });

  it("shares nothing beyond alias, animal and colour by default (ADR-030)", async () => {
    const store = new MemoryStore();
    store.own = OWN;
    store.stored = [MATCH];
    store.counterparts = [COUNTERPART];
    const result = await getResult(VIEWER, wire(store));
    const entry = result.ok ? result.value.matches.amistad[0] : undefined;
    expect(entry?.shared).toEqual({ sections: [], mbti: null, enneagram: null });
    expect(entry?.identity.mbtiCode).toBe("ENFP");
    expect(entry?.identity.enneagramCode).toBe("4");
    expect(entry?.identity.mark).toBeNull();
  });

  it("shows only the chosen layers, as bands, and never the never-share scales", async () => {
    const store = new MemoryStore();
    store.own = OWN;
    store.stored = [MATCH];
    store.counterparts = [{ ...COUNTERPART, sharedLayers: ["hexaco", "valores", "mbti"] }];
    const result = await getResult(VIEWER, wire(store));
    const entry = result.ok ? result.value.matches.amistad[0] : undefined;
    expect(entry?.shared.sections.map((s) => s.id)).toEqual(["hexaco", "mbti", "valores"]);
    expect(entry?.shared.mbti).toEqual({ code: "ENFP" });
    expect(entry?.identity.mbtiCode).toBe("ENFP");
    expect(entry?.shared.enneagram).toBeNull();
    const keys = entry?.shared.sections.flatMap((s) => s.scales.map((x) => x.key)) ?? [];
    for (const hidden of ["val_espiritualidad", "soc_politica", "act_igualdad", "rel_exclusividad", "meta_crianza"]) {
      expect(keys).not.toContain(hidden);
    }
    for (const scale of entry?.shared.sections.flatMap((s) => s.scales) ?? []) {
      expect(Object.keys(scale).sort()).toEqual(["confidence", "high", "key", "label", "leaning", "low"]);
    }
    const json = JSON.stringify(entry?.shared);
    expect(json).not.toMatch(/position|range|theta|orientacion|identidad_genero|tipo_relacion/);
  });

  it("reveals the shared enneagram wing only with the avatar-detail opt-in", async () => {
    const store = new MemoryStore();
    store.own = OWN;
    store.stored = [MATCH];
    const ennea = { ...OTHER_LATENT, theta: { ...OTHER_LATENT.theta }, se: { ...OTHER_LATENT.se } };
    for (let t = 1; t <= 9; t++) {
      ennea.theta[`ennea_${t}`] = t === 4 ? 2.5 : t === 5 ? 1.2 : -0.5;
      ennea.se[`ennea_${t}`] = 0.5;
    }
    store.counterparts = [{ ...COUNTERPART, latent: ennea, sharedLayers: ["eneagrama"] }];
    const plain = await getResult(VIEWER, wire(store));
    expect(plain.ok && plain.value.matches.amistad[0]?.shared.enneagram?.code).toBe("4");
    store.counterparts = [{ ...COUNTERPART, latent: ennea, sharedLayers: ["eneagrama"], showAvatarDetail: true }];
    const detailed = await getResult(VIEWER, wire(store));
    expect(detailed.ok && detailed.value.matches.amistad[0]?.shared.enneagram?.code).toBe("4w5");
  });

  it("gives per-layer affinity as bands from the exact score, never numbers", async () => {
    const store = new MemoryStore();
    store.own = OWN;
    store.stored = [MATCH];
    store.counterparts = [COUNTERPART];
    const result = await getResult(VIEWER, wire(store));
    const layers = result.ok ? (result.value.matches.amistad[0]?.layers ?? []) : [];
    const score = pairScore(OWN_LATENT, OTHER_LATENT, MATCHING_CONFIG.tracks.amistad, MATCHING_CONFIG.categories);
    expect(layers.length).toBe(score.categories.filter((c) => c.id !== "mbti" && c.id !== "eneagrama").length);
    for (const layer of layers) {
      expect(["alta", "media", "baja"]).toContain(layer.band);
      expect([1, 2, 3]).toContain(layer.strength);
      expect(Object.keys(layer).sort()).toEqual(["band", "category", "label", "strength"]);
    }
    expect(layers[0]?.strength).toBe(3);

    store.counterparts = [{ ...COUNTERPART, latent: null }];
    const degraded = await getResult(VIEWER, wire(store));
    expect(degraded.ok && degraded.value.matches.amistad[0]?.layers).toEqual([]);
  });

  it("never serializes posteriors, vectors or answers", async () => {
    const store = new MemoryStore();
    store.own = OWN;
    store.stored = [MATCH];
    store.counterparts = [{ ...COUNTERPART, sharedLayers: ["hexaco", "big_five", "mbti", "eneagrama", "valores", "relacional", "afecto", "estilo"] }];
    const result = await getResult(VIEWER, wire(store));
    const json = JSON.stringify(result);
    for (const leak of ["theta", '"se"', "0.654321", "0.123456", "latent", "vector", "answers"]) {
      expect(json).not.toContain(leak);
    }
  });

  it("drops a counterpart given a soft delete, match row and all", async () => {
    const store = new MemoryStore();
    store.own = OWN;
    store.stored = [MATCH];
    store.counterparts = [COUNTERPART];

    const before = await getResult(VIEWER, wire(store));
    expect(before.ok && before.value.matches.amistad).toHaveLength(1);

    // `eliminado_en` is set and the account still exists: the purge has not
    // run yet, so the `matches` row is still there. Nothing may spell that
    // person's name any more — not the sky, not the carta, not a star.
    store.softDeleted.add(OTHER);
    const after = await getResult(VIEWER, wire(store));
    if (!after.ok) throw new Error("expected ok");
    expect(after.value.matches.amistad).toEqual([]);
    expect(after.value.matches.romance).toEqual([]);
    expect(JSON.stringify(after.value)).not.toContain(COUNTERPART.aliasCompleto ?? "");
    expect(after.value.identity.aliasCompleto).toBe(OWN.identity.aliasCompleto);
  });
});
