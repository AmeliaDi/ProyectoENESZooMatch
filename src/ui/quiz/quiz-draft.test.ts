import { describe, expect, it } from "vitest";

import type { Category } from "@/types/microtest";

import { CATEGORY_LABELS, QUIZ_STORAGE_KEY, parseQuizDraft } from "./quiz-draft";

const EXPECTED_CATEGORIES: Category[] = [
  "personalidad_bigfive",
  "personalidad_mbti",
  "identidad_filtros",
  "afinidad_cultural",
  "intimidad_afecto",
  "valores_relacionales",
];

describe("QUIZ_STORAGE_KEY", () => {
  it("is a namespaced local-storage key", () => {
    expect(QUIZ_STORAGE_KEY).toBe("zoomatch:quiz-draft");
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
      expect(label?.length ?? 0).toBeGreaterThan(0);
      expect(label).not.toBe(category);
      expect(label).not.toMatch(/[a-z]_[a-z]/);
    }

    expect(CATEGORY_LABELS.intimidad_afecto).toBe("Tu forma de amar");
    expect(CATEGORY_LABELS.valores_relacionales).toBe("Tus valores");
    expect(CATEGORY_LABELS.afinidad_cultural).toContain("gustos");
  });
});

// ─── Draft parsing ────────────────────────────────────────────────────────────

describe("parseQuizDraft", () => {
  it("returns an empty draft when nothing is stored", () => {
    expect(parseQuizDraft(null)).toEqual({ likert: {}, filters: {} });
    expect(parseQuizDraft("")).toEqual({ likert: {}, filters: {} });
  });

  it("returns an empty draft for malformed JSON", () => {
    expect(parseQuizDraft("{oops")).toEqual({ likert: {}, filters: {} });
    expect(parseQuizDraft("[]")).toEqual({ likert: {}, filters: {} });
    expect(parseQuizDraft("null")).toEqual({ likert: {}, filters: {} });
    expect(parseQuizDraft('"texto"')).toEqual({ likert: {}, filters: {} });
  });

  it("keeps only Likert values in the 1–5 range", () => {
    const draft = parseQuizDraft(
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

    expect(parseQuizDraft(raw)).toEqual(parseQuizDraft(raw));
  });
});
