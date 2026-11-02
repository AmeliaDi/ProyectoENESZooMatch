import { z } from "zod";

import { MATCH_CATEGORY_IDS, PARAM_LABELS, type MatchCategoryId } from "@/types/matching-config";

import raw from "../../data/explanation-copy.json";
import { loadConfig } from "./load";

/**
 * `data/explanation-copy.json`: wording of the layered explanation (ADR-021).
 * The numbers it decorates come from `aggregatePair`; copy never changes them.
 */
const text = z.string().trim().min(1).max(160);

export const CHEMISTRY_LEVELS = [
  "afinidad_muy_alta",
  "quimica_excepcional",
  "quimica_fuerte",
  "buena_quimica",
  "quimica_moderada",
] as const;
const unit = z.number().min(0).max(1);

function annotated<T extends z.ZodType>(value: T) {
  return z
    .strictObject({ valor: value, etiqueta: z.enum(PARAM_LABELS), fuente: z.string().min(1) })
    .transform((leaf) => (leaf as unknown as { valor: z.output<T> }).valor);
}

const category = z.strictObject({
  label: z.string().trim().min(1).max(40),
  icon: z.string().min(1),
  phrases: z.strictObject({ alta: text, media: text, baja: text }),
});

const confidenceCopy = z.strictObject({ label: z.string().min(1).max(24), reason: text });

export const explanationCopySchema = z
  .strictObject({
    version: z.string().min(1),
    nota: z.string().min(1),
    bands: z.strictObject({ alta: annotated(unit), media: annotated(unit) }),
    chemistry: z.strictObject({
      noun: z.string().min(1).max(32),
      levels: z
        .array(z.strictObject({ id: z.enum(CHEMISTRY_LEVELS), min: unit, label: z.string().min(1).max(32) }))
        .length(CHEMISTRY_LEVELS.length),
    }),
    categories: z.record(z.enum(MATCH_CATEGORY_IDS), category),
    personality_factors: z.record(z.string().regex(/^hex_[a-z]$/), text),
    tension: z.strictObject({
      sana: z.string().min(1).max(32),
      platicar: z.string().min(1).max(32),
      texts: z.partialRecord(z.enum(MATCH_CATEGORY_IDS), text),
    }),
    confidence: z.strictObject({ alta: confidenceCopy, margin: confidenceCopy, floor: confidenceCopy, uncertainty: confidenceCopy }),
    talk: z.strictObject({
      intro: text,
      enneagram: text,
      enneagram_same: text,
      motives: z.record(z.string().regex(/^[1-9]$/), z.string().min(1).max(48)),
      enneagram_open: text,
    }),
    headlines: z.strictObject({ romance: text, amistad: text }),
  })
  .refine((c) => c.bands.media < c.bands.alta, "bands.media < bands.alta")
  .refine(
    (c) => c.chemistry.levels.every((l, i, all) => i === 0 || l.min < all[i - 1]!.min) && c.chemistry.levels.at(-1)?.min === 0,
    "chemistry levels strictly descending down to 0",
  )
  .refine((c) => MATCH_CATEGORY_IDS.every((id) => c.categories[id] !== undefined), "every category has copy")
  .refine((c) => Object.keys(c.talk.motives).length === 9, "one motive per enneagram type");

export type ExplanationCopy = z.output<typeof explanationCopySchema>;

export const EXPLANATION_COPY: Readonly<ExplanationCopy> = loadConfig(
  "explanation-copy",
  explanationCopySchema,
  raw,
);

export function categoryCopy(id: MatchCategoryId): ExplanationCopy["categories"][MatchCategoryId] & object {
  return EXPLANATION_COPY.categories[id]!;
}
