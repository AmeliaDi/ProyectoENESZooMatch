/**
 * Layer admission (Phase 2). Derives each candidate's decision from the five
 * mandatory criteria in data/literature/layer-criteria.json, so the table in
 * docs/CAPAS_EVIDENCIA.md is computed, not hand-written.
 */
import { readFileSync } from "node:fs";

import { z } from "zod";

const verification = z.enum(["crossref_abstract", "crossref_metadatos", "pendiente_humana"]);
const effect = z.enum(["similitud", "ventana", "complementariedad", "nivel", "nulo", "desconocido"]);
const decision = z.enum(["admitida", "extra_peso_minimo", "opcional_narrativa", "descartada"]);

export const layerCriteriaSchema = z.object({
  version: z.string(),
  evidence: z.object({
    minVerifiedStudies: z.number().int().positive(),
    requireDyadicOrRelationalOutcome: z.boolean(),
    admissibleForScore: z.array(effect).min(1),
  }),
  redundancy: z.object({ maxLatentCorrelationWithHexaco: z.number().gt(0).lt(1) }),
  license: z.object({ admissible: z.array(z.string()).min(1) }),
  extras: z.object({ maxTotalWeight: z.number().gt(0).lt(0.1) }),
  budget: z.object({
    coreMaxMinutes: z.number().positive(),
    secondsPerLikertItem: z.number().positive(),
    coreTargetItems: z.number().int().positive(),
    coreToleranceItems: z.number().int().nonnegative(),
  }),
  sensitivity: z.object({ forbidSensitiveInference: z.boolean(), forbidSexualBehaviorItems: z.boolean() }),
});

const study = z.object({
  ref: z.string(),
  doi: z.string().nullable(),
  verificacion: verification,
  efecto: effect,
  fuerza: z.enum(["fuerte", "moderada", "debil", "sin_datos"]),
  hallazgo: z.string(),
});

const candidate = z.object({
  id: z.string(),
  nombre: z.string(),
  relaciones: z.array(z.enum(["pareja", "amistad"])).min(1),
  evidencia: z.array(study).min(1),
  efectoParaPuntaje: z.enum(["similitud", "ventana", "complementariedad", "solo_nivel", "sin_evidencia"]),
  redundancia: z.object({ estado: z.enum(["no_redundante_teorico", "redundante", "desconocido"]), nota: z.string() }),
  escalaEspanol: z.object({ nombre: z.string(), ref: z.string(), doi: z.string().nullable(), estado: z.string() }),
  licencia: z.object({
    estado: z.string(),
    url: z.string().nullable(),
    cita: z.string().nullable(),
    consultado: z.string(),
    /** ADR-015: uso personal y académico aprobado por la usuaria. Se conserva `estado` como hallazgo. */
    aprobadaUsuaria: z.boolean().optional(),
  }),
  plan: z.object({
    itemsOriginales: z.boolean(),
    itemsNucleo: z.number().int().nonnegative(),
    itemsOpcional: z.number().int().nonnegative(),
    funcion: z.string(),
  }),
  sensible: z.object({ inferencia: z.boolean(), conductaSexual: z.boolean() }),
  /** ADR-015: decisión de producto para conservar una capa sin evidencia como extra de peso mínimo. */
  productoExtra: z.object({ pesoMax: z.number().gt(0), motivo: z.string() }).optional(),
  decisionDeclarada: decision,
  motivo: z.string(),
});

export const layerCandidatesSchema = z.object({
  version: z.string(),
  fixedCore: z.array(z.object({
    id: z.string(),
    capa: z.number().int().min(0).max(4),
    itemsNucleo: z.number().int().nonnegative(),
    likert: z.boolean(),
    motivo: z.string(),
  })),
  candidates: z.array(candidate).min(1),
});

export type LayerCriteria = z.infer<typeof layerCriteriaSchema>;
export type LayerCandidates = z.infer<typeof layerCandidatesSchema>;
export type LayerCandidate = z.infer<typeof candidate>;
export type LayerDecision = z.infer<typeof decision>;

export interface CriteriaResult {
  readonly evidence: boolean;
  readonly nonRedundant: boolean;
  readonly license: boolean;
  readonly safe: boolean;
}

export interface CandidateEvaluation {
  readonly id: string;
  readonly criteria: CriteriaResult;
  readonly decision: LayerDecision;
  readonly verifiedSupporting: number;
}

export function verifiedSupportingStudies(c: LayerCandidate, criteria: LayerCriteria): number {
  return c.evidencia.filter((s) => s.verificacion === "crossref_abstract" && criteria.evidence.admissibleForScore.includes(s.efecto)).length;
}

export function evaluateCandidate(c: LayerCandidate, criteria: LayerCriteria): CandidateEvaluation {
  const verifiedSupporting = verifiedSupportingStudies(c, criteria);
  const result: CriteriaResult = {
    evidence: verifiedSupporting >= criteria.evidence.minVerifiedStudies,
    nonRedundant: c.redundancia.estado !== "redundante",
    license: c.plan.itemsOriginales
      || c.licencia.aprobadaUsuaria === true
      || criteria.license.admissible.includes(c.licencia.estado),
    safe: !(criteria.sensitivity.forbidSensitiveInference && c.sensible.inferencia)
      && !(criteria.sensitivity.forbidSexualBehaviorItems && c.sensible.conductaSexual),
  };
  const all = result.evidence && result.nonRedundant && result.license && result.safe;
  // Narrative-only modules carry zero weight, so they only need to be safe,
  // licensable and actually planned as optional items. Product "extras" are
  // the same plus a small, capped weight (never a floor or dealbreaker).
  const usable = !all && result.safe && result.license && c.plan.itemsOpcional > 0;
  const decided: LayerDecision = all
    ? "admitida"
    : usable && c.productoExtra
      ? "extra_peso_minimo"
      : usable ? "opcional_narrativa" : "descartada";
  return { id: c.id, criteria: result, decision: decided, verifiedSupporting };
}

/** Total weight reserved for product extras; must stay under `extras.maxTotalWeight`. */
export function extrasWeight(data: LayerCandidates, evaluations: readonly CandidateEvaluation[]): number {
  return data.candidates
    .filter((c) => evaluations.find((e) => e.id === c.id)?.decision === "extra_peso_minimo")
    .reduce((s, c) => s + (c.productoExtra?.pesoMax ?? 0), 0);
}

export interface BudgetSummary {
  readonly coreItems: number;
  readonly coreLikertItems: number;
  readonly optionalItems: number;
  readonly coreMinutes: number;
  readonly withinBudget: boolean;
}

/** Core = fixed core + admitted layers. Filters are not Likert and are timed as Likert (conservative). */
export function budgetSummary(data: LayerCandidates, criteria: LayerCriteria, evaluations: readonly CandidateEvaluation[]): BudgetSummary {
  const admitted = new Set(evaluations.filter((e) => e.decision === "admitida").map((e) => e.id));
  const included = data.candidates.filter((c) => admitted.has(c.id));
  const fixed = data.fixedCore.reduce((s, f) => s + f.itemsNucleo, 0);
  const fixedLikert = data.fixedCore.filter((f) => f.likert).reduce((s, f) => s + f.itemsNucleo, 0);
  const layerCore = included.reduce((s, c) => s + c.plan.itemsNucleo, 0);
  const optionalItems = data.candidates
    .filter((c) => evaluations.find((e) => e.id === c.id)?.decision !== "descartada")
    .reduce((s, c) => s + c.plan.itemsOpcional, 0);
  const coreItems = fixed + layerCore;
  const coreMinutes = (coreItems * criteria.budget.secondsPerLikertItem) / 60;
  const { coreTargetItems, coreToleranceItems, coreMaxMinutes } = criteria.budget;
  return {
    coreItems,
    coreLikertItems: fixedLikert + layerCore,
    optionalItems,
    coreMinutes,
    withinBudget: coreMinutes <= coreMaxMinutes && Math.abs(coreItems - coreTargetItems) <= coreToleranceItems,
  };
}

export function loadLayerFiles(criteriaPath: string, candidatesPath: string): { criteria: LayerCriteria; data: LayerCandidates } {
  return {
    criteria: layerCriteriaSchema.parse(JSON.parse(readFileSync(criteriaPath, "utf8"))),
    data: layerCandidatesSchema.parse(JSON.parse(readFileSync(candidatesPath, "utf8"))),
  };
}

const mark = (ok: boolean): string => (ok ? "sí" : "**no**");

export function decisionTable(data: LayerCandidates, evaluations: readonly CandidateEvaluation[]): string {
  const rows = data.candidates.map((c) => {
    const e = evaluations.find((x) => x.id === c.id);
    if (!e) throw new Error(`sin evaluación para ${c.id}`);
    const { evidence, nonRedundant, license, safe } = e.criteria;
    return `| ${c.nombre} | ${mark(evidence)} (${e.verifiedSupporting}) | ${mark(nonRedundant)} | ${mark(license)} | ${c.plan.itemsNucleo} + ${c.plan.itemsOpcional} | ${mark(safe)} | **${e.decision}** |`;
  });
  return [
    "| Capa candidata | 1. Evidencia (estudios verificados) | 2. No redundante | 3. Licencia u originales | 4. Ítems núcleo + opcionales | 5. Sin dato sensible | Decisión |",
    "|---|---|---|---|---|---|---|",
    ...rows,
  ].join("\n");
}
