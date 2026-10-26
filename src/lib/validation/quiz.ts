import { z } from "zod";

import microtest from "../../../data/microtest.json";

/**
 * Request validation for the canonical 60-item questionnaire.
 *
 * Item IDs and allowed hard-filter options are derived directly from
 * `data/microtest.json`, so the contract can never drift from the questionnaire.
 */

interface RawItem {
  id: string;
  tipo_respuesta: string;
  opciones?: string[];
}

const rawItems = microtest.items as unknown as RawItem[];
const itemById = new Map(rawItems.map((item) => [item.id, item]));

/** Every Likert (`likert_5`) item ID in the questionnaire. */
export const LIKERT_ITEM_IDS: string[] = rawItems
  .filter((item) => item.tipo_respuesta === "likert_5")
  .map((item) => item.id);

/** Every multi-select (`seleccion_multiple`) filter item ID in the questionnaire. */
export const FILTER_ITEM_IDS: string[] = rawItems
  .filter((item) => item.tipo_respuesta === "seleccion_multiple")
  .map((item) => item.id);

export const likertAnswerSchema = z.object({
  itemId: z.string().min(1).max(32),
  value: z.number().int().min(1).max(5),
});

export const filterAnswerSchema = z.object({
  itemId: z.string().min(1).max(32),
  selected: z.array(z.string().min(1)).min(1),
});

export const quizSubmissionSchema = z
  .object({
    likert: z.array(likertAnswerSchema).length(LIKERT_ITEM_IDS.length),
    filters: z.array(filterAnswerSchema).length(FILTER_ITEM_IDS.length),
  })
  .superRefine((data, ctx) => {
    const likertIds = new Set(data.likert.map((answer) => answer.itemId));
    for (const expected of LIKERT_ITEM_IDS) {
      if (!likertIds.has(expected)) {
        ctx.addIssue({ code: "custom", message: `Missing likert item: ${expected}` });
      }
    }
    if (likertIds.size !== data.likert.length) {
      ctx.addIssue({ code: "custom", message: "Duplicate likert items" });
    }

    const filterIds = new Set(data.filters.map((answer) => answer.itemId));
    for (const expected of FILTER_ITEM_IDS) {
      if (!filterIds.has(expected)) {
        ctx.addIssue({ code: "custom", message: `Missing filter item: ${expected}` });
      }
    }
    if (filterIds.size !== data.filters.length) {
      ctx.addIssue({ code: "custom", message: "Duplicate filter items" });
    }

    // Hard filters must reference real options of their own item. This blocks
    // arbitrary strings from reaching the matching pool.
    for (const answer of data.filters) {
      const item = itemById.get(answer.itemId);
      const allowed = new Set(item?.opciones ?? []);
      if (!item || item.tipo_respuesta !== "seleccion_multiple") continue;
      for (const selected of answer.selected) {
        if (!allowed.has(selected)) {
          ctx.addIssue({
            code: "custom",
            message: `Invalid option "${selected}" for item ${answer.itemId}`,
          });
        }
      }
    }
  });

export const notificationIdsSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(50),
});
