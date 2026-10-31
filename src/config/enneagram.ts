import { z } from "zod";

import rawAssignments from "../../data/enneagram-assignments.json";
import rawEnneagram from "../../data/enneagram.json";
import { loadConfig } from "./load";

const TYPE_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
const WEIGHT_SUM_TOLERANCE = 1e-9;

const triad = z.enum(["emocional", "mental", "instintiva"]);
const typeKey = z.enum(TYPE_KEYS);
const typeNumber = z.number().int().min(1).max(9);
const wingCode = z.string().regex(/^[1-9]w[1-9]$/);

const enneagramSchema = z.strictObject({
  version: z.string().min(1),
  types: z.record(
    typeKey,
    z.strictObject({
      nombre: z.string().min(1),
      miedo_basico: z.string().min(1),
      deseo_nuclear: z.string().min(1),
      triada: triad,
    }),
  ),
  wings: z.record(wingCode, z.strictObject({ nombre: z.string().min(1), triada: triad })),
  prototypes: z.record(typeKey, z.record(z.string(), z.number().min(0).max(1))),
  integration: z.record(typeKey, typeNumber),
  stress: z.record(typeKey, typeNumber),
  operator_weights: z
    .strictObject({
      mbti: z.number().min(0).max(1),
      enneagram: z.number().min(0).max(1),
      attachment: z.number().min(0).max(1),
    })
    .refine(
      (w) => Math.abs(w.mbti + w.enneagram + w.attachment - 1) <= WEIGHT_SUM_TOLERANCE,
      "operator weights must sum to 1",
    ),
});

const assignmentsSchema = z
  .object({ version: z.string().min(1), assignments: z.record(z.string(), wingCode) })
  .loose();

/** Validated, frozen `data/enneagram.json`. */
export const ENNEAGRAM_DATA = loadConfig("enneagram", enneagramSchema, rawEnneagram);

/** Curated animal → wing overrides from `data/enneagram-assignments.json`. */
export const ENNEAGRAM_ASSIGNMENTS: Readonly<Record<string, string>> = loadConfig(
  "enneagram-assignments",
  assignmentsSchema,
  rawAssignments,
).assignments;
