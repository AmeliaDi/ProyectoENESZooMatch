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

/**
 * How a card protects a sensitive category. `no_puntuable` claims the category
 * carries no weight anywhere (checked against the real config, not taken on
 * faith); `filtro_duro` + `opt_in` are what a scored category needs before it
 * may enter a score at all.
 */
const safeguard = z.enum(["no_puntuable", "filtro_duro", "opt_in"]);

const sensitiveEntry = z.object({
  id: z.string(),
  salvaguardas: z.array(safeguard),
  filtros: z.array(z.string()).optional(),
  nota: z.string(),
});

/** One category of the legal list, with the factors of this project that touch it. */
const sensitiveCategory = z.object({
  id: z.string(),
  factores: z.array(z.string()),
  /** Categories the product never asks about: no safeguard makes them admissible. */
  preguntaProhibida: z.boolean().optional(),
  nota: z.string(),
});

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
  sensitivity: z.object({
    /**
     * Criterio 5. The enumerated Mexican list of *datos sensibles* (LFPDPPP
     * art. 9), not a design assumption: a card that touches any of them has to
     * spell out how it is guarded, and `no_puntuable` is verified against the
     * scoring config rather than taken on faith.
     */
    categorias: z.array(sensitiveCategory).min(1),
    requeridasParaPuntuar: z.array(safeguard).min(1),
    filtrosDuros: z.array(z.string()).min(1),
  }),
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
  /** Criterio 5: every sensitive category this card touches, and how it is guarded. */
  sensible: z.object({ categorias: z.array(sensitiveEntry) }),
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
export type SensitiveEntry = z.infer<typeof sensitiveEntry>;
export type SensitiveCategory = z.infer<typeof sensitiveCategory>;

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
  /** Why criterio 5 failed, one readable string per blocked category. */
  readonly sensitive: readonly string[];
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

/**
 * Factors that carry weight somewhere in the scoring config. A factor is dropped
 * by omission, never by a 0 weight (`factorWeights` only accepts positives), so
 * "is not in this set" is exactly "scores nothing".
 */
export function scoredFactors(config: ScoredConfig): Set<string> {
  const out = new Set<string>();
  for (const category of Object.values(config.categories)) {
    for (const factor of Object.keys(category.factors)) out.add(factor);
  }
  return out;
}

/**
 * Criterio 5. One string per sensitive category the card fails to justify, and
 * an empty array when every category it touches is declared and the declaration
 * is true in the running config. Four ways to fail, in order of how much they
 * hurt: asking a category the product refuses to ask, planning a sensitive
 * factor without declaring the category, claiming `no_puntuable` for a factor
 * that does weigh, and scoring a category without the hard filter + opt-in the
 * law needs. A category id outside the legal list is a typo, so it throws.
 */
export function sensitiveBlocks(c: LayerCandidate, criteria: LayerCriteria, config: ScoredConfig): string[] {
  const scored = scoredFactors(config);
  const legal = new Map<string, SensitiveCategory>(criteria.sensitivity.categorias.map((cat) => [cat.id, cat]));
  const blocks: string[] = [];
  const declared = new Map<string, SensitiveEntry>();
  for (const entry of c.sensible.categorias) {
    if (!legal.has(entry.id)) throw new Error(`categoría sensible desconocida en ${c.id}: ${entry.id}`);
    declared.set(entry.id, entry);
  }
  for (const cat of criteria.sensitivity.categorias) {
    const entry = declared.get(cat.id);
    const planea = c.plan.factores.filter((f) => cat.factores.includes(f));
    if (!entry && planea.length === 0) continue;
    if (cat.preguntaProhibida) {
      blocks.push(`${c.id}: mide «${cat.id}», que la app no pregunta`);
      continue;
    }
    if (!entry) {
      blocks.push(`${c.id}: planea ${planea.join(", ")} sin declarar «${cat.id}»`);
      continue;
    }
    const puntuados = cat.factores.filter((f) => scored.has(f));
    const filtros = entry.filtros ?? [];
    const invalidos = filtros.filter((f) => !criteria.sensitivity.filtrosDuros.includes(f));
    if (invalidos.length > 0) {
      blocks.push(`${c.id}: los filtros citados en «${cat.id}» no son duros: ${invalidos.join(", ")}`);
    }
    if (entry.salvaguardas.includes("filtro_duro") && filtros.length === 0) {
      blocks.push(`${c.id}: reclama filtro_duro en «${cat.id}» sin nombrar el campo`);
    }
    if (puntuados.length === 0) {
      if (!entry.salvaguardas.includes("no_puntuable")) {
        blocks.push(`${c.id}: «${cat.id}» no pesa en ningún track y la ficha no lo declara`);
      }
      continue;
    }
    if (entry.salvaguardas.includes("no_puntuable")) {
      blocks.push(`${c.id}: declara «${cat.id}» no puntuable, pero ${puntuados.join(", ")} sí pesa`);
    }
    const faltan = criteria.sensitivity.requeridasParaPuntuar.filter((s) => !entry.salvaguardas.includes(s));
    if (faltan.length > 0) {
      blocks.push(`${c.id}: «${cat.id}» pesa (${puntuados.join(", ")}) sin ${faltan.join(" + ")}`);
    }
  }
  return blocks;
}

export function evaluateCandidate(
  c: LayerCandidate,
  criteria: LayerCriteria,
  counts: BankCounts,
  config: ScoredConfig,
): CandidateEvaluation {
  const verifiedSupporting = verifiedSupportingStudies(c, criteria);
  const sensitive = sensitiveBlocks(c, criteria, config);
  const result: CriteriaResult = {
    evidence: verifiedSupporting >= criteria.evidence.minVerifiedStudies,
    nonRedundant: c.redundancia.estado !== "redundante",
    license: c.plan.itemsOriginales
      || c.licencia.aprobadaUsuaria === true
      || criteria.license.admissible.includes(c.licencia.estado),
    safe: sensitive.length === 0,
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
  return { id: c.id, criteria: result, decision: decided, verifiedSupporting, sensitive };
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
  configPath: string,
): { criteria: LayerCriteria; data: LayerCandidates; counts: BankCounts; config: ScoredConfig } {
  return {
    criteria: layerCriteriaSchema.parse(JSON.parse(readFileSync(criteriaPath, "utf8"))),
    data: layerCandidatesSchema.parse(JSON.parse(readFileSync(candidatesPath, "utf8"))),
    counts: loadBankCounts(bankPath),
    config: JSON.parse(readFileSync(configPath, "utf8")) as ScoredConfig,
  };
}

const mark = (ok: boolean): string => (ok ? "sí" : "**no**");

/**
 * The criterio-5 cell states *how* the category is guarded, not just that the
 * card passed: `no_puntuable` is only printed because `sensitiveBlocks`
 * verified it against the scoring config.
 */
function sensitiveCell(c: LayerCandidate, e: CandidateEvaluation): string {
  if (e.sensitive.length > 0) return `**no** — ${e.sensitive.join("; ")}`;
  if (c.sensible.categorias.length === 0) return "sí (no toca)";
  return `sí · ${c.sensible.categorias.map((x) => `${x.id}: ${x.salvaguardas.join("+")}`).join(" · ")}`;
}

export function decisionTable(
  data: LayerCandidates,
  evaluations: readonly CandidateEvaluation[],
  counts: BankCounts,
): string {
  const rows = data.candidates.map((c) => {
    const e = evaluations.find((x) => x.id === c.id);
    if (!e) throw new Error(`sin evaluación para ${c.id}`);
    const { evidence, nonRedundant, license } = e.criteria;
    const plan = planDe(c.plan.factores, counts);
    return `| ${c.nombre} | ${mark(evidence)} (${e.verifiedSupporting}) | ${mark(nonRedundant)} | ${mark(license)} | ${plan.nucleo} + ${plan.opcional} | ${sensitiveCell(c, e)} | **${e.decision}** |`;
  });
  return [
    "| Capa candidata | 1. Evidencia (estudios verificados) | 2. No redundante | 3. Licencia u originales | 4. Ítems núcleo + opcionales | 5. Datos sensibles (LFPDPPP art. 9) | Decisión |",
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
 * copy was hand-pasted and had drifted from the registry. The document's own
 * line ending is preserved: this file is CRLF on disk, and splicing LF rows
 * into it would make `layers.test.ts` see a table that is byte-identical to
 * nothing.
 */
export function syncDecisionTable(doc: string, table: string): string {
  const eol = doc.includes("\r\n") ? "\r\n" : "\n";
  const lines = doc.split(/\r?\n/);
  const start = lines.findIndex((line) => line.startsWith("| Capa candidata |"));
  if (start < 0) throw new Error("docs/CAPAS_EVIDENCIA.md: no está la tabla de decisión de §2");
  let end = start;
  while (end < lines.length && lines[end]!.startsWith("|")) end += 1;
  return [...lines.slice(0, start), ...table.split("\n"), ...lines.slice(end)].join(eol);
}
