import { z } from "zod";

import { QUIZ_ITEMS, isSkippableItem } from "@/config";
import { QUIZ_MODULE_IDS, type QuizModuleId } from "@/types/microtest";
import { SHARE_LAYER_IDS } from "@/types/sharing";
import { inclusiveModeSchema } from "./common";

/**
 * Request validation for the modular questionnaire (ADR-016).
 *
 * Item IDs and allowed hard-filter options are derived directly from
 * `data/microtest.json`, so the contract can never drift from the questionnaire.
 * The core is mandatory except sensitive Likert items ("prefiero no decir");
 * optional-module answers are accepted when they reference known items.
 */

const itemById = new Map(QUIZ_ITEMS.map((item) => [item.id, item]));
const isCore = (item: (typeof QUIZ_ITEMS)[number]) => item.modulo === "nucleo";

/** Every Likert (`likert_5`) item ID in the bank (core and optional modules). */
export const LIKERT_ITEM_IDS: string[] = QUIZ_ITEMS.filter(
  (item) => item.tipo_respuesta === "likert_5",
).map((item) => item.id);

/** Core Likert item IDs, in presentation order. */
export const CORE_LIKERT_ITEM_IDS: string[] = QUIZ_ITEMS.filter(
  (item) => isCore(item) && item.tipo_respuesta === "likert_5",
).map((item) => item.id);

/** Core Likert item IDs that must be answered (sensitive ones may be skipped). */
export const REQUIRED_LIKERT_ITEM_IDS: string[] = QUIZ_ITEMS.filter(
  (item) => isCore(item) && item.tipo_respuesta === "likert_5" && !isSkippableItem(item),
).map((item) => item.id);

/** Every multi-select hard-filter item ID (all in the core, all required). */
export const FILTER_ITEM_IDS: string[] = QUIZ_ITEMS.filter(
  (item) => item.tipo_respuesta === "seleccion_multiple",
).map((item) => item.id);

export const likertAnswerSchema = z.object({
  itemId: z.string().min(1).max(32),
  value: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
});

export const filterAnswerSchema = z.object({
  itemId: z.string().min(1).max(32),
  selected: z.array(z.string().min(1)).min(1),
});

type Ctx = z.core.$RefinementCtx;

function checkIds(ids: string[], kind: "likert_5" | "seleccion_multiple", ctx: Ctx): Set<string> {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) ctx.addIssue({ code: "custom", message: `Duplicate item: ${id}` });
    seen.add(id);
    if (itemById.get(id)?.tipo_respuesta !== kind) {
      ctx.addIssue({ code: "custom", message: `Unknown ${kind} item: ${id}` });
    }
  }
  return seen;
}

function checkRequired(seen: Set<string>, required: string[], ctx: Ctx): void {
  for (const expected of required) {
    if (!seen.has(expected)) ctx.addIssue({ code: "custom", message: `Missing item: ${expected}` });
  }
}

export const quizSubmissionSchema = z
  .object({
    likert: z.array(likertAnswerSchema).max(LIKERT_ITEM_IDS.length),
    filters: z.array(filterAnswerSchema).length(FILTER_ITEM_IDS.length),
    inclusiveMode: inclusiveModeSchema.optional(),
  })
  .superRefine((data, ctx) => {
    const likert = checkIds(data.likert.map((answer) => answer.itemId), "likert_5", ctx);
    checkRequired(likert, REQUIRED_LIKERT_ITEM_IDS, ctx);
    const filters = checkIds(data.filters.map((answer) => answer.itemId), "seleccion_multiple", ctx);
    checkRequired(filters, FILTER_ITEM_IDS, ctx);

    // Hard filters must reference real options of their own item. This blocks
    // arbitrary strings from reaching the matching pool.
    for (const answer of data.filters) {
      const allowed = new Set(itemById.get(answer.itemId)?.opciones ?? []);
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

const OPTIONAL_MODULE_IDS = QUIZ_MODULE_IDS.filter((id) => id !== "nucleo") as [QuizModuleId, ...QuizModuleId[]];

/**
 * One optional module at a time. Every non-sensitive item of the module is
 * required (a module is either answered or not); sensitive ones may be skipped.
 */
export const refineSubmissionSchema = z
  .strictObject({
    module: z.enum(OPTIONAL_MODULE_IDS),
    likert: z.array(likertAnswerSchema).min(1).max(LIKERT_ITEM_IDS.length),
  })
  .superRefine((data, ctx) => {
    const seen = checkIds(data.likert.map((a) => a.itemId), "likert_5", ctx);
    for (const id of seen) {
      if (itemById.get(id)?.modulo !== data.module) ctx.addIssue({ code: "custom", message: `Item ${id} is not in ${data.module}` });
    }
    const required = QUIZ_ITEMS.filter(
      (item) => item.modulo === data.module && item.tipo_respuesta === "likert_5" && !isSkippableItem(item),
    ).map((item) => item.id);
    checkRequired(seen, required, ctx);
  });

export const privacyUpdateSchema = z.union([
  z.strictObject({ paused: z.boolean() }),
  z.strictObject({ showAvatarDetail: z.boolean() }),
  z.strictObject({ sharedLayers: z.array(z.enum(SHARE_LAYER_IDS)).max(SHARE_LAYER_IDS.length) }),
]);

export const notificationIdsSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(50),
});
