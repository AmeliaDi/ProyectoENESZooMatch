/**
 * Layer admission (Phase 2). Derives each candidate's decision from the five
 * mandatory criteria in data/literature/layer-criteria.json, so the table in
 * docs/CAPAS_EVIDENCIA.md is computed, not hand-written.
 */
import { readFileSync } from "node:fs";

import { z } from "zod";

const verification = z.enum(["crossref_abstract", "crossref_metadatos", "pendiente_humana"]);
/**
 * "seleccion" is assortative mating: partners turn out to be similar. It is the
 * category error the audit found repeated across cards, so it is a value of its
 * own and never admissible for scoring — similarity observed in existing couples
 * says nothing about which couple will form or how it will do afterwards.
 */
const effect = z.enum(["similitud", "ventana", "complementariedad", "seleccion", "nivel", "nulo", "desconocido"]);
const decision = z.enum(["admitida", "extra_peso_minimo", "opcional_narrativa", "descartada"]);

export const layerCriteriaSchema = z.object({
  version: z.string(),
  evidence: z.object({
    minVerifiedStudies: z.number().int().positive(),
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
  /** `factores` is the only item accounting a card owns: the counts come from the bank. */
  plan: z.object({
    itemsOriginales: z.boolean(),
    factores: z.array(z.string()).min(0),
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
    factores: z.array(z.string()),
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

/** How many items measure a latent factor, split by mandatory core vs optional module. */
export interface FactorCounts {
  readonly nucleo: number;
  readonly opcional: number;
  readonly total: number;
}

export type BankCounts = ReadonlyMap<string, FactorCounts>;

/**
 * Item counts read from data/microtest.json. Before ADR-044 the cards declared
 * their own numbers, and the sum (54) disagreed with the delivered core (58)
 * because the hand counts were by id prefix, not by factor.
 */
export function loadBankCounts(bankPath: string): BankCounts {
  const bank = JSON.parse(readFileSync(bankPath, "utf8")) as {
    items?: ReadonlyArray<{ factor?: string; modulo?: string }>;
  };
  const counts = new Map<string, FactorCounts>();
  for (const item of bank.items ?? []) {
    if (!item.factor) continue;
    const prev = counts.get(item.factor) ?? { nucleo: 0, opcional: 0, total: 0 };
    const inCore = item.modulo === "nucleo";
    counts.set(item.factor, {
      nucleo: prev.nucleo + (inCore ? 1 : 0),
      opcional: prev.opcional + (inCore ? 0 : 1),
      total: prev.total + 1,
    });
  }
  return counts;
}

/** Derived plan of a card. A factor that is not in the bank is a typo, so it throws. */
export function planDe(factores: readonly string[], counts: BankCounts): FactorCounts {
  let nucleo = 0;
  let opcional = 0;
  for (const factor of factores) {
    const c = counts.get(factor);
    if (!c) throw new Error(`factor desconocido en el banco: ${factor}`);
    nucleo += c.nucleo;
    opcional += c.opcional;
  }
  return { nucleo, opcional, total: nucleo + opcional };
}

/**
 * Studies that license this layer's scoring function. Three gates: the abstract
 * was actually read, the effect is a pair-level form (`admissibleForScore`
 * deliberately omits `nivel` and `seleccion`: actor-level effects and assortment
 * say nothing about compatibility), and the effect **matches the form the layer
 * would be scored with** — a complementarity result does not license a
 * symmetric similarity kernel.
 */
export function verifiedSupportingStudies(c: LayerCandidate, criteria: LayerCriteria): number {
  const form = c.efectoParaPuntaje === "solo_nivel" ? "nivel" : c.efectoParaPuntaje;
  return c.evidencia.filter(
    (s) =>
      s.verificacion === "crossref_abstract" &&
      criteria.evidence.admissibleForScore.includes(s.efecto) &&
      s.efecto === form,
  ).length;
}

export function evaluateCandidate(c: LayerCandidate, criteria: LayerCriteria, counts: BankCounts): CandidateEvaluation {
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
  const usable = !all && result.safe && result.license && planDe(c.plan.factores, counts).opcional > 0;
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
export function budgetSummary(
  data: LayerCandidates,
  criteria: LayerCriteria,
  evaluations: readonly CandidateEvaluation[],
  counts: BankCounts,
): BudgetSummary {
  const admitted = new Set(evaluations.filter((e) => e.decision === "admitida").map((e) => e.id));
  const included = data.candidates.filter((c) => admitted.has(c.id));
  const fixed = data.fixedCore.reduce((s, f) => s + planDe(f.factores, counts).nucleo, 0);
  const fixedLikert = data.fixedCore
    .filter((f) => f.likert)
    .reduce((s, f) => s + planDe(f.factores, counts).nucleo, 0);
  const layerCore = included.reduce((s, c) => s + planDe(c.plan.factores, counts).nucleo, 0);
  const optionalItems = data.candidates
    .filter((c) => evaluations.find((e) => e.id === c.id)?.decision !== "descartada")
    .reduce((s, c) => s + planDe(c.plan.factores, counts).opcional, 0);
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

export function loadLayerFiles(
  criteriaPath: string,
  candidatesPath: string,
  bankPath: string,
): { criteria: LayerCriteria; data: LayerCandidates; counts: BankCounts } {
  return {
    criteria: layerCriteriaSchema.parse(JSON.parse(readFileSync(criteriaPath, "utf8"))),
    data: layerCandidatesSchema.parse(JSON.parse(readFileSync(candidatesPath, "utf8"))),
    counts: loadBankCounts(bankPath),
  };
}

const mark = (ok: boolean): string => (ok ? "sí" : "**no**");

export function decisionTable(
  data: LayerCandidates,
  evaluations: readonly CandidateEvaluation[],
  counts: BankCounts,
): string {
  const rows = data.candidates.map((c) => {
    const e = evaluations.find((x) => x.id === c.id);
    if (!e) throw new Error(`sin evaluación para ${c.id}`);
    const { evidence, nonRedundant, license, safe } = e.criteria;
    const plan = planDe(c.plan.factores, counts);
    return `| ${c.nombre} | ${mark(evidence)} (${e.verifiedSupporting}) | ${mark(nonRedundant)} | ${mark(license)} | ${plan.nucleo} + ${plan.opcional} | ${mark(safe)} | **${e.decision}** |`;
  });
  return [
    "| Capa candidata | 1. Evidencia (estudios verificados) | 2. No redundante | 3. Licencia u originales | 4. Ítems núcleo + opcionales | 5. Sin dato sensible | Decisión |",
    "|---|---|---|---|---|---|---|",
    ...rows,
  ].join("\n");
}

/** The slice of matching-config that the licensing audit needs: factors and track weights. */
export interface ScoredConfig {
  readonly categories: Readonly<Record<string, { readonly factors: Readonly<Record<string, number>> }>>;
  readonly tracks: Readonly<Record<string, { readonly core?: Record<string, number>; readonly tail?: Record<string, number> }>>;
}

export interface LicensingGap {
  readonly categoria: string;
  readonly pesoMaximo: number;
  readonly licenciado: number;
  readonly fichas: readonly string[];
  readonly sinFicha: boolean;
}

/**
 * Categories that carry more weight in some track than their cards license.
 * This is the check B1's acceptance criterion asked for, and it exists because
 * `relacional` weighs 0,20 in romance and nobody had ever written its card.
 * Licensing is graduated: `admitida` licenses the category, a product extra
 * licenses at most its own `pesoMax` (ADR-015), and a narrative-only or
 * discarded card licenses nothing.
 */
export function licensingGaps(
  data: LayerCandidates,
  evaluations: readonly CandidateEvaluation[],
  config: ScoredConfig,
): LicensingGap[] {
  const owner = new Map<string, string[]>();
  const claim = (id: string, factores: readonly string[]) => {
    for (const f of factores) owner.set(f, [...(owner.get(f) ?? []), id]);
  };
  for (const f of data.fixedCore) claim(f.id, f.factores);
  for (const c of data.candidates) claim(c.id, c.plan.factores);

  const licensedBy = new Map<string, number>();
  for (const entry of data.fixedCore) licensedBy.set(entry.id, Number.POSITIVE_INFINITY);
  for (const c of data.candidates) {
    const decision = evaluations.find((e) => e.id === c.id)?.decision ?? "descartada";
    licensedBy.set(c.id, decision === "admitida" ? Number.POSITIVE_INFINITY : (c.productoExtra?.pesoMax ?? 0));
  }

  const gaps: LicensingGap[] = [];
  for (const [categoria, cfg] of Object.entries(config.categories)) {
    let pesoMaximo = 0;
    for (const track of Object.values(config.tracks)) {
      pesoMaximo = Math.max(pesoMaximo, track.core?.[categoria] ?? 0, track.tail?.[categoria] ?? 0);
    }
    if (pesoMaximo <= 0) continue;
    const fichas = [...new Set(Object.keys(cfg.factors).flatMap((f) => owner.get(f) ?? []))].sort();
    const licenciado = Math.max(0, ...fichas.map((id) => licensedBy.get(id) ?? 0));
    if (licenciado >= pesoMaximo) continue;
    gaps.push({ categoria, pesoMaximo, licenciado, fichas, sinFicha: fichas.length === 0 });
  }
  return gaps.sort((a, b) => b.pesoMaximo - a.pesoMaximo || a.categoria.localeCompare(b.categoria));
}

/**
 * Splices the computed table into §2 of docs/CAPAS_EVIDENCIA.md. The section
 * promises the table is the output of `npm run data:layers`; before this, that
 * copy was hand-pasted and had drifted from the registry.
 */
export function syncDecisionTable(doc: string, table: string): string {
  const lines = doc.split("\n");
  const start = lines.findIndex((line) => line.startsWith("| Capa candidata |"));
  if (start < 0) throw new Error("docs/CAPAS_EVIDENCIA.md: no está la tabla de decisión de §2");
  let end = start;
  while (end < lines.length && lines[end]!.startsWith("|")) end += 1;
  return [...lines.slice(0, start), ...table.split("\n"), ...lines.slice(end)].join("\n");
}
