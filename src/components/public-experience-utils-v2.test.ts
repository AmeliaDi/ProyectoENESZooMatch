import { describe, expect, it } from "vitest";

import type { CategoryV2 } from "@/types/microtest-v2";

import {
  CATEGORY_LABELS,
  LIKERT_LABELS_V2,
  NO_MATCH_MESSAGE_V2,
  QUIZ_STORAGE_KEY_V2,
  formatPercentage,
  parsePublicResultV2,
  parseQuizDraftV2,
  type PublicResultV2,
  type ResultMatchV2,
} from "./public-experience-utils-v2";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MAX_BODY_LENGTH = 280;

const EXPECTED_CATEGORIES: CategoryV2[] = [
  "personalidad_bigfive",
  "personalidad_mbti",
  "identidad_filtros",
  "afinidad_cultural",
  "intimidad_afecto",
  "valores_relacionales",
];

function makeMatch(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    alias: "mantisita rosa pastel · 9QW2",
    animal: "mantisita",
    color: "rosa pastel",
    similarity: 0.87,
    badges: [{ dimension: "valores_empatia", label: "ignored", affinity: 0.9, icon: "ignored" }],
    narrative: "Dos criaturas que se reconocen sin explicarse.",
    ...overrides,
  };
}

function makePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    alias: "ajolotito verde esmeralda · 4K2P",
    animal: { id: "ajolotito", diminutivo_es: "ajolotito", categoria_fauna: "anfibio" },
    color: { id: "verde-esmeralda", nombre: "verde esmeralda", hex: "#50C878" },
    narrative: "Eres un ajolotito verde esmeralda con una capacidad infinita de regenerar.",
    mbti_code: "ENFJ",
    matches: { romance: [makeMatch()], amistad: [] },
    no_match_message: NO_MATCH_MESSAGE_V2,
    ...overrides,
  };
}

/** Removes a key entirely (as opposed to setting it to `undefined`). */
function without(payload: Record<string, unknown>, key: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(payload).filter(([entry]) => entry !== key));
}

// ─── Storage key ──────────────────────────────────────────────────────────────

describe("QUIZ_STORAGE_KEY_V2", () => {
  it("is the versioned local-storage key", () => {
    expect(QUIZ_STORAGE_KEY_V2).toBe("zoomatch:quiz-draft:v2");
  });

  it("is namespaced and cannot collide with the v1 draft key", () => {
    expect(QUIZ_STORAGE_KEY_V2.startsWith("zoomatch:")).toBe(true);
    expect(QUIZ_STORAGE_KEY_V2.endsWith(":v2")).toBe(true);
  });
});

// ─── No-match message ─────────────────────────────────────────────────────────

describe("NO_MATCH_MESSAGE_V2", () => {
  it("keeps the exact product literal", () => {
    expect(NO_MATCH_MESSAGE_V2).toBe(
      "aun no llega ese ser especial pero tranquilx solo es un proyecto de estadistica, no de amor \u003c3",
    );
  });

  it("reassures with inclusive language", () => {
    expect(NO_MATCH_MESSAGE_V2).toContain("tranquilx");
  });

  it("keeps the heart emoticon", () => {
    expect(NO_MATCH_MESSAGE_V2).toContain("<3");
  });

  it("frames the outcome as statistics, not a verdict on the person", () => {
    expect(NO_MATCH_MESSAGE_V2).toContain("estadistica");
    expect(NO_MATCH_MESSAGE_V2).toContain("amor");
  });

  it("stays under the 280-character notification budget", () => {
    expect(NO_MATCH_MESSAGE_V2.length).toBeLessThan(MAX_BODY_LENGTH);
  });

  it("avoids clinical vocabulary", () => {
    expect(NO_MATCH_MESSAGE_V2).not.toMatch(/score|similarity|vector|cosine|percentil|umbral/i);
  });
});

// ─── Percentage formatting ────────────────────────────────────────────────────

describe("formatPercentage", () => {
  it("renders a similarity as a rounded whole percent", () => {
    expect(formatPercentage(0.87)).toBe("87%");
    expect(formatPercentage(0.5)).toBe("50%");
    expect(formatPercentage(0.123)).toBe("12%");
  });

  it("renders the boundaries exactly", () => {
    expect(formatPercentage(0)).toBe("0%");
    expect(formatPercentage(1)).toBe("100%");
  });

  it("clamps values outside the [0, 1] range", () => {
    expect(formatPercentage(-0.5)).toBe("0%");
    expect(formatPercentage(-100)).toBe("0%");
    expect(formatPercentage(1.5)).toBe("100%");
    expect(formatPercentage(100)).toBe("100%");
  });

  it("always returns a bare integer percentage", () => {
    for (const value of [-1, 0, 0.001, 0.5, 0.999, 1, 2]) {
      expect(formatPercentage(value)).toMatch(/^\d{1,3}%$/);
    }
  });
});

// ─── Display labels ───────────────────────────────────────────────────────────

describe("CATEGORY_LABELS", () => {
  it("covers every questionnaire category", () => {
    expect(Object.keys(CATEGORY_LABELS).sort()).toEqual([...EXPECTED_CATEGORIES].sort());
  });

  it("maps each category to a warm Spanish label", () => {
    for (const category of EXPECTED_CATEGORIES) {
      const label = CATEGORY_LABELS[category];
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toBe(category);
      expect(label).not.toMatch(/[a-z]_[a-z]/);
    }

    expect(CATEGORY_LABELS.intimidad_afecto).toBe("Tu forma de amar");
    expect(CATEGORY_LABELS.valores_relacionales).toBe("Tus valores");
    expect(CATEGORY_LABELS.afinidad_cultural).toContain("gustos");
  });
});

describe("LIKERT_LABELS_V2", () => {
  it("has one label per point of the five-point scale", () => {
    expect(LIKERT_LABELS_V2).toHaveLength(5);
    expect(LIKERT_LABELS_V2[0]).toBe("Totalmente en desacuerdo");
    expect(LIKERT_LABELS_V2[4]).toBe("Totalmente de acuerdo");
  });

  it("keeps the middle point neutral and the extremes symmetric", () => {
    expect(LIKERT_LABELS_V2[2]).toBe("Neutral");
    expect(LIKERT_LABELS_V2[1]).toBe("En desacuerdo");
    expect(LIKERT_LABELS_V2[3]).toBe("De acuerdo");
    expect(LIKERT_LABELS_V2[0]).toContain("desacuerdo");
    expect(LIKERT_LABELS_V2[4]).toContain("acuerdo");
  });

  it("has no empty or duplicated labels", () => {
    expect(LIKERT_LABELS_V2.every((label) => label.trim().length > 0)).toBe(true);
    expect(new Set(LIKERT_LABELS_V2).size).toBe(LIKERT_LABELS_V2.length);
  });
});

// ─── Result parsing ───────────────────────────────────────────────────────────

describe("parsePublicResultV2", () => {
  it("parses a complete API payload", () => {
    const parsed = parsePublicResultV2(makePayload());

    expect(parsed).not.toBeNull();
    const result = parsed as PublicResultV2;
    expect(Object.keys(result).sort()).toEqual([
      "alias",
      "animal",
      "color",
      "matches",
      "mbti_code",
      "narrative",
      "no_match_message",
    ]);
    expect(result.alias).toBe("ajolotito verde esmeralda · 4K2P");
    expect(result.animal).toEqual({
      id: "ajolotito",
      diminutivo_es: "ajolotito",
      categoria_fauna: "anfibio",
    });
    expect(result.color).toEqual({ id: "verde-esmeralda", nombre: "verde esmeralda", hex: "#50C878" });
    expect(result.mbti_code).toBe("ENFJ");
    expect(result.matches.romance).toHaveLength(1);
    expect(result.matches.amistad).toHaveLength(0);
    expect(result.no_match_message).toBe(NO_MATCH_MESSAGE_V2);
  });

  it("accepts empty match lists as a valid no-match result", () => {
    const parsed = parsePublicResultV2(
      makePayload({ matches: { romance: [], amistad: [] } }),
    ) as PublicResultV2 | null;

    expect(parsed).not.toBeNull();
    expect(parsed?.matches).toEqual({ romance: [], amistad: [] });
  });

  it("accepts the one-element arrays Supabase joins may return", () => {
    const payload = makePayload();
    const parsed = parsePublicResultV2({
      ...payload,
      animal: [payload.animal],
      color: [payload.color],
    }) as PublicResultV2 | null;

    expect(parsed?.animal.id).toBe("ajolotito");
    expect(parsed?.color.hex).toBe("#50C878");
  });

  it("rejects payloads that are not objects", () => {
    for (const raw of [null, undefined, 42, "profile", [], true]) {
      expect(parsePublicResultV2(raw)).toBeNull();
    }
  });

  it("rejects payloads with missing required fields", () => {
    for (const key of ["alias", "animal", "color", "narrative", "matches"]) {
      expect(parsePublicResultV2(without(makePayload(), key)), `missing ${key}`).toBeNull();
    }
  });

  it("rejects payloads with wrongly typed required fields", () => {
    expect(parsePublicResultV2(makePayload({ alias: 7 }))).toBeNull();
    expect(parsePublicResultV2(makePayload({ narrative: null }))).toBeNull();
    expect(parsePublicResultV2(makePayload({ animal: "ajolotito" }))).toBeNull();
    expect(parsePublicResultV2(makePayload({ color: { id: "x", nombre: "x" } }))).toBeNull();
    expect(
      parsePublicResultV2(makePayload({ animal: { id: "ajolotito", categoria_fauna: "anfibio" } })),
    ).toBeNull();
  });

  it("rejects an invalid matches field", () => {
    expect(parsePublicResultV2(makePayload({ matches: [] }))).toBeNull();
    expect(parsePublicResultV2(makePayload({ matches: null }))).toBeNull();
    expect(parsePublicResultV2(makePayload({ matches: "romance" }))).toBeNull();
    expect(parsePublicResultV2(makePayload({ matches: { romance: [makeMatch()] } }))).not.toBeNull();
  });

  it("rejects colours whose hex is not a six-digit value", () => {
    const base = makePayload();
    for (const hex of ["#50C87", "#50C8789", "50C878", "#GGGGGG", "", null]) {
      expect(
        parsePublicResultV2({ ...base, color: { id: "verde-esmeralda", nombre: "verde esmeralda", hex } }),
        `hex ${String(hex)}`,
      ).toBeNull();
    }
    expect(
      parsePublicResultV2({
        ...base,
        color: { id: "verde-esmeralda", nombre: "verde esmeralda", hex: "#50c878" },
      }),
    ).not.toBeNull();
  });

  it("treats a missing or unusable mbti_code as null", () => {
    expect((parsePublicResultV2(makePayload({ mbti_code: null })) as PublicResultV2).mbti_code).toBeNull();
    expect((parsePublicResultV2(without(makePayload(), "mbti_code")) as PublicResultV2).mbti_code).toBeNull();
    expect((parsePublicResultV2(makePayload({ mbti_code: 42 })) as PublicResultV2).mbti_code).toBeNull();
    expect((parsePublicResultV2(makePayload({ mbti_code: "ISFP" })) as PublicResultV2).mbti_code).toBe(
      "ISFP",
    );
  });

  it("falls back to the shared no-match message and empty strings for optional text", () => {
    const parsed = parsePublicResultV2(without(makePayload(), "no_match_message")) as PublicResultV2;
    expect(parsed.no_match_message).toBe(NO_MATCH_MESSAGE_V2);

    const sparse = parsePublicResultV2(
      makePayload({ animal: { id: "ajolotito", diminutivo_es: "ajolotito" } }),
    ) as PublicResultV2;
    expect(sparse.animal.categoria_fauna).toBe("");
  });

  it("normalizes match entries instead of trusting the payload", () => {
    const parsed = parsePublicResultV2(
      makePayload({
        matches: {
          romance: [
            makeMatch(),
            makeMatch({ alias: 5 }),
            makeMatch({ similarity: "0.9" }),
            "not-an-object",
            makeMatch({ animal: null, color: null, narrative: null, badges: null }),
          ],
          amistad: "not-an-array",
        },
      }),
    ) as PublicResultV2;

    expect(parsed.matches.romance).toHaveLength(2);
    expect(parsed.matches.amistad).toEqual([]);

    const [full, sparse] = parsed.matches.romance as [ResultMatchV2, ResultMatchV2];
    expect(full.similarity).toBeCloseTo(0.87, 12);
    // Labels and icons always come from the local badge map, never from the server.
    expect(full.badges).toEqual([
      { dimension: "valores_empatia", label: "Empatía", affinity: 0.9, icon: "💜" },
    ]);
    expect(sparse.animal).toBe("");
    expect(sparse.color).toBe("");
    expect(sparse.narrative).toBe("");
    expect(sparse.badges).toEqual([]);
  });

  it("drops malformed badges and humanizes unknown dimensions", () => {
    const parsed = parsePublicResultV2(
      makePayload({
        matches: {
          romance: [
            makeMatch({
              badges: [
                { dimension: "cultural_humor", affinity: 0.8 },
                { dimension: "dimension_desconocida", affinity: 0.4 },
                { dimension: "valores_confianza" },
                { affinity: 0.7 },
                "badge",
              ],
            }),
          ],
          amistad: [],
        },
      }),
    ) as PublicResultV2;

    expect(parsed.matches.romance[0]?.badges).toEqual([
      { dimension: "cultural_humor", label: "Humor", affinity: 0.8, icon: "😄" },
      {
        dimension: "dimension_desconocida",
        label: "dimension desconocida",
        affinity: 0.4,
        icon: "✨",
      },
    ]);
  });

  it("keeps every badge affinity inside [0, 1] for well-formed payloads", () => {
    const parsed = parsePublicResultV2(makePayload()) as PublicResultV2;

    for (const badge of parsed.matches.romance[0]?.badges ?? []) {
      expect(badge.affinity).toBeGreaterThanOrEqual(0);
      expect(badge.affinity).toBeLessThanOrEqual(1);
      expect(badge.icon.length).toBeGreaterThan(0);
      expect(badge.label.length).toBeGreaterThan(0);
    }
  });
});

// ─── Draft parsing ────────────────────────────────────────────────────────────

describe("parseQuizDraftV2", () => {
  it("returns an empty draft when nothing is stored", () => {
    expect(parseQuizDraftV2(null)).toEqual({ likert: {}, filters: {} });
    expect(parseQuizDraftV2("")).toEqual({ likert: {}, filters: {} });
  });

  it("returns an empty draft for malformed JSON", () => {
    expect(parseQuizDraftV2("{oops")).toEqual({ likert: {}, filters: {} });
    expect(parseQuizDraftV2("[]")).toEqual({ likert: {}, filters: {} });
    expect(parseQuizDraftV2("null")).toEqual({ likert: {}, filters: {} });
    expect(parseQuizDraftV2('"texto"')).toEqual({ likert: {}, filters: {} });
  });

  it("keeps only Likert values in the 1–5 range", () => {
    const draft = parseQuizDraftV2(
      JSON.stringify({
        likert: { PB01: 3, PB02: 5, PB03: 0, PB04: 6, PB05: "4", PB06: null },
        filters: { IF01: ["mujeres"], IF02: [], IF03: "monogamia" },
      }),
    );

    expect(draft.likert).toEqual({ PB01: 3, PB02: 5 });
    expect(draft.filters).toEqual({ IF01: ["mujeres"], IF02: [] });
  });

  it("is deterministic for the same stored string", () => {
    const raw = JSON.stringify({ likert: { PB01: 4 }, filters: { IF01: ["todxs"] } });

    expect(parseQuizDraftV2(raw)).toEqual(parseQuizDraftV2(raw));
  });
});
