import { describe, expect, it } from "vitest";

import {
  CORE_LIKERT_ITEM_IDS,
  FILTER_ITEM_IDS,
  LIKERT_ITEM_IDS,
  REQUIRED_LIKERT_ITEM_IDS,
  filterAnswerSchema,
  likertAnswerSchema,
  notificationIdsSchema,
  quizSubmissionSchema,
} from "@/application/validation/quiz";
import type { LikertAnswer, LikertValue, QuizSubmission } from "@/types/microtest";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** The core ships 60 items: 57 Likert + 3 hard-filter multi-selects (ADR-016). */
const CORE_TOTAL = 60;
const ITEM_ID_PATTERN = /^[A-Z]{1,3}\d{1,2}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Sensitive core Likert items that accept "prefiero no decir". */
const SKIPPABLE = ["VAL5", "VAL6", "ACT2", "ACT3"];

const FILTER_SELECTIONS: Record<string, string[]> = {
  FIL1: ["mujeres"],
  FIL2: ["no binarie"],
  FIL3: ["monogamia"],
};

function uuid(seed: number): string {
  return `4f9c2a1e-0000-4000-8000-${seed.toString(16).padStart(12, "0")}`;
}

function validLikert(ids: readonly string[] = CORE_LIKERT_ITEM_IDS): LikertAnswer[] {
  return ids.map((itemId, index) => ({ itemId, value: ((index % 5) + 1) as LikertValue }));
}

function validFilters(): Array<{ itemId: string; selected: string[] }> {
  return FILTER_ITEM_IDS.map((itemId) => ({ itemId, selected: FILTER_SELECTIONS[itemId] ?? [] }));
}

function validSubmission(): QuizSubmission {
  return { likert: validLikert(), filters: validFilters() };
}

function submissionWithLikertValue(index: number, value: unknown): unknown {
  return {
    likert: CORE_LIKERT_ITEM_IDS.map((itemId, position) => ({
      itemId,
      value: position === index ? value : (position % 5) + 1,
    })),
    filters: validFilters(),
  };
}

function submissionWithFilterSelection(index: number, selected: unknown): unknown {
  return {
    likert: validLikert(),
    filters: FILTER_ITEM_IDS.map((itemId, position) => ({
      itemId,
      selected: position === index ? selected : (FILTER_SELECTIONS[itemId] ?? []),
    })),
  };
}

function issuesOf(payload: unknown): string[] {
  const result = quizSubmissionSchema.safeParse(payload);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

// ─── Item id catalogs ─────────────────────────────────────────────────────────

describe("item catalogs", () => {
  it("has a 60-item core: 57 Likert + 3 hard filters", () => {
    expect(CORE_LIKERT_ITEM_IDS).toHaveLength(57);
    expect(CORE_LIKERT_ITEM_IDS.length + FILTER_ITEM_IDS.length).toBe(CORE_TOTAL);
  });

  it("requires every core Likert item except the sensitive ones", () => {
    expect([...CORE_LIKERT_ITEM_IDS].filter((id) => !REQUIRED_LIKERT_ITEM_IDS.includes(id)).sort()).toEqual(
      [...SKIPPABLE].sort(),
    );
  });

  it("lists optional-module items after the core, without duplicates", () => {
    expect(LIKERT_ITEM_IDS.slice(0, CORE_LIKERT_ITEM_IDS.length)).toEqual(CORE_LIKERT_ITEM_IDS);
    expect(LIKERT_ITEM_IDS.length).toBeGreaterThan(CORE_LIKERT_ITEM_IDS.length);
    expect(new Set(LIKERT_ITEM_IDS).size).toBe(LIKERT_ITEM_IDS.length);
    for (const id of LIKERT_ITEM_IDS) expect(id).toMatch(ITEM_ID_PATTERN);
  });

  it("covers the six HEXACO factors with four core items each", () => {
    for (const factor of ["H", "E", "X", "A", "C", "O"]) {
      expect(CORE_LIKERT_ITEM_IDS.filter((id) => new RegExp(`^${factor}\\d$`).test(id))).toHaveLength(4);
    }
  });

  it("lists exactly the three hard-filter items, never overlapping Likert ids", () => {
    expect(FILTER_ITEM_IDS).toEqual(["FIL1", "FIL2", "FIL3"]);
    for (const id of FILTER_ITEM_IDS) expect(LIKERT_ITEM_IDS).not.toContain(id);
  });
});

// ─── Answer schemas ───────────────────────────────────────────────────────────

describe("likertAnswerSchema", () => {
  it("accepts the five points of the Likert scale", () => {
    for (const value of [1, 2, 3, 4, 5]) {
      expect(likertAnswerSchema.safeParse({ itemId: "H1", value }).success).toBe(true);
    }
  });

  it("rejects values outside the scale and non-integers", () => {
    for (const value of [0, 6, -1, 3.5, "3", null, undefined]) {
      expect(likertAnswerSchema.safeParse({ itemId: "H1", value }).success, `value ${String(value)}`).toBe(false);
    }
  });

  it("rejects an empty or oversized item id", () => {
    expect(likertAnswerSchema.safeParse({ itemId: "", value: 3 }).success).toBe(false);
    expect(likertAnswerSchema.safeParse({ itemId: "H1".padEnd(33, "x"), value: 3 }).success).toBe(false);
    expect(likertAnswerSchema.safeParse({ value: 3 }).success).toBe(false);
  });
});

describe("filterAnswerSchema", () => {
  it("accepts one or more string selections", () => {
    expect(filterAnswerSchema.safeParse({ itemId: "FIL1", selected: ["mujeres"] }).success).toBe(true);
  });

  it("rejects an empty selection and non-string entries", () => {
    expect(filterAnswerSchema.safeParse({ itemId: "FIL1", selected: [] }).success).toBe(false);
    expect(filterAnswerSchema.safeParse({ itemId: "FIL1", selected: "mujeres" }).success).toBe(false);
    expect(filterAnswerSchema.safeParse({ itemId: "FIL1", selected: [1] }).success).toBe(false);
  });
});

// ─── Quiz submission schema ───────────────────────────────────────────────────

describe("quizSubmissionSchema", () => {
  it("accepts a complete core submission and returns it unchanged", () => {
    const result = quizSubmissionSchema.safeParse(validSubmission());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.likert.map((answer) => answer.itemId)).toEqual(CORE_LIKERT_ITEM_IDS);
      expect(result.data.filters.map((answer) => answer.itemId)).toEqual(FILTER_ITEM_IDS);
    }
  });

  it("accepts the core plus every optional module", () => {
    expect(quizSubmissionSchema.safeParse({ likert: validLikert(LIKERT_ITEM_IDS), filters: validFilters() }).success).toBe(
      true,
    );
  });

  it("accepts skipped sensitive items but not skipped mandatory ones", () => {
    const withoutSensitive = validLikert().filter((answer) => !SKIPPABLE.includes(answer.itemId));
    expect(quizSubmissionSchema.safeParse({ likert: withoutSensitive, filters: validFilters() }).success).toBe(true);

    const withoutH1 = validLikert().filter((answer) => answer.itemId !== "H1");
    expect(issuesOf({ likert: withoutH1, filters: validFilters() })).toContain("Missing item: H1");
  });

  it("rejects missing filters", () => {
    expect(quizSubmissionSchema.safeParse({ likert: validLikert(), filters: validFilters().slice(0, 2) }).success).toBe(
      false,
    );
    expect(quizSubmissionSchema.safeParse({ likert: [], filters: validFilters() }).success).toBe(false);
  });

  it("rejects duplicated answers", () => {
    const likert = validLikert();
    expect(issuesOf({ likert: [...likert, likert[1]], filters: validFilters() })).toContain(
      `Duplicate item: ${likert[1]?.itemId}`,
    );
    const filters = validFilters();
    const messages = issuesOf({ likert, filters: [...filters.slice(1), filters[1]] });
    expect(messages).toContain("Duplicate item: FIL2");
    expect(messages).toContain("Missing item: FIL1");
  });

  it("rejects unknown ids and filter ids posing as Likert", () => {
    expect(issuesOf({ likert: [...validLikert(), { itemId: "ZZ99", value: 3 }], filters: validFilters() })).toContain(
      "Unknown likert_5 item: ZZ99",
    );
    expect(issuesOf({ likert: [...validLikert(), { itemId: "FIL1", value: 3 }], filters: validFilters() })).toContain(
      "Unknown likert_5 item: FIL1",
    );
  });

  it("rejects options that do not belong to the item, including the retired wildcard", () => {
    expect(issuesOf(submissionWithFilterSelection(0, ["todxs"]))).toContain('Invalid option "todxs" for item FIL1');
  });

  it("rejects Likert values out of range", () => {
    for (const value of [0, 6, -1, 3.5, "3", null, undefined, true]) {
      expect(quizSubmissionSchema.safeParse(submissionWithLikertValue(0, value)).success, String(value)).toBe(false);
    }
  });

  it("rejects malformed filter selections", () => {
    for (const selected of [[], "monogamia", [1], null, undefined]) {
      expect(quizSubmissionSchema.safeParse(submissionWithFilterSelection(0, selected)).success).toBe(false);
    }
  });

  it("rejects payloads that are not submission objects", () => {
    for (const payload of [null, undefined, 42, "submission", [], validLikert()]) {
      expect(quizSubmissionSchema.safeParse(payload).success, String(payload)).toBe(false);
    }
    expect(quizSubmissionSchema.safeParse({}).success).toBe(false);
  });
});

// ─── Notification ids schema ──────────────────────────────────────────────────

describe("notificationIdsSchema", () => {
  it("accepts up to fifty ids and strips unknown keys", () => {
    const ids = Array.from({ length: 50 }, (_, index) => uuid(index + 1));
    const result = notificationIdsSchema.safeParse({ ids, extra: "ignored" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ ids });
  });

  it("rejects empty, oversized and malformed lists", () => {
    expect(notificationIdsSchema.safeParse({ ids: [] }).success).toBe(false);
    expect(notificationIdsSchema.safeParse({ ids: Array.from({ length: 51 }, (_, i) => uuid(i + 1)) }).success).toBe(
      false,
    );
    for (const invalid of ["not-a-uuid", "", "4f9c2a1e-0000-4000-8000", "1"]) {
      expect(notificationIdsSchema.safeParse({ ids: [invalid] }).success, invalid).toBe(false);
    }
    expect(notificationIdsSchema.safeParse({ ids: [uuid(1), "oops"] }).success).toBe(false);
    expect(notificationIdsSchema.safeParse({}).success).toBe(false);
  });

  it("validates the generated fixtures as real UUIDs", () => {
    for (const index of [1, 2, 50]) expect(uuid(index)).toMatch(UUID_PATTERN);
  });
});
