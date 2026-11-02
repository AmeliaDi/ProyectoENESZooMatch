import { z } from "zod";

import raw from "../../data/evidence-summary.json";
import { loadConfig } from "./load";

/**
 * `data/evidence-summary.json`: the friendly evidence page (`/evidencia`).
 * `decision` ids link each row to `docs/EVIDENCIA.md`; they are internal and
 * never rendered.
 */
const STRENGTHS = ["fuerte", "moderada", "debil", "heuristica"] as const;
const text = z.string().trim().min(1).max(260);

export const evidenceSummarySchema = z.strictObject({
  version: z.string().min(1),
  nota: z.string().min(1),
  intro: text,
  layers: z
    .array(
      z.strictObject({
        title: z.string().min(1).max(40),
        strength: z.enum(STRENGTHS),
        text,
        decision: z.array(z.string().regex(/^EV-\d{2,3}$/)).min(1),
      }),
    )
    .min(1),
  strength_labels: z.strictObject({ fuerte: text, moderada: text, debil: text, heuristica: text }),
  unknowns: z.array(text).min(3),
  how: z.array(text).min(1),
  closing: text,
});

export type EvidenceSummary = z.output<typeof evidenceSummarySchema>;

export const EVIDENCE_SUMMARY: Readonly<EvidenceSummary> = loadConfig("evidence-summary", evidenceSummarySchema, raw);
