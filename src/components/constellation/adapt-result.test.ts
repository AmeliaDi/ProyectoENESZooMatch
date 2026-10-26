import { describe, expect, it } from "vitest";

import type { MatchExplanation } from "@/lib/explainability";
import type { CompatibilityBadge } from "@/types/microtest";
import type { PublicResult, ResultMatch } from "@/components/public-experience-utils";

import {
  SELF_NODE_ID,
  adaptResult,
  resolveAnimalId,
  resolveColor,
} from "./adapt-result";

// ─── Fixtures (real catalogue ids from data/arquetipos.json) ──────

const BADGE: CompatibilityBadge = {
  dimension: "valores_empatia",
  label: "Empatía",
  affinity: 0.9,
  icon: "💜",
};

function makeMatch(overrides: Partial<ResultMatch> = {}): ResultMatch {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    alias: "mantisita rosa · 9QW2",
    animal: "mantisita",
    animal_id: "mantisita",
    color: "verde esmeralda",
    color_id: "verde-esmeralda",
    color_hex: "#50C878",
    mbti_code: "ENFP",
    similarity: 0.87,
    badges: [BADGE],
    narrative: "Dos criaturas que se reconocen.",
    explanation: null,
    ...overrides,
  };
}

function makeResult(overrides: Partial<PublicResult> = {}): PublicResult {
  return {
    alias: "ajolotito verde esmeralda · 4K2P",
    animal: { id: "ajolotito", diminutivo_es: "ajolotito", categoria_fauna: "anfibio" },
    color: { id: "verde-esmeralda", nombre: "Verde esmeralda", hex: "#50C878" },
    narrative: "Eres un ajolotito con una capacidad infinita de regenerar.",
    mbti_code: "ENFJ",
    matches: { romance: [makeMatch()], amistad: [] },
    no_match_message: "mensaje",
    ...overrides,
  };
}

// ─── Resolution helpers ───────────────────────────────────────────────────────

describe("resolveAnimalId", () => {
  it("accepts an exact catalogue id", () => {
    expect(resolveAnimalId("ajolotito", null)).toBe("ajolotito");
  });

  it("resolves by diminutivo, accent- and case-insensitively", () => {
    expect(resolveAnimalId(null, "Mantisita")).toBe("mantisita");
    expect(resolveAnimalId(null, "ajolotito")).toBe("ajolotito");
  });

  it("resolves by nombre_fuente", () => {
    expect(resolveAnimalId(null, "Axolotl")).toBe("ajolotito");
  });

  it("returns null for an unknown animal", () => {
    expect(resolveAnimalId(null, "unicornio-rosa")).toBeNull();
    expect(resolveAnimalId("no-existe", "tampoco")).toBeNull();
  });
});

describe("resolveColor", () => {
  it("accepts an exact catalogue id and keeps a valid payload hex", () => {
    expect(resolveColor("verde-esmeralda", null, "#50C878")).toEqual({
      colorId: "verde-esmeralda",
      colorHex: "#50C878",
    });
  });

  it("resolves by nombre, case-insensitively", () => {
    expect(resolveColor(null, "verde esmeralda", null)?.colorId).toBe("verde-esmeralda");
  });

  it("falls back to the catalogue hex when the payload hex is invalid", () => {
    const resolved = resolveColor("verde-esmeralda", null, "not-a-hex");
    expect(resolved?.colorId).toBe("verde-esmeralda");
    expect(resolved?.colorHex).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it("resolves by nearest hex when no id or name matches", () => {
    // One unit off the catalogue green must still land on verde-esmeralda.
    expect(resolveColor(null, null, "#50C879")?.colorId).toBe("verde-esmeralda");
  });

  it("returns null when nothing is usable", () => {
    expect(resolveColor(null, null, null)).toBeNull();
  });
});

// ─── adaptResult ──────────────────────────────────────────────────────────────

describe("adaptResult", () => {
  it("maps the self identity into a centred node without similarity/track/badges", () => {
    const adapted = adaptResult(makeResult());
    expect(adapted).not.toBeNull();
    const me = adapted!.me;
    expect(me.id).toBe(SELF_NODE_ID);
    expect(me.animalId).toBe("ajolotito");
    expect(me.colorId).toBe("verde-esmeralda");
    expect(me.colorHex).toBe("#50C878");
    expect(me.alias).toBe("ajolotito verde esmeralda · 4K2P");
    expect(me.mbtiCode).toBe("ENFJ");
    // The self node must not carry match-only fields.
    expect("similarity" in me).toBe(false);
    expect("track" in me).toBe(false);
    expect("badges" in me).toBe(false);
    expect("explanation" in me).toBe(false);
    // Vectors are never forwarded.
    expect("selfVector" in me).toBe(false);
    expect("matchVector" in me).toBe(false);
  });

  it("capitalises the animal name and lowercases the colour name", () => {
    const me = adaptResult(makeResult())!.me;
    expect(me.animalName).toBe("Ajolotito");
    expect(me.colorName).toBe("verde esmeralda");
  });

  it("maps a match with its real track, similarity, badges, explanation and opaque id", () => {
    const explanation = { headline: "chispa" } as unknown as MatchExplanation;
    const adapted = adaptResult(
      makeResult({
        matches: { romance: [makeMatch({ explanation })], amistad: [] },
      }),
    )!;
    expect(adapted.matches).toHaveLength(1);
    const match = adapted.matches[0];
    expect(match.id).toBe("11111111-1111-1111-1111-111111111111");
    expect(match.track).toBe("romance");
    expect(match.similarity).toBeCloseTo(0.87, 12);
    expect(match.animalId).toBe("mantisita");
    expect(match.colorId).toBe("verde-esmeralda");
    expect(match.badges).toEqual([BADGE]);
    expect(match.explanation).toBe(explanation);
    expect(match.mbtiCode).toBe("ENFP");
    // The adapter must not sneak the self/ghost flags onto a match input.
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

  it("resolves ids from names when the explicit ids are missing", () => {
    const adapted = adaptResult(
      makeResult({
        matches: {
          romance: [
            makeMatch({ animal_id: undefined, color_id: undefined, color_hex: undefined }),
          ],
          amistad: [],
        },
      }),
    )!;
    expect(adapted.matches).toHaveLength(1);
    expect(adapted.matches[0].animalId).toBe("mantisita");
    expect(adapted.matches[0].colorId).toBe("verde-esmeralda");
  });

  it("resolves a colour by nearest hex when only a hex is supplied", () => {
    const adapted = adaptResult(
      makeResult({
        matches: {
          romance: [
            makeMatch({ color_id: undefined, color: "", color_hex: "#50C879" }),
          ],
          amistad: [],
        },
      }),
    )!;
    expect(adapted.matches[0].colorId).toBe("verde-esmeralda");
  });

  it("skips a match whose animal cannot be resolved, keeping the rest", () => {
    const adapted = adaptResult(
      makeResult({
        matches: {
          romance: [
            makeMatch({ id: "good" }),
            makeMatch({ id: "bad", animal: "unicornio", animal_id: "no-existe" }),
          ],
          amistad: [],
        },
      }),
    )!;
    expect(adapted.matches).toHaveLength(1);
    expect(adapted.matches[0].id).toBe("good");
  });

  it("supports explanation: null and an empty match list (self-only sky)", () => {
    const adapted = adaptResult(
      makeResult({ matches: { romance: [], amistad: [] } }),
    )!;
    expect(adapted.matches).toEqual([]);
    expect(adapted.me.id).toBe(SELF_NODE_ID);

    const nullExplanation = adaptResult(
      makeResult({ matches: { romance: [makeMatch({ explanation: null })], amistad: [] } }),
    )!;
    expect(nullExplanation.matches[0].explanation).toBeNull();
  });

  it("returns null when the self identity cannot be resolved", () => {
    expect(
      adaptResult(
        makeResult({
          animal: { id: "no-existe", diminutivo_es: "unicornio", categoria_fauna: "?" },
        }),
      ),
    ).toBeNull();
  });

  it("falls back to a synthetic id when the API omits other_user", () => {
    const adapted = adaptResult(
      makeResult({
        matches: { romance: [makeMatch({ id: undefined })], amistad: [] },
      }),
    )!;
    expect(adapted.matches[0].id).toBe("romance-0");
  });
});
