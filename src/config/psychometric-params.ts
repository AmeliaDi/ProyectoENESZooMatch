import { z } from "zod";

import raw from "../../data/psychometric-params.json";
import { loadConfig } from "./load";

/**
 * Measurement-model parameters estimated offline by scripts/psychometrics/run.py
 * (graded response model, latent correlation prior). Server-only by convention:
 * deliberately NOT re-exported from `@/config` so the ~110 KB file never ships
 * to the browser. Values are SYNTHETIC estimates (see `advertencia`).
 */

const LABELS = ["prior_literatura", "estimado_sintetico", "supuesto_diseno", "pendiente_verificacion"] as const;

const itemParamsSchema = z.strictObject({
  factor: z.string().min(1),
  clave: z.union([z.literal(1), z.literal(-1)]),
  lambda: z.number().gt(0).lt(1),
  a: z.number().positive(),
  b: z.array(z.number()).length(4),
  etiqueta: z.enum(LABELS),
  marcado_baja_carga: z.boolean(),
});

const scaleSchema = z.strictObject({
  k: z.number().int().min(2),
  omega: z.number().min(0).max(1).nullable(),
  alpha_ordinal: z.number().max(1).nullable(),
  lambda_min: z.number().optional(),
  lambda_max: z.number().optional(),
  r_inter: z.number().min(-1).max(1).optional(),
});

export const psychometricParamsSchema = z
  .strictObject({
    version: z.string().min(1),
    generado_por: z.string().min(1),
    entrada_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    semilla: z.number().int(),
    n_sintetico: z.number().int().min(5000),
    advertencia: z.string().min(1),
    factores: z.array(z.string().min(1)).nonempty(),
    covarianza_latente: z.strictObject({
      matriz: z.array(z.array(z.number().min(-1).max(1))),
      ajuste_psd_max: z.number().min(0),
      priors: z.array(
        z.strictObject({
          a: z.string(),
          b: z.string(),
          r: z.number().min(-1).max(1),
          etiqueta: z.enum(LABELS),
          fuente: z.string(),
        }),
      ),
    }),
    items: z.record(z.string(), itemParamsSchema),
    escalas: z.record(z.string(), scaleSchema),
    ajuste_nucleo: z.strictObject({ cfi: z.number(), tli: z.number(), rmsea: z.number(), srmr: z.number() }),
  })
  .superRefine((params, ctx) => {
    const k = params.factores.length;
    const m = params.covarianza_latente.matriz;
    if (m.length !== k || m.some((row) => row.length !== k)) {
      ctx.addIssue({ code: "custom", message: `latent matrix must be ${k}x${k}` });
      return;
    }
    m.forEach((row, i) =>
      row.forEach((value, j) => {
        if (i === j && Math.abs(value - 1) > 1e-6) ctx.addIssue({ code: "custom", message: `diag ${i} != 1` });
        if (Math.abs(value - (m[j]?.[i] ?? Number.NaN)) > 1e-9) {
          ctx.addIssue({ code: "custom", message: `latent matrix not symmetric at ${i},${j}` });
        }
      }),
    );
    const factors = new Set(params.factores);
    for (const [id, item] of Object.entries(params.items)) {
      if (!factors.has(item.factor)) ctx.addIssue({ code: "custom", message: `${id}: unknown factor ${item.factor}` });
    }
  });

export type PsychometricParams = z.output<typeof psychometricParamsSchema>;

export const PSYCHOMETRIC_PARAMS: Readonly<PsychometricParams> = loadConfig(
  "psychometric-params",
  psychometricParamsSchema,
  raw,
);
