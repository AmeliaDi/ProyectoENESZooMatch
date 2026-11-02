import { z } from "zod";

import {
  MATCH_CATEGORY_IDS,
  PARAM_LABELS,
  type CategoryConfig,
  type MatchCategoryId,
  type MatchingConfig,
} from "@/types/matching-config";
import type { HardFilterField } from "@/types/microtest";

import raw from "../../data/matching-config.json";
import { loadConfig } from "./load";

/**
 * `data/matching-config.json`: every numeric constant is `{valor, etiqueta,
 * fuente}` so its provenance travels with it (docs/TRAZABILIDAD.md). The
 * loader validates the annotation and keeps only `valor`.
 */

const HARD_FILTER_FIELDS = [
  "orientacion_sexual",
  "identidad_genero",
  "tipo_relacion_busca",
] as const satisfies readonly HardFilterField[];

/** Tolerance for floating-point sums of hand-written weights. */
const WEIGHT_SUM_TOLERANCE = 1e-9;

const label = z.enum(PARAM_LABELS);
const provenance = { etiqueta: label, fuente: z.string().min(1) };

/** Drops the provenance annotation of a validated node (it stays in the JSON). */
function withoutProvenance<T extends { etiqueta: string; fuente: string }>(node: T): Omit<T, "etiqueta" | "fuente"> {
  const copy: Partial<T> = { ...node };
  delete copy.etiqueta;
  delete copy.fuente;
  return copy as Omit<T, "etiqueta" | "fuente">;
}

function annotated<T extends z.ZodType>(value: T) {
  return z
    .strictObject({ valor: value, ...provenance })
    .transform((leaf) => (leaf as unknown as { valor: z.output<T> }).valor);
}

const unit = z.number().min(0).max(1);
const positive = z.number().positive();
const categoryId = z.enum(MATCH_CATEGORY_IDS);
const factorWeights = z.record(z.string().regex(/^[a-z]+_[a-z0-9_]+$/), positive);

const kernelSchema = z.strictObject({
  kind: z.literal("kernel"),
  ...provenance,
  factors: factorWeights,
  bandwidth_per_sqrt_dim: annotated(positive),
  low_side: z
    .strictObject({ valores: z.record(z.string(), z.number().nonnegative()), ...provenance })
    .transform((leaf) => leaf.valores)
    .optional(),
});

const deadzoneSchema = z.strictObject({
  kind: z.literal("deadzone"),
  ...provenance,
  factors: factorWeights,
  tolerance: z.record(z.string(), z.number().nonnegative()),
  scale: annotated(positive),
  combine: z.enum(["product", "geometric"]),
});

const distributionSchema = z.strictObject({
  kind: z.literal("distribution"),
  ...provenance,
  factors: factorWeights,
  temperature: annotated(positive),
  neutral: annotated(unit),
});

const categorySchema = z
  .discriminatedUnion("kind", [kernelSchema, deadzoneSchema, distributionSchema])
  .superRefine((category, ctx) => {
    const factors = new Set(Object.keys(category.factors));
    const extra =
      category.kind === "deadzone"
        ? Object.keys(category.tolerance)
        : category.kind === "kernel"
          ? Object.keys(category.low_side ?? {})
          : [];
    const unknown = extra.filter((f) => !factors.has(f));
    if (unknown.length > 0) ctx.addIssue({ code: "custom", message: `unknown factors ${unknown.join(", ")}` });
    if (category.kind !== "deadzone") return;
    const missing = [...factors].filter((f) => category.tolerance[f] === undefined);
    if (missing.length > 0) ctx.addIssue({ code: "custom", message: `tolerance missing for ${missing.join(", ")}` });
  })
  .transform((category): CategoryConfig => {
    switch (category.kind) {
      case "kernel": {
        const { low_side: lowSide, ...kernel } = withoutProvenance(category);
        return lowSide === undefined ? kernel : { ...kernel, low_side: lowSide };
      }
      case "deadzone":
        return withoutProvenance(category);
      case "distribution":
        return withoutProvenance(category);
    }
  });

const categoryWeights = z.partialRecord(categoryId, unit);

const trackSchema = z
  .strictObject({
    ...provenance,
    minimum_similarity_exclusive: annotated(z.number().min(0.05).max(0.99)),
    null_alpha: annotated(z.number().gt(0).lt(0.5)),
    reference_high: annotated(z.number().gt(0).max(1)),
    max_matches: annotated(z.number().int().positive()),
    hard_filters: z.array(z.enum(HARD_FILTER_FIELDS)),
    beta: annotated(z.number().nonnegative()),
    core: categoryWeights,
    tail: categoryWeights,
    floors: categoryWeights,
  })
  .superRefine((track, ctx) => {
    const sum = Object.values(track.core).reduce((total, w) => total + (w ?? 0), 0);
    if (Math.abs(sum - 1) > WEIGHT_SUM_TOLERANCE) {
      ctx.addIssue({ code: "custom", message: `core weights must sum to 1 (got ${sum})` });
    }
    for (const id of Object.keys(track.tail) as MatchCategoryId[]) {
      if (track.core[id] !== undefined) ctx.addIssue({ code: "custom", message: `${id} is both core and tail` });
    }
    for (const id of Object.keys(track.floors) as MatchCategoryId[]) {
      if (track.core[id] === undefined) ctx.addIssue({ code: "custom", message: `floor on non-core ${id}` });
    }
    if (track.reference_high <= track.minimum_similarity_exclusive) {
      ctx.addIssue({ code: "custom", message: "reference_high must exceed the threshold" });
    }
  })
  .transform((track) => {
    const rest = withoutProvenance(track);
    return { ...rest, hard_filters: [...rest.hard_filters] };
  });

const groupMembers = z.array(categoryId).nonempty();

export const matchingConfigSchema = z
  .strictObject({
    version: z.string().min(1),
    nota: z.string().min(1),
    scoring: z.strictObject({
      quadrature_nodes: annotated(z.number().int().min(5).max(101)),
      mbti_ambiguity_se: annotated(positive),
      enneagram_ambiguity_entropy: annotated(unit),
    }),
    quality: z.strictObject({
      lz_ok: annotated(z.number()),
      lz_floor: annotated(z.number()),
      longstring_ok: annotated(z.number().int().positive()),
      longstring_max: annotated(z.number().int().positive()),
      sd_ok: annotated(positive),
      minimum: annotated(unit),
    }),
    categories: z.record(categoryId, categorySchema),
    tail_groups: z.strictObject({
      extras: groupMembers,
      extras_max_total: annotated(unit),
      identity: groupMembers,
      identity_max_total: annotated(unit),
    }),
    calibration: z.strictObject({
      seed: annotated(z.number().int().nonnegative()),
      population: annotated(z.number().int().min(50)),
      null_pairs: annotated(z.number().int().min(1000)),
    }),
    group: z.strictObject({ beta: annotated(z.number().nonnegative()) }),
    badges: z.strictObject({
      per_track: z.strictObject({
        romance: annotated(z.number().int().positive()),
        amistad: annotated(z.number().int().positive()),
      }),
    }),
    tracks: z.strictObject({ romance: trackSchema, amistad: trackSchema }),
    explainability: z.strictObject({
      confidence_high_margin: annotated(unit),
      category_floor: annotated(z.number().int().min(0).max(100)),
    }),
  })
  .superRefine((config, ctx) => {
    if (config.quality.lz_floor >= config.quality.lz_ok) {
      ctx.addIssue({ code: "custom", message: "quality.lz_floor must be below lz_ok" });
    }
    if (config.quality.longstring_max <= config.quality.longstring_ok) {
      ctx.addIssue({ code: "custom", message: "quality.longstring_max must exceed longstring_ok" });
    }
    for (const [name, track] of Object.entries(config.tracks)) {
      const groups = [
        [config.tail_groups.extras, config.tail_groups.extras_max_total],
        [config.tail_groups.identity, config.tail_groups.identity_max_total],
      ] as const;
      for (const [members, cap] of groups) {
        const total = members.reduce((sum, id) => sum + (track.tail[id] ?? 0), 0);
        if (total > cap + WEIGHT_SUM_TOLERANCE) {
          ctx.addIssue({ code: "custom", message: `${name}: ${members.join("+")} tail ${total} > ${cap}` });
        }
      }
    }
  })
  .transform((config): MatchingConfig => {
    const copy: Partial<typeof config> = { ...config };
    delete copy.nota;
    return copy as MatchingConfig;
  });

/** Validated, frozen `data/matching-config.json`. */
export const MATCHING_CONFIG: Readonly<MatchingConfig> = loadConfig(
  "matching-config",
  matchingConfigSchema,
  raw,
);
