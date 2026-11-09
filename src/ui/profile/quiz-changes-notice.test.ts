import { describe, expect, it } from "vitest";

import { EXPERIENCE, MATCHING_CONFIG } from "@/config";
import { CORE_ITEMS, QUIZ_ITEMS, QUIZ_VERSION, isSkippableItem } from "@/config/quiz";
import { FORBIDDEN_COPY, INCLUSIVE_X, OUTCOME_CLAIMS } from "@/testing/copy-guard";
import { groupLabel } from "@/ui/quiz/quiz-draft";
import { coreQuizSegments, presentationOrder, segmentGroupId } from "@/ui/quiz/quiz-flow";

import {
  QUIZ_CHANGES_COPY,
  QUIZ_CHANGES_SIGNATURE,
  QUIZ_CHANGES_SIZES,
  quizChangesFor,
} from "./quiz-changes-notice";

const EMOJI = /\p{Extended_Pictographic}/u;

const measurement = (stamped: boolean, current = true) => ({ stamped, current, seal: "s" });

/**
 * Los 21 reactivos que el banco ganó entre la 2.1.0 y la vigente, medidos con
 * `git show bef5288:data/microtest.json` contra `data/microtest.json`. Si alguien
 * los borra o los renombra, la línea «added» del aviso deja de ser cierta.
 */
const ADDED_SINCE_2_1 = [
  "INT13", "INT14", "INT15", "INT16", "INT17", "INT18", "INT19", "INT20", "INT21", "INT22", "INT23", "INT24",
  "SOC7", "SOC8", "SOC9", "SOC10", "SOC11",
  "VAL16", "VAL17", "VAL18", "VAL19",
];

/** La familia de puntuación dueña de un factor, igual que hace el corte en quizzes. */
function ownerOf(factor: string): string {
  for (const [id, category] of Object.entries(MATCHING_CONFIG.categories)) {
    if (factor in category.factors) return id;
  }
  return "otros";
}

const SEGMENTS = coreQuizSegments(
  presentationOrder(
    CORE_ITEMS.map((item) => ({ ...item, skippable: isSkippableItem(item) })),
    EXPERIENCE.quiz.sensitiveCategories,
  ),
  MATCHING_CONFIG.categories,
  {
    maxItemsPerQuiz: EXPERIENCE.quiz.maxItemsPerQuiz,
    sensitiveCategories: EXPERIENCE.quiz.sensitiveCategories,
  },
);

describe("quizChangesFor", () => {
  it("shows the changes to a profile that predates the seal", () => {
    expect(quizChangesFor({ measurement: measurement(false), dismissed: null })).toBe("show");
  });

  it("stays quiet once this signature was dismissed", () => {
    expect(quizChangesFor({ measurement: measurement(false), dismissed: QUIZ_CHANGES_SIGNATURE })).toBe("hidden");
  });

  it("comes back when the content changes, without re-bothering an old dismissal", () => {
    expect(quizChangesFor({ measurement: measurement(false), dismissed: "2-quizzes-2.1.0" })).toBe("show");
  });

  it("leaves the invitation to the math notice for anyone already stamped", () => {
    expect(quizChangesFor({ measurement: measurement(true, false), dismissed: null })).toBe("hidden");
    expect(quizChangesFor({ measurement: measurement(true, true), dismissed: null })).toBe("hidden");
  });
});

describe("the copy states what the bank actually does", () => {
  /** Los tamaños tal como los lee la persona: el paréntesis de la línea «split». */
  const listed = (() => {
    const group = QUIZ_CHANGES_COPY.split.match(/\(([^)]*?)\s+reactivos\)/)?.[1] ?? "";
    return group
      .split(/[^0-9]+/)
      .filter(Boolean)
      .map(Number);
  })();

  it("lists the real segment sizes", () => {
    expect(listed.length).toBeGreaterThan(1);
    expect(listed).toEqual([...QUIZ_CHANGES_SIZES]);
    expect(listed.length).toBe(SEGMENTS.length);
  });

  it("adds up to the mandatory core and never breaks the cap", () => {
    expect(listed.reduce((a, b) => a + b, 0)).toBe(CORE_ITEMS.length);
    for (const size of listed) expect(size).toBeLessThanOrEqual(EXPERIENCE.quiz.maxItemsPerQuiz);
  });

  it("names the quizzes only in the numbers the split produces", () => {
    expect(QUIZ_CHANGES_COPY.split).toContain(`${SEGMENTS.length} quizzes`);
    expect(QUIZ_CHANGES_SIGNATURE).toBe(`${SEGMENTS.length}-quizzes-${QUIZ_VERSION}`);
  });

  it("only promises added questions in families that really grew", () => {
    const owners = new Set(
      ADDED_SINCE_2_1.map((id) => {
        const item = QUIZ_ITEMS.find((i) => i.id === id);
        expect(item, `${id} is gone from the bank`).toBeDefined();
        return ownerOf(item?.factor ?? "");
      }),
    );
    const named = [...owners].map((owner) => groupLabel(owner));
    expect(named.length).toBe(2);
    for (const title of named) expect(QUIZ_CHANGES_COPY.added).toContain(`«${title.toLowerCase()}»`);
    expect(QUIZ_CHANGES_COPY.added).toMatch(/Agregamos preguntas en /);
  });

  it("counts the re-take the same way in the invitation and in its fine print", () => {
    expect(QUIZ_CHANGES_COPY.note).toContain(`${SEGMENTS.length} quizzes`);
  });

  it("keeps identity and intimacy in the last quiz, where the copy says they are", () => {
    const last = SEGMENTS.at(-1);
    if (!last) throw new Error("the bank produced no quizzes");
    const sensibles = CORE_ITEMS.filter((item) => EXPERIENCE.quiz.sensitiveCategories.includes(item.categoria));
    expect(sensibles.length).toBeGreaterThan(0);
    for (const item of sensibles) expect(last.items.some((s) => s.id === item.id), item.id).toBe(true);
    for (const earlier of SEGMENTS.slice(0, -1)) {
      for (const item of sensibles) expect(earlier.items.some((s) => s.id === item.id), item.id).toBe(false);
    }
    expect(QUIZ_CHANGES_COPY.sensitive).toContain(groupLabel(segmentGroupId(last)).toLowerCase());
  });

  it("carries the bank version in the signature, so it cannot rot silently", () => {
    expect(QUIZ_CHANGES_SIGNATURE).toContain(QUIZ_VERSION);
  });
});

describe("copy guards", () => {
  it("keeps every line short enough to read aloud", () => {
    for (const [key, text] of Object.entries(QUIZ_CHANGES_COPY)) {
      expect(text.length, key).toBeLessThan(200);
    }
  });

  for (const [key, text] of Object.entries(QUIZ_CHANGES_COPY)) {
    it(`${key} respects the tone, the read-aloud and the outcome rules`, () => {
      expect(text, text).not.toMatch(FORBIDDEN_COPY);
      expect(text, text).not.toMatch(OUTCOME_CLAIMS);
      expect(text, text).not.toMatch(INCLUSIVE_X);
      expect(text, text).not.toMatch(EMOJI);
    });
  }
});
