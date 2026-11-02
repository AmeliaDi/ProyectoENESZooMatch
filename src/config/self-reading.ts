import { z } from "zod";

import { PARAM_LABELS } from "@/types/matching-config";

import raw from "../../data/self-reading.json";
import { loadConfig } from "./load";

/**
 * `data/self-reading.json`: how the own-profile card ("Tu carta") turns the
 * latent profile into kind, owner-only readings. Copy and thresholds live
 * here; the pure maths lives in `domain/psychometrics/self-reading`.
 */
const unit = z.number().min(0).max(1);
const text = z.string().trim().min(1).max(120);

function annotated<T extends z.ZodType>(value: T) {
  return z
    .strictObject({ valor: value, etiqueta: z.enum(PARAM_LABELS), fuente: z.string().min(1) })
    .transform((leaf) => (leaf as unknown as { valor: z.output<T> }).valor);
}

const virtue = z.strictObject({ title: z.string().trim().min(1).max(24), text });

const scale = z.strictObject({
  factor: z.string().regex(/^[a-z]+_[a-z0-9_]+$/),
  label: z.string().trim().min(1).max(40),
  low: z.string().trim().min(1).max(48),
  high: z.string().trim().min(1).max(48),
  virtues: z.strictObject({ low: virtue.optional(), high: virtue.optional() }).optional(),
});

const section = z.strictObject({
  id: z.enum(["hexaco", "big_five", "mbti", "valores", "relacional", "afecto", "estilo"]),
  title: z.string().trim().min(1).max(40),
  blurb: text,
  scales: z.array(scale).min(1),
});

export const selfReadingSchema = z
  .strictObject({
    version: z.string().min(1),
    uncertainty: z.strictObject({
      intervalZ: annotated(z.number().positive().max(3)),
      clearReliability: annotated(unit),
      tentativeReliability: annotated(unit),
      lowBand: annotated(unit),
      highBand: annotated(unit),
      virtueMargin: annotated(z.number().nonnegative()),
    }),
    virtuesMax: z.number().int().min(1).max(8),
    affinitiesTop: z.number().int().min(1).max(10),
    sections: z.array(section).min(1),
  })
  .refine((c) => c.uncertainty.tentativeReliability < c.uncertainty.clearReliability, "tentative < clear")
  .refine((c) => c.uncertainty.lowBand < 0.5 && c.uncertainty.highBand > 0.5, "bands straddle the median")
  .refine((c) => {
    const factors = c.sections.flatMap((s) => s.scales.map((x) => x.factor));
    return new Set(factors).size === factors.length;
  }, "each factor appears once")
  .refine((c) => new Set(c.sections.map((s) => s.id)).size === c.sections.length, "unique section ids");

export type SelfReadingConfig = z.output<typeof selfReadingSchema>;

export const SELF_READING: Readonly<SelfReadingConfig> = loadConfig("self-reading", selfReadingSchema, raw);
