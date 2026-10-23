import { describe, expect, it } from "vitest";

import {
  FILTER_ITEM_IDS,
  LIKERT_ITEM_IDS,
  filterAnswerSchema,
  likertAnswerSchema,
  notificationIdsSchema,
  quizSubmissionV2Schema,
} from "@/lib/validation-v2";
import type { LikertAnswer, LikertValue5, QuizSubmissionV2 } from "@/types/microtest-v2";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** The v2 questionnaire ships 60 items: 57 Likert + 3 hard-filter multi-selects. */
const TOTAL_ITEMS = 60;
const EXPECTED_PREFIXES = ["AC", "IA", "IF", "PB", "PM", "VR"];
const ITEM_ID_PATTERN = /^(?:PB|PM|IF|AC|IA|VR)\d{2}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Every Likert answer the questionnaire expects, in questionnaire order. */
const EXPECTED_LIKERT_IDS = [
  ...itemRange("PB", 1, 10),
  ...itemRange("PM", 1, 8),
  // IF01–IF03 are multi-select filters; the Likert identity items start at IF04.
  ...itemRange("IF", 4, 8),
  ...itemRange("AC", 1, 12),
  ...itemRange("IA", 1, 12),
  ...itemRange("VR", 1, 10),
];

const EXPECTED_FILTER_IDS = ["IF01", "IF02", "IF03"];

const FILTER_SELECTIONS: Record<string, string[]> = {
  IF01: ["mujeres"],
  IF02: ["no binario"],
  IF03: ["monogamia"],
};

function itemRange(prefix: string, from: number, to: number): string[] {
  return Array.from(
    { length: to - from + 1 },
    (_, offset) => `${prefix}${String(from + offset).padStart(2, "0")}`,
  );
}

/** Deterministic, spec-shaped UUID built from a seed. */
function uuid(seed: number): string {
  return `4f9c2a1e-0000-4000-8000-${seed.toString(16).padStart(12, "0")}`;
}

function validLikert(): LikertAnswer[] {
  return LIKERT_ITEM_IDS.map((itemId, index) => ({
    itemId,
    value: ((index % 5) + 1) as LikertValue5,
  }));
}

function validFilters(): Array<{ itemId: string; selected: string[] }> {
  return FILTER_ITEM_IDS.map((itemId) => ({
    itemId,
    selected: FILTER_SELECTIONS[itemId] ?? ["todxs"],
  }));
}

function validSubmission(): QuizSubmissionV2 {
  return { likert: validLikert(), filters: validFilters() };
}

/** Same submission but with one Likert answer replaced by an arbitrary value. */
function submissionWithLikertValue(index: number, value: unknown): unknown {
  return {
    likert: LIKERT_ITEM_IDS.map((itemId, position) => ({
      itemId,
      value: position === index ? value : (position % 5) + 1,
    })),
    filters: validFilters(),
  };
}

/** Same submission but with one filter answer replaced by an arbitrary value. */
function submissionWithFilterSelection(index: number, selected: unknown): unknown {
  return {
    likert: validLikert(),
    filters: FILTER_ITEM_IDS.map((itemId, position) => ({
      itemId,
      selected: position === index ? selected : ["todxs"],
    })),
  };
}

function issuesOf(payload: unknown): string[] {
  const result = quizSubmissionV2Schema.safeParse(payload);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

function countByPrefix(ids: readonly string[]): Record<string, number> {
  return ids.reduce<Record<string, number>>((totals, id) => {
    const prefix = id.slice(0, 2);
    totals[prefix] = (totals[prefix] ?? 0) + 1;
    return totals;
  }, {});
}

// ─── Item id catalogs ─────────────────────────────────────────────────────────

describe("LIKERT_ITEM_IDS", () => {
  it("lists the 57 Likert items of the 60-item questionnaire", () => {
    expect(LIKERT_ITEM_IDS).toHaveLength(57);
    expect(LIKERT_ITEM_IDS.length + FILTER_ITEM_IDS.length).toBe(TOTAL_ITEMS);
  });

  it("matches the questionnaire definition exactly, in order", () => {
    expect(LIKERT_ITEM_IDS).toEqual(EXPECTED_LIKERT_IDS);
  });

  it("only contains ids built from the six questionnaire prefixes", () => {
    for (const id of LIKERT_ITEM_IDS) {
      expect(id).toMatch(ITEM_ID_PATTERN);
      expect(EXPECTED_PREFIXES).toContain(id.slice(0, 2));
    }
  });

  it("keeps the documented number of items per category", () => {
    expect(countByPrefix(LIKERT_ITEM_IDS)).toEqual({
      PB: 10,
      PM: 8,
      IF: 5,
      AC: 12,
      IA: 12,
      VR: 10,
    });
    expect(Object.keys(countByPrefix(LIKERT_ITEM_IDS)).sort()).toEqual(EXPECTED_PREFIXES);
  });

  it("has no duplicates and no empty ids", () => {
    expect(new Set(LIKERT_ITEM_IDS).size).toBe(LIKERT_ITEM_IDS.length);
    expect(LIKERT_ITEM_IDS.every((id) => id.trim().length > 0)).toBe(true);
  });
});

describe("FILTER_ITEM_IDS", () => {
  it("lists exactly the three hard-filter items", () => {
    expect(FILTER_ITEM_IDS).toHaveLength(3);
    expect(FILTER_ITEM_IDS).toEqual(EXPECTED_FILTER_IDS);
  });

  it("only contains identity-filter ids", () => {
    for (const id of FILTER_ITEM_IDS) {
      expect(id.startsWith("IF")).toBe(true);
      expect(id).toMatch(ITEM_ID_PATTERN);
    }
  });

  it("never overlaps with the Likert catalog", () => {
    for (const id of FILTER_ITEM_IDS) {
      expect(LIKERT_ITEM_IDS).not.toContain(id);
    }
  });
});

// ─── Answer schemas ───────────────────────────────────────────────────────────

describe("likertAnswerSchema", () => {
  it("accepts the five points of the Likert scale", () => {
    for (const value of [1, 2, 3, 4, 5]) {
      expect(likertAnswerSchema.safeParse({ itemId: "PB01", value }).success).toBe(true);
    }
  });

  it("rejects values outside the scale and non-integers", () => {
    for (const value of [0, 6, -1, 3.5, "3", null, undefined]) {
      expect(likertAnswerSchema.safeParse({ itemId: "PB01", value }).success, `value ${String(value)}`).toBe(
        false,
      );
    }
  });

  it("rejects an empty or oversized item id", () => {
    expect(likertAnswerSchema.safeParse({ itemId: "", value: 3 }).success).toBe(false);
    expect(likertAnswerSchema.safeParse({ itemId: "PB01".padEnd(33, "x"), value: 3 }).success).toBe(false);
    expect(likertAnswerSchema.safeParse({ value: 3 }).success).toBe(false);
  });
});

describe("filterAnswerSchema", () => {
  it("accepts one or more string selections", () => {
    expect(filterAnswerSchema.safeParse({ itemId: "IF01", selected: ["mujeres"] }).success).toBe(true);
    expect(filterAnswerSchema.safeParse({ itemId: "IF03", selected: ["monogamia", "otro"] }).success).toBe(
      true,
    );
  });

  it("rejects an empty selection and non-string entries", () => {
    expect(filterAnswerSchema.safeParse({ itemId: "IF01", selected: [] }).success).toBe(false);
    expect(filterAnswerSchema.safeParse({ itemId: "IF01", selected: "mujeres" }).success).toBe(false);
    expect(filterAnswerSchema.safeParse({ itemId: "IF01", selected: [1] }).success).toBe(false);
    expect(filterAnswerSchema.safeParse({ itemId: "IF01" }).success).toBe(false);
  });
});

// ─── Quiz submission schema ───────────────────────────────────────────────────

describe("quizSubmissionV2Schema", () => {
  it("accepts a complete submission and returns it unchanged", () => {
    const submission = validSubmission();
    const result = quizSubmissionV2Schema.safeParse(submission);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.likert).toHaveLength(57);
      expect(result.data.filters).toHaveLength(3);
      expect(result.data.likert.map((answer) => answer.itemId)).toEqual(LIKERT_ITEM_IDS);
      expect(result.data.filters.map((answer) => answer.itemId)).toEqual(FILTER_ITEM_IDS);
    }
  });

  it("accepts every point of the Likert scale across the whole questionnaire", () => {
    for (const value of [1, 2, 3, 4, 5] as LikertValue5[]) {
      const submission: QuizSubmissionV2 = {
        likert: LIKERT_ITEM_IDS.map((itemId) => ({ itemId, value })),
        filters: validFilters(),
      };
      expect(quizSubmissionV2Schema.safeParse(submission).success, `uniform ${value}`).toBe(true);
    }
  });

  it("rejects a submission with missing answers", () => {
    const short = validLikert().slice(0, LIKERT_ITEM_IDS.length - 1);

    expect(quizSubmissionV2Schema.safeParse({ likert: short, filters: validFilters() }).success).toBe(false);
    expect(quizSubmissionV2Schema.safeParse({ likert: [], filters: validFilters() }).success).toBe(false);
    expect(
      quizSubmissionV2Schema.safeParse({ likert: validLikert(), filters: validFilters().slice(0, 2) }).success,
    ).toBe(false);
    expect(quizSubmissionV2Schema.safeParse({ likert: validLikert(), filters: [] }).success).toBe(false);
  });

  it("rejects a wrong array length even when the ids look plausible", () => {
    const likert = validLikert();
    const tooLong = [...likert, { itemId: "PB01", value: 3 as LikertValue5 }];

    expect(quizSubmissionV2Schema.safeParse({ likert: tooLong, filters: validFilters() }).success).toBe(false);
    expect(
      quizSubmissionV2Schema.safeParse({
        likert,
        filters: [...validFilters(), { itemId: "IF04", selected: ["todxs"] }],
      }).success,
    ).toBe(false);
  });

  it("rejects duplicated answers and reports the missing item", () => {
    const likert = validLikert();
    // Drop the first answer and repeat the second one: same length, one duplicate, one gap.
    const duplicated = [...likert.slice(1), { ...likert[1] }];
    const result = quizSubmissionV2Schema.safeParse({ likert: duplicated, filters: validFilters() });
    const messages = result.success ? [] : result.error.issues.map((issue) => issue.message);

    expect(result.success).toBe(false);
    expect(messages).toContain("Duplicate likert items");
    expect(messages).toContain("Missing likert item: PB01");
    expect(messages.some((message) => message.includes("PB01"))).toBe(true);
  });

  it("rejects duplicated filter answers", () => {
    const filters = validFilters();
    const duplicated = [...filters.slice(1), { ...filters[1] }];
    const messages = issuesOf({ likert: validLikert(), filters: duplicated });

    expect(messages).toContain("Duplicate filter items");
    expect(messages).toContain("Missing filter item: IF01");
  });

  it("rejects an unknown item id of the right length", () => {
    const likert = validLikert().map((answer, index) =>
      index === 0 ? { itemId: "ZZ99", value: answer.value } : answer,
    );
    const messages = issuesOf({ likert, filters: validFilters() });

    expect(messages.some((message) => message.includes("PB01"))).toBe(true);
  });

  it("rejects Likert values out of range", () => {
    for (const value of [0, 6, -1, 3.5, "3", null, undefined, true]) {
      expect(
        quizSubmissionV2Schema.safeParse(submissionWithLikertValue(0, value)).success,
        `likert value ${String(value)}`,
      ).toBe(false);
    }
  });

  it("rejects malformed filter selections", () => {
    for (const selected of [[], "monogamia", [1], null, undefined]) {
      expect(
        quizSubmissionV2Schema.safeParse(submissionWithFilterSelection(0, selected)).success,
        `selection ${String(selected)}`,
      ).toBe(false);
    }
  });

  it("rejects payloads that are not submission objects", () => {
    for (const payload of [null, undefined, 42, "submission", [], validLikert()]) {
      expect(quizSubmissionV2Schema.safeParse(payload).success, String(payload)).toBe(false);
    }
    expect(quizSubmissionV2Schema.safeParse({}).success).toBe(false);
    expect(quizSubmissionV2Schema.safeParse({ likert: validLikert() }).success).toBe(false);
    expect(quizSubmissionV2Schema.safeParse({ filters: validFilters() }).success).toBe(false);
  });

  it("describes the failure instead of throwing", () => {
    const result = quizSubmissionV2Schema.safeParse({ likert: [], filters: [] });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
      for (const issue of result.error.issues) {
        // The failure is described through a non-empty message rather than thrown.
        expect(typeof issue.message).toBe("string");
        expect(issue.message.length).toBeGreaterThan(0);
        // Zod 4 attaches root-level `superRefine` issues to an empty path, so the
        // path is always a well-formed array but is not necessarily non-empty.
        expect(Array.isArray(issue.path)).toBe(true);
      }
    }
  });
});

// ─── Notification ids schema ──────────────────────────────────────────────────

describe("notificationIdsSchema", () => {
  it("accepts a single valid UUID", () => {
    const result = notificationIdsSchema.safeParse({ ids: [uuid(1)] });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ids).toEqual([uuid(1)]);
    }
  });

  it("accepts up to fifty ids and strips unknown keys", () => {
    const ids = Array.from({ length: 50 }, (_, index) => uuid(index + 1));
    const result = notificationIdsSchema.safeParse({ ids, extra: "ignored" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ ids });
    }
  });

  it("rejects an empty id list", () => {
    expect(notificationIdsSchema.safeParse({ ids: [] }).success).toBe(false);
  });

  it("rejects more than fifty ids", () => {
    const ids = Array.from({ length: 51 }, (_, index) => uuid(index + 1));

    expect(notificationIdsSchema.safeParse({ ids }).success).toBe(false);
  });

  it("rejects strings that are not UUIDs", () => {
    for (const invalid of [
      "not-a-uuid",
      "",
      "4f9c2a1e-0000-4000-8000",
      "4f9c2a1e000040008000000000000001",
      "4f9c2a1e-0000-4000-8000-00000000000z",
      "1",
      "null",
    ]) {
      expect(notificationIdsSchema.safeParse({ ids: [invalid] }).success, invalid).toBe(false);
    }
  });

  it("rejects a list where only one id is invalid", () => {
    expect(notificationIdsSchema.safeParse({ ids: [uuid(1), "oops", uuid(3)] }).success).toBe(false);
  });

  it("rejects non-string entries and a missing ids field", () => {
    expect(notificationIdsSchema.safeParse({ ids: [1, 2] }).success).toBe(false);
    expect(notificationIdsSchema.safeParse({ ids: [null] }).success).toBe(false);
    expect(notificationIdsSchema.safeParse({}).success).toBe(false);
    expect(notificationIdsSchema.safeParse({ ids: uuid(1) }).success).toBe(false);
    expect(notificationIdsSchema.safeParse([uuid(1)]).success).toBe(false);
    expect(notificationIdsSchema.safeParse(null).success).toBe(false);
  });

  it("validates the generated fixtures as real UUIDs", () => {
    for (const index of [1, 2, 50]) {
      expect(uuid(index)).toMatch(UUID_PATTERN);
    }
  });
});
