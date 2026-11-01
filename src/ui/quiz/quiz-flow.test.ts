import { describe, expect, it } from "vitest";

import { EXPERIENCE, QUIZ_ITEMS } from "@/config";

import {
  buildSubmission,
  countAnswered,
  optionLabel,
  presentationOrder,
  resumeIndex,
  toggleOption,
} from "./quiz-flow";
import type { QuizDraft } from "./quiz-draft";

const ORDER = presentationOrder(QUIZ_ITEMS, EXPERIENCE.quiz.sensitiveCategories);
const EMPTY: QuizDraft = { likert: {}, filters: {} };

function fullDraft(): QuizDraft {
  const draft: QuizDraft = { likert: {}, filters: {} };
  for (const item of QUIZ_ITEMS) {
    if (item.tipo_respuesta === "likert_5") draft.likert[item.id] = 3;
    else draft.filters[item.id] = [item.opciones?.[0] ?? "x"];
  }
  return draft;
}

describe("presentationOrder", () => {
  it("keeps every item exactly once and puts sensitive categories last", () => {
    expect(ORDER).toHaveLength(QUIZ_ITEMS.length);
    expect(new Set(ORDER.map((i) => i.id)).size).toBe(QUIZ_ITEMS.length);
    const sensitive = new Set(EXPERIENCE.quiz.sensitiveCategories);
    const firstSensitive = ORDER.findIndex((i) => sensitive.has(i.categoria));
    expect(firstSensitive).toBeGreaterThan(0);
    expect(ORDER.slice(firstSensitive).every((i) => sensitive.has(i.categoria))).toBe(true);
  });

  it("offers 'prefiero no decir' on every sensitive multi-select that the data allows", () => {
    const sensitive = ORDER.filter((i) => i.tipo_respuesta === "seleccion_multiple");
    const withOptOut = sensitive.filter((i) => i.opciones?.includes(EXPERIENCE.quiz.exclusiveOption));
    expect(withOptOut.length).toBeGreaterThan(0);
  });
});

describe("answers", () => {
  it("resumes at the first missing item and counts answers", () => {
    expect(resumeIndex(ORDER, EMPTY)).toBe(0);
    expect(countAnswered(ORDER, EMPTY)).toBe(0);
    const full = fullDraft();
    expect(countAnswered(ORDER, full)).toBe(ORDER.length);
    expect(resumeIndex(ORDER, full)).toBe(ORDER.length - 1);
  });

  it("treats the opt-out as exclusive", () => {
    const optOut = EXPERIENCE.quiz.exclusiveOption;
    expect(toggleOption(["a", "b"], optOut, optOut)).toEqual([optOut]);
    expect(toggleOption([optOut], "a", optOut)).toEqual(["a"]);
    expect(toggleOption(["a"], "a", optOut)).toEqual([]);
  });

  it("builds a payload only when every item is answered", () => {
    expect(buildSubmission(ORDER, EMPTY)).toBeNull();
    const payload = buildSubmission(ORDER, fullDraft());
    expect(payload?.likert.length).toBe(QUIZ_ITEMS.filter((i) => i.tipo_respuesta === "likert_5").length);
    expect(payload?.filters.every((f) => f.selected.length > 0)).toBe(true);
  });

  it("humanizes option ids", () => {
    expect(optionLabel("no_monogamia_etica")).toBe("No monogamia ética");
    expect(optionLabel("hombres")).toBe("Hombres");
  });
});
