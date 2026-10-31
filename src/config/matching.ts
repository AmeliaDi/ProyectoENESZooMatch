import { z } from "zod";

import {
  ALL_DIMENSIONS,
  type CategoryWeights,
  type Dimension,
  type HardFilterField,
  type MatchingConfig,
  type TrackConfig,
} from "@/types/microtest";

import raw from "../../data/matching-config.json";
import { loadConfig } from "./load";

const HARD_FILTER_FIELDS = [
  "orientacion_sexual",
  "identidad_genero",
  "tipo_relacion_busca",
] as const satisfies readonly HardFilterField[];

const WEIGHT_KEYS = [
  "personalidad",
  "afinidad_cultural",
  "intimidad_afecto",
  "valores_relacionales",
  "identidad",
] as const satisfies readonly (keyof CategoryWeights)[];

/** Tolerance for floating-point sums of hand-written weights. */
const WEIGHT_SUM_TOLERANCE = 1e-9;

const unit = z.number().min(0).max(1);
const dimension = z.enum(ALL_DIMENSIONS as [Dimension, ...Dimension[]]);

const selectivitySchema = z.strictObject({
  intimacy_alignment_floor: unit,
  intimacy_penalty_weight: unit,
  conflict_tolerance: unit,
  conflict_penalty_lambda: z.number().nonnegative(),
});

const weightsSchema = z
  .partialRecord(z.enum(WEIGHT_KEYS), unit)
  .refine(
    (weights) =>
      Math.abs(Object.values(weights).reduce((sum, w) => sum + (w ?? 0), 0) - 1) <=
      WEIGHT_SUM_TOLERANCE,
    "category weights must sum to 1",
  )
  .transform(
    (weights): CategoryWeights => ({
      personalidad: weights.personalidad ?? 0,
      afinidad_cultural: weights.afinidad_cultural ?? 0,
      intimidad_afecto: weights.intimidad_afecto ?? 0,
      valores_relacionales: weights.valores_relacionales ?? 0,
      identidad: weights.identidad ?? 0,
    }),
  );

const trackSchema = z
  .strictObject({
    minimum_similarity_exclusive: z.number().min(0.5).max(0.999),
    centering: unit,
    max_matches: z.number().int().positive(),
    target_coverage_percentile: unit,
    maximum_pair_tail: unit.optional(),
    maximum_user_coverage: unit.optional(),
    dimensions: z.array(dimension).nonempty(),
    hard_filters: z.array(z.enum(HARD_FILTER_FIELDS)),
    weights: weightsSchema,
    selectivity: selectivitySchema.optional(),
  })
  .transform((track): TrackConfig => {
    const { maximum_pair_tail, maximum_user_coverage, selectivity, ...rest } = track;
    return {
      ...rest,
      dimensions: [...rest.dimensions],
      ...(maximum_pair_tail !== undefined ? { maximum_pair_tail } : {}),
      ...(maximum_user_coverage !== undefined ? { maximum_user_coverage } : {}),
      ...(selectivity !== undefined ? { selectivity } : {}),
    };
  });

export const matchingConfigSchema = z.strictObject({
  version: z.string().min(1),
  psychometric_mix: unit,
  tracks: z.strictObject({ romance: trackSchema, amistad: trackSchema }),
  calibration: z.strictObject({
    method: z.string().min(1),
    target_coverage: unit,
    max_users: z.number().int().positive(),
  }),
});

/** Validated, frozen `data/matching-config.json`. */
export const MATCHING_CONFIG: Readonly<MatchingConfig> = loadConfig(
  "matching-config",
  matchingConfigSchema,
  raw,
);
