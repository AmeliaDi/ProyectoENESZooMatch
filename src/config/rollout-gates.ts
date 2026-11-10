import { z } from "zod";

import { PARAM_LABELS } from "@/types/matching-config";
import type { RolloutGates } from "@/types/rollout-gates";

import raw from "../../data/rollout-gates.json";
import { loadConfig } from "./load";

/**
 * `data/rollout-gates.json`: every numeric constant is `{valor, etiqueta, fuente}`
 * so its provenance travels with it (docs/TRAZABILIDAD.md). The loader validates
 * the annotation and keeps only `valor`, exactly like `./matching`.
 */
const provenance = { etiqueta: z.enum(PARAM_LABELS), fuente: z.string().min(1) };

function annotated<T extends z.ZodType>(value: T) {
  return z
    .strictObject({ valor: value, ...provenance })
    .transform((leaf) => (leaf as unknown as { valor: z.output<T> }).valor);
}

const unit = z.number().min(0).max(1);
const coverageRange = z.strictObject({ min: annotated(unit), max: annotated(unit) });
const perTrack = <T extends z.ZodType>(value: T) => z.strictObject({ romance: value, amistad: value });

export const rolloutGatesSchema = z
  .strictObject({
    version: z.string().min(1),
    nota: z.string().min(1),
    cobertura: perTrack(coverageRange),
    equidad: z.strictObject({ min_ratio: annotated(unit) }),
    exposicion: z.strictObject({
      gini_max: perTrack(annotated(z.number().min(0).max(1))),
      no_peor_que_actual: z.boolean(),
    }),
    correlacion_rangos: z.strictObject({ min_spearman: annotated(z.number().min(-1).max(1)) }),
    estabilidad_ruido: z.strictObject({
      min_spearman: annotated(z.number().min(-1).max(1)),
      min_jaccard: annotated(unit),
    }),
    invariantes: z.strictObject({ max_violaciones: annotated(z.number().int().nonnegative()) }),
    tiempo: z.strictObject({ max_ms_por_mil_pares: annotated(z.number().positive()) }),
    conservacion: z.strictObject({ max_perdida: annotated(z.number().int().nonnegative()) }),
    activacion: z.strictObject({
      variable: z.string().min(1),
      notificacion: z.strictObject({
        type: z.string().min(1),
        titulo: z.string().min(1),
        cuerpo: z.string().min(1),
      }),
    }),
  })
  .superRefine((gates, ctx) => {
    for (const track of ["romance", "amistad"] as const) {
      const range = gates.cobertura[track];
      if (range.min > range.max) {
        ctx.addIssue({ code: "custom", message: `cobertura.${track}: min must not exceed max` });
      }
    }
    if (gates.estabilidad_ruido.min_spearman < gates.correlacion_rangos.min_spearman) {
      ctx.addIssue({
        code: "custom",
        message: "estabilidad_ruido.min_spearman must be >= correlacion_rangos.min_spearman: surviving noise is stricter than merely resembling the incumbent",
      });
    }
  })
  .transform((gates): RolloutGates => {
    const copy: Partial<typeof gates> = { ...gates };
    delete copy.nota;
    return copy as RolloutGates;
  });

/** Validated, frozen `data/rollout-gates.json`. */
export const ROLLOUT_GATES: Readonly<RolloutGates> = loadConfig("rollout-gates", rolloutGatesSchema, raw);