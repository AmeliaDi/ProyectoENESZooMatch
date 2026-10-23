import { z } from "zod";

import microtestV2 from "../../data/microtest_v2.json";

/**
 * ZooMatch v2 — request validation schemas.
 *
 * These schemas validate payloads for the dual-track (romance + friendship)
 * matching system. Item IDs are derived directly from `data/microtest_v2.json`
 * so the contract stays in sync with the questionnaire definition.
 */

interface RawItemV2 {
  id: string;
  tipo_respuesta: string;
}

const rawItems = microtestV2.items as unknown as RawItemV2[];

/** Every Likert (`likert_5`) item ID in the v2 questionnaire. */
export const LIKERT_ITEM_IDS: string[] = rawItems
  .filter((item) => item.tipo_respuesta === "likert_5")
  .map((item) => item.id);

/** Every multi-select (`seleccion_multiple`) filter item ID in the v2 questionnaire. */
export const FILTER_ITEM_IDS: string[] = rawItems
  .filter((item) => item.tipo_respuesta === "seleccion_multiple")
  .map((item) => item.id);

export const likertAnswerSchema = z.object({
  itemId: z.string().min(1).max(32),
  value: z.number().int().min(1).max(5),
});

export const filterAnswerSchema = z.object({
  itemId: z.string().min(1).max(32),
  selected: z.array(z.string()).min(1),
});

export const quizSubmissionV2Schema = z
  .object({
    likert: z.array(likertAnswerSchema).length(LIKERT_ITEM_IDS.length),
    filters: z.array(filterAnswerSchema).length(FILTER_ITEM_IDS.length),
  })
  .superRefine((data, ctx) => {
    // Validate all expected likert IDs are present with no duplicates.
    const likertIds = new Set(data.likert.map((answer) => answer.itemId));
    for (const expected of LIKERT_ITEM_IDS) {
      if (!likertIds.has(expected)) {
        ctx.addIssue({ code: "custom", message: `Missing likert item: ${expected}` });
      }
    }
    if (likertIds.size !== data.likert.length) {
      ctx.addIssue({ code: "custom", message: "Duplicate likert items" });
    }

    // Validate all expected filter IDs are present with no duplicates.
    const filterIds = new Set(data.filters.map((answer) => answer.itemId));
    for (const expected of FILTER_ITEM_IDS) {
      if (!filterIds.has(expected)) {
        ctx.addIssue({ code: "custom", message: `Missing filter item: ${expected}` });
      }
    }
    if (filterIds.size !== data.filters.length) {
      ctx.addIssue({ code: "custom", message: "Duplicate filter items" });
    }
  });

export const notificationIdsSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(50),
});
