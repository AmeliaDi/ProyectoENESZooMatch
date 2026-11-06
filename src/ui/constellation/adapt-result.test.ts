import { describe, expect, it } from "vitest";

import { CATALOG_COLORS } from "@/config";
import type { IdentityDto } from "@/contracts/identity";
import type { MatchEntryDto, MatchExplanation, ResultDto } from "@/contracts/result";
import { EGG_IDENTITY } from "@/ui/shared/parse-identity";

import { SELF_NODE_ID, adaptResult } from "./adapt-result";

// ─── Fixtures (real catalogue ids from data/arquetipos.json) ──────────────────

/** The wire badge: dimension + affinity only (labels are the client's job). */
const WIRE_BADGE = { dimension: "valores_empatia", affinity: 0.9 };

/** A frozen, hatched identity — the only route to a name or a sprite. */
function makeIdentity(overrides: Partial<IdentityDto> = {}): IdentityDto {
  return {
    estadoIdentidad: "eclosionado",
    aliasCompleto: "mantisita rosa pastel · 9QW2",
    aliasAnimal: "mantisita",
    aliasColor: "rosa pastel",
    aliasSufijo: "9QW2",
    animalId: "mantisita",
    colorId: "ennea-3",
    colorHex: "#f7c8dd",
    mbtiCode: "ENFP",
    enneagramCode: null,
    enneagramName: null,
    mark: "sp",
    revelacionVista: true,
    huevitoSeed: null,
    ...overrides,
  };
}

const SELF_IDENTITY = makeIdentity({
  aliasCompleto: "ajolotito verde bosque · 4K2P",
  aliasAnimal: "ajolotito",
  aliasColor: "verde bosque",
  aliasSufijo: "4K2P",
  animalId: "ajolotito",
  colorId: "ennea-6",
  colorHex: "#338547",
  mbtiCode: "ENFJ",
  mark: "sx",
});

function makeMatch(overrides: Partial<MatchEntryDto> = {}): MatchEntryDto {
  return {
    id: "opaque-handle-1",
    identity: makeIdentity(),
    similarity: 0.87,
    chemistry: {
      percentage: 87,
      displayText: "87% de Compatibilidad",
      level: "quimica_fuerte",
      levelLabel: "Química fuerte",
      threshold: 0.78,
      relativePosition: 0.4,
    },
    badges: [WIRE_BADGE],
    explanation: null,
    layers: [],
    shared: { sections: [], mbti: null, enneagram: null },
    ...overrides,
  };
}

function makeResult(overrides: Partial<ResultDto> = {}): ResultDto {
  return {
    identity: SELF_IDENTITY,
    narrative: "Eres un ajolotito con una capacidad infinita de regenerar.",
    matches: { romance: [makeMatch()], amistad: [] },
    few_people: false,
    no_match_message: "mensaje",
    ...overrides,
  };
}

// ─── adaptResult ──────────────────────────────────────────────────────────────

describe("adaptResult · the self node", () => {
  it("centres the sky on the stored identity, with no match-only fields", () => {
    const adapted = adaptResult(makeResult());
    expect(adapted).not.toBeNull();
    const me = adapted!.me;

    expect(me.id).toBe(SELF_NODE_ID);
    expect(me.identity).toBe(SELF_IDENTITY);
    expect(me.animalId).toBe("ajolotito");
    expect(me.colorId).toBe("ennea-6");
    expect(me.colorHex).toBe("#338547");
    expect(me.mark).toBe("sx");
    expect("similarity" in me).toBe(false);
    expect("track" in me).toBe(false);
    expect("badges" in me).toBe(false);
    expect("explanation" in me).toBe(false);
    expect("selfVector" in me).toBe(false);
  });

  it("copies the identity ids instead of re-deriving them from names", () => {
    // An alias that disagrees with the ids is exactly the old bug: the sprite
    // must follow the stored ids, and the label must follow the stored alias.
    const me = adaptResult(
      makeResult({
        identity: makeIdentity({
          aliasCompleto: "tortuguita gris neblina · DRRS",
          animalId: "tortuguita",
          colorId: "ennea-9",
        }),
      }),
    )!.me;

    expect(me.animalId).toBe("tortuguita");
    expect(me.colorId).toBe("ennea-9");
    expect(Object.keys(me).sort()).toEqual([
      "animalId",
      "colorHex",
      "colorId",
      "id",
      "identity",
      "mark",
    ]);
  });

  it("gives the self node the catalogue hex of its colour id when the identity has none", () => {
    const me = adaptResult(
      makeResult({ identity: makeIdentity({ colorHex: null, colorId: "ennea-6" }) }),
    )!.me;

    expect(me.colorHex).toBe(CATALOG_COLORS.find((color) => color.id === "ennea-6")?.hex);
    expect(me.identity.colorHex).toBeNull();
  });

  it("degrades an unknown colour id to the neutral sky hex", () => {
    const me = adaptResult(
      makeResult({ identity: makeIdentity({ colorHex: null, colorId: "no-existe" }) }),
    )!.me;

    expect(me.colorHex).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it("returns null when the owner is an egg, so no centre star can be an egg", () => {
    expect(adaptResult(makeResult({ identity: EGG_IDENTITY }))).toBeNull();
    expect(adaptResult(makeResult({ identity: makeIdentity({ animalId: null }) }))).toBeNull();
    expect(adaptResult(makeResult({ identity: makeIdentity({ colorId: null }) }))).toBeNull();
  });
});

describe("adaptResult · the match nodes", () => {
  it("maps a match with its real track, similarity, badges, explanation and opaque id", () => {
    const explanation = { headline: "chispa" } as unknown as MatchExplanation;
    const match = adaptResult(
      makeResult({ matches: { romance: [makeMatch({ explanation })], amistad: [] } }),
    )!.matches[0]!;

    expect(match.id).toBe("opaque-handle-1");
    expect(match.track).toBe("romance");
    expect(match.similarity).toBeCloseTo(0.87, 12);
    expect(match.identity.animalId).toBe("mantisita");
    expect(match.animalId).toBe("mantisita");
    expect(match.colorId).toBe("ennea-3");
    expect(match.mark).toBe("sp");
    // Badge wording always comes from the shared local map, never from the payload.
    expect(match.badges).toEqual([
      { dimension: "valores_empatia", label: "Empatía", affinity: 0.9, icon: "valores_relacionales" },
    ]);
    expect(match.explanation).toBe(explanation);
    expect(match.chemistry?.levelLabel).toBe("Química fuerte");
    expect("isSelf" in match).toBe(false);
    expect("isGhost" in match).toBe(false);
  });

  it("puts BOTH tracks into one array, tagged with their track", () => {
    const adapted = adaptResult(
      makeResult({
        matches: {
          romance: [makeMatch({ id: "r1" })],
          amistad: [makeMatch({ id: "a1" }), makeMatch({ id: "a2" })],
        },
      }),
    )!;

    expect(adapted.matches).toHaveLength(3);
    expect(adapted.matches.filter((m) => m.track === "romance")).toHaveLength(1);
    expect(adapted.matches.filter((m) => m.track === "amistad")).toHaveLength(2);
  });

  it("never paints an egg, keeping every hatched counterpart", () => {
    const adapted = adaptResult(
      makeResult({
        matches: {
          romance: [
            makeMatch({ id: "good" }),
            makeMatch({ id: "egg", identity: EGG_IDENTITY }),
            makeMatch({ id: "hatched-without-ids", identity: makeIdentity({ animalId: null }) }),
          ],
          amistad: [makeMatch({ id: "egg-friend", identity: EGG_IDENTITY })],
        },
      }),
    )!;

    expect(adapted.matches.map((m) => m.id)).toEqual(["good"]);
  });

  it("supports explanation: null and an empty match list (self-only sky)", () => {
    const adapted = adaptResult(makeResult({ matches: { romance: [], amistad: [] } }))!;
    expect(adapted.matches).toEqual([]);
    expect(adapted.me.id).toBe(SELF_NODE_ID);

    const nullExplanation = adaptResult(
      makeResult({ matches: { romance: [makeMatch({ explanation: null })], amistad: [] } }),
    )!;
    expect(nullExplanation.matches).toHaveLength(1);
    expect(nullExplanation.matches[0]?.explanation).toBeNull();
  });

  it("layers and shared readings travel with the node untouched", () => {
    const layers = [{ category: "personalidad", label: "Forma de ser", band: "alta", strength: 3 }] as const;
    const shared = { sections: [], mbti: { code: "INFP" }, enneagram: null };
    const match = adaptResult(
      makeResult({ matches: { romance: [makeMatch({ layers: [...layers], shared })], amistad: [] } }),
    )!.matches[0]!;

    expect(match.layers).toEqual([...layers]);
    expect(match.shared).toBe(shared);
  });
});

describe("adaptResult · pseudonymous ids", () => {
  it("derives a stable opaque id when the API omits the handle", () => {
    const first = adaptResult(makeResult({ matches: { romance: [makeMatch({ id: null })], amistad: [] } }))!;
    const again = adaptResult(makeResult({ matches: { romance: [makeMatch({ id: null })], amistad: [] } }))!;
    const id = first.matches[0]!.id;

    expect(id).toBe(again.matches[0]!.id);
    expect(id.startsWith("romance-")).toBe(true);
    expect(id).not.toMatch(/^romance-\d+$/); // never the array index
    expect(id).not.toContain("mantisita");
    expect(id).not.toContain("9QW2");
  });

  it("ignores the order of the payload when deriving synthetic ids", () => {
    const entries = [makeMatch({ id: null }), makeMatch({ id: "", identity: makeIdentity({ aliasCompleto: "gatito azul cobalto · TVVB" }) })];
    const forward = adaptResult(makeResult({ matches: { romance: entries, amistad: [] } }))!;
    const reverse = adaptResult(makeResult({ matches: { romance: [...entries].reverse(), amistad: [] } }))!;

    expect([...forward.matches].sort((a, b) => a.id.localeCompare(b.id)).map((m) => m.id)).toEqual(
      [...reverse.matches].sort((a, b) => a.id.localeCompare(b.id)).map((m) => m.id),
    );
  });

  it("splits the same person into one star per track, never a shared id", () => {
    const adapted = adaptResult(
      makeResult({
        matches: {
          romance: [makeMatch({ id: null })],
          amistad: [makeMatch({ id: null })],
        },
      }),
    )!;

    expect(new Set(adapted.matches.map((m) => m.id)).size).toBe(2);
  });

  it("deduplicates the same handle within a track, keeping the highest similarity", () => {
    const adapted = adaptResult(
      makeResult({
        matches: {
          romance: [
            makeMatch({ id: "dup-1", similarity: 0.65 }),
            makeMatch({ id: "dup-1", similarity: 0.89 }),
          ],
          amistad: [makeMatch({ id: "dup-1", similarity: 0.54 })],
        },
      }),
    )!;
    const romance = adapted.matches.filter((m) => m.track === "romance");

    expect(romance).toHaveLength(1);
    expect(romance[0]?.similarity).toBeCloseTo(0.89, 6);
    expect(adapted.matches.filter((m) => m.track === "amistad")).toHaveLength(1);
  });

  it("collapses two handle-less copies of the same person into one star", () => {
    const adapted = adaptResult(
      makeResult({
        matches: {
          romance: [makeMatch({ id: null, similarity: 0.6 }), makeMatch({ id: "  ", similarity: 0.9 })],
          amistad: [],
        },
      }),
    )!;

    expect(adapted.matches).toHaveLength(1);
    expect(adapted.matches[0]?.similarity).toBeCloseTo(0.9, 6);
  });
});
