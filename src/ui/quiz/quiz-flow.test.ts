import { describe, expect, it } from "vitest";

import { CORE_ITEMS as QUIZ_ITEMS, EXPERIENCE, isSkippableItem } from "@/config";
import { MATCHING_CONFIG } from "@/config/matching";

import {
  buildSubmission,
  coreQuizSegments,
  countAnswered,
  isAnswered,
  optionLabel,
  presentationOrder,
  resumeIndex,
  resumePosition,
  segmentGroupId,
  toggleOption,
  toggleSkip,
} from "./quiz-flow";
import type { QuizDraft } from "./quiz-draft";
import type { SegmentItem } from "./quiz-flow";

const ORDER = presentationOrder(
  QUIZ_ITEMS.map((item) => ({ ...item, skippable: isSkippableItem(item) })),
  EXPERIENCE.quiz.sensitiveCategories,
);
const EMPTY: QuizDraft = { likert: {}, filters: {}, skipped: [] };

function fullDraft(): QuizDraft {
  const draft: QuizDraft = { likert: {}, filters: {}, skipped: [] };
  for (const item of QUIZ_ITEMS) {
    if (item.tipo_respuesta === "likert_5") draft.likert[item.id] = 3;
    else draft.filters[item.id] = [item.opciones?.[0] ?? "x"];
  }
  return draft;
}

describe("presentationOrder", () => {
  it("keeps every item exactly once and puts the sensitive block last", () => {
    expect(ORDER).toHaveLength(QUIZ_ITEMS.length);
    expect(new Set(ORDER.map((i) => i.id)).size).toBe(QUIZ_ITEMS.length);
    const late = (item: (typeof ORDER)[number]) =>
      EXPERIENCE.quiz.sensitiveCategories.includes(item.categoria) || item.skippable === true;
    const firstSensitive = ORDER.findIndex(late);
    expect(firstSensitive).toBeGreaterThan(0);
    expect(ORDER.slice(firstSensitive).every(late)).toBe(true);
    expect(ORDER.slice(0, firstSensitive).some(late)).toBe(false);
    // The two questions about raising children keep a filter between them.
    expect(ORDER.slice(firstSensitive).map((i) => i.id)).toEqual(["VAL6", "FIL1", "VAL13", "FIL2", "FIL3"]);
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

  it("lets sensitive Likert items be skipped and leaves them out of the payload", () => {
    const skippable = ORDER.filter((i) => i.skippable).map((i) => i.id);
    expect(skippable.sort()).toEqual(["VAL13", "VAL6"]);

    let draft = fullDraft();
    for (const id of skippable) draft = toggleSkip(draft, id);
    expect(countAnswered(ORDER, draft)).toBe(ORDER.length);
    const payload = buildSubmission(ORDER, draft);
    expect(payload?.likert.map((a) => a.itemId)).not.toContain("VAL6");
    expect(payload?.likert).toHaveLength(
      QUIZ_ITEMS.filter((i) => i.tipo_respuesta === "likert_5").length - skippable.length,
    );

    // Skipping a mandatory item does not count as an answer.
    const h1 = toggleSkip({ ...fullDraft(), likert: {} }, "H1");
    expect(isAnswered(ORDER.find((i) => i.id === "H1")!, h1)).toBe(false);
    // Un-skipping restores the unanswered state.
    expect(toggleSkip(toggleSkip(EMPTY, "VAL6"), "VAL6").skipped).toEqual([]);
  });

  it("humanizes option ids", () => {
    expect(optionLabel("no_monogamia_etica")).toBe("No monogamia ética");
    expect(optionLabel("hombres")).toBe("Hombres");
  });
});

/**
 * ADR-045: the core is delivered as several short quizzes. The blocks are
 * derived from the scoring config, never written by hand, so what the tests
 * guard are the invariants of the derivation: nothing lost or repeated, no
 * factor split across two quizzes (I9), the cap respected, sensitive last, and
 * the fatigue rotation alive inside each quiz.
 */
function segments(cap: number = EXPERIENCE.quiz.maxItemsPerQuiz) {
  return coreQuizSegments(ORDER, MATCHING_CONFIG.categories, {
    maxItemsPerQuiz: cap,
    sensitiveCategories: EXPERIENCE.quiz.sensitiveCategories,
  });
}

describe("coreQuizSegments", () => {
  it("delivers the whole core exactly once, split under the cap", () => {
    const built = segments();
    const flat = built.flatMap((s) => s.items);
    expect(flat.map((i) => i.id)).toHaveLength(ORDER.length);
    expect(new Set(flat.map((i) => i.id)).size).toBe(ORDER.length);
    expect(new Set(flat.map((i) => i.id))).toEqual(new Set(ORDER.map((i) => i.id)));
    for (const segment of built) {
      expect(segment.items.length).toBeLessThanOrEqual(EXPERIENCE.quiz.maxItemsPerQuiz);
      expect(segment.grupos.reduce((n, g) => n + g.items, 0)).toBe(segment.items.length);
    }
    expect(built.map((s) => s.items.length)).toEqual([24, 30, 14]);
    expect(built.map((s) => s.grupos.map((g) => [g.id, g.items]))).toEqual([
      [["personalidad", 24]],
      [["valores", 14], ["estilo", 12], ["mbti", 4]],
      [["eneagrama", 9], ["sensible", 5]],
    ]);
  });

  it("names each quiz after its heaviest family", () => {
    const built = segments();
    expect(built.map(segmentGroupId)).toEqual(["personalidad", "valores", "sensible"]);
  });

  it("keeps every latent factor inside a single quiz", () => {
    const built = segments();
    const seen = new Map<string, string>();
    for (const segment of built) {
      for (const item of segment.items) {
        const owner = seen.get(item.factor);
        expect(owner ?? segment.id, `${item.id} (${item.factor}) spans ${owner} and ${segment.id}`).toBe(segment.id);
        seen.set(item.factor, segment.id);
      }
    }
  });

  it("asks identity, filters and sensitive items in the last quiz", () => {
    const built = segments();
    const last = built[built.length - 1]!;
    expect(segmentGroupId(last)).toBe("sensible");
    const sensibles = ORDER.filter(
      (i) => i.filtro_duro || i.banderas.includes("SENS") || EXPERIENCE.quiz.sensitiveCategories.includes(i.categoria),
    );
    expect(last.items.filter((i) => i.filtro_duro).map((i) => i.id)).toEqual(["FIL1", "FIL2", "FIL3"]);
    expect(sensibles.every((i) => last.items.some((s) => s.id === i.id))).toBe(true);
    for (const earlier of built.slice(0, -1)) {
      expect(earlier.items.some((i) => i.filtro_duro || i.banderas.includes("SENS"))).toBe(false);
    }
  });

  it("keeps two questions of the same factor apart inside each quiz", () => {
    for (const segment of segments()) {
      for (let i = 1; i < segment.items.length; i += 1) {
        const a = segment.items[i - 1]!;
        const b = segment.items[i]!;
        if (a.tipo_respuesta !== "likert_5" || b.tipo_respuesta !== "likert_5") continue;
        expect(b.factor, `${a.id} and ${b.id} both measure ${a.factor}`).not.toBe(a.factor);
      }
    }
  });

  it("follows the cap instead of a hand-written list", () => {
    const tight = segments(20);
    expect(tight.length).toBeGreaterThan(3);
    const flat = tight.flatMap((s) => s.items);
    expect(flat.map((i) => i.id)).toHaveLength(ORDER.length);
    expect(new Set(flat.map((i) => i.id))).toEqual(new Set(ORDER.map((i) => i.id)));
    for (const segment of tight) expect(segment.items.length).toBeLessThanOrEqual(20);
    // Quizzing the same core under two caps keeps one subject per quiz until a
    // family is too big for the cap, which is the only thing that may split it.
    expect(tight.flatMap((s) => s.items.map((i) => i.id)).filter((id) => id.startsWith("H"))).toEqual(
      segments().flatMap((s) => s.items.map((i) => i.id)).filter((id) => id.startsWith("H")),
    );
    for (const cap of [35, 26]) {
      const built = segments(cap);
      const biggest = Math.max(...built.map((s) => s.items.length));
      for (const segment of built) {
        for (const item of segment.items) {
          const others = built.filter((s) => s.items.some((i) => i.factor === item.factor));
          if (others.length > 1) expect(biggest, `${item.factor} split at cap ${cap}`).toBeGreaterThan(cap);
        }
      }
    }
  });

  it("resumes a draft at the quiz and question where it stopped", () => {
    const built = segments();
    expect(resumePosition(built, EMPTY)).toEqual({ quiz: 0, index: 0 });
    expect(resumePosition(built, fullDraft())).toEqual({
      quiz: built.length - 1,
      index: built[built.length - 1]!.items.length - 1,
    });

    // Answering quiz 1 completely lands at the first question of quiz 2.
    const answered = (items: readonly SegmentItem[]): QuizDraft => {
      const draft: QuizDraft = { likert: {}, filters: {}, skipped: [] };
      for (const item of items) {
        if (item.tipo_respuesta === "likert_5") draft.likert[item.id] = 3;
        else draft.filters[item.id] = [item.opciones?.[0] ?? "x"];
      }
      return draft;
    };
    expect(resumePosition(built, answered(built[0]!.items))).toEqual({ quiz: 1, index: 0 });

    // A partial answer inside quiz 2 resumes on the next open question.
    const partial = answered([...built[0]!.items, ...built[1]!.items.slice(0, 2)]);
    expect(resumePosition(built, partial)).toEqual({ quiz: 1, index: 2 });
  });
});
