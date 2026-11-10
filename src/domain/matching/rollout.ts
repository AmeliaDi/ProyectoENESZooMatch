/**
 * Rollout gates (Fase 6, docs/COMPARATIVA_MODELOS.md). A challenger engine may
 * replace the live one only when EVERY gate passes; one failure keeps the
 * incumbent and records the reason. Pure: the measurements come from the shadow
 * runner, the thresholds from `data/rollout-gates.json`.
 */
import type { MatchTrack } from "@/types/microtest";
import type {
  EngineMeasurement,
  GateResult,
  RolloutDecision,
  RolloutGates,
} from "@/types/rollout-gates";

import { normalizeMatchPairs, type GlobalMatch } from "./compute-matches";

const TRACKS: readonly MatchTrack[] = ["romance", "amistad"];

/**
 * A pair with an open conversation: losing it is what the conservation gate
 * forbids. `similarity` is the value already stored in `public.matches`, so
 * restoring the pair re-publishes the real row instead of inventing a score.
 */
export interface ProtectedPair {
  readonly track: MatchTrack;
  readonly userA: string;
  readonly userB: string;
  readonly similarity: number;
}

/** Unordered, case-insensitive pair identity: endpoint order is not a difference. */
function pairKey(track: string, a: string, b: string): string {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  const [userA, userB] = left < right ? [left, right] : [right, left];
  return `${track}:${userA}:${userB}`;
}

/**
 * Protected pairs the next match set would drop. Order-insensitive and
 * case-insensitive, so a canonical-order change alone never counts as a loss.
 */
export function conservationLoss(
  next: readonly GlobalMatch[],
  protectedPairs: readonly ProtectedPair[],
): number {
  const published = new Set(next.map((m) => pairKey(m.track, m.userA, m.userB)));
  return protectedPairs.filter((p) => !published.has(pairKey(p.track, p.userA, p.userB))).length;
}

/**
 * The replacement set with every protected pair put back. Activation uses this
 * instead of the raw engine output, so an open conversation survives any
 * reranking. Idempotent: conserving an already-conserved set changes nothing.
 */
export function conserveProtected(
  next: readonly GlobalMatch[],
  protectedPairs: readonly ProtectedPair[],
): GlobalMatch[] {
  const published = new Set(next.map((m) => pairKey(m.track, m.userA, m.userB)));
  const restored: GlobalMatch[] = protectedPairs
    .filter((p) => !published.has(pairKey(p.track, p.userA, p.userB)))
    .map((p) => ({ track: p.track, userA: p.userA, userB: p.userB, similarity: p.similarity, badges: [] }));
  return normalizeMatchPairs([...next, ...restored]);
}

/**
 * Structural defects of a published match set. A `GlobalMatch` carries both
 * endpoints, so canonical order (`userA < userB`) plus uniqueness IS the
 * symmetry invariant: the pair is published once and both people see it.
 */
export function structuralViolations(matches: readonly GlobalMatch[]): number {
  const seen = new Set<string>();
  let violations = 0;
  for (const match of matches) {
    if (!(match.userA < match.userB)) violations += 1;
    if (!Number.isFinite(match.similarity) || match.similarity < 0 || match.similarity > 1) violations += 1;
    const key = pairKey(match.track, match.userA, match.userB);
    if (seen.has(key)) violations += 1;
    seen.add(key);
  }
  return violations;
}

const f = (value: number, digits = 4) => value.toFixed(digits);
const pct = (value: number) => `${(100 * value).toFixed(1)} %`;

function gate(
  id: string,
  label: string,
  passed: boolean,
  observed: string,
  required: string,
  reason: string,
): GateResult {
  return { id, label, passed, observed, required, reason: passed ? "" : reason };
}

/** Worst value across both tracks; the gate must hold for each of them. */
function worst(
  measurement: EngineMeasurement,
  pick: (track: MatchTrack) => number,
): { value: number; track: MatchTrack } {
  return TRACKS.map((track) => ({ value: pick(track), track })).reduce((a, b) => (a.value <= b.value ? a : b));
}

function best(
  measurement: EngineMeasurement,
  pick: (track: MatchTrack) => number,
): { value: number; track: MatchTrack } {
  return TRACKS.map((track) => ({ value: pick(track), track })).reduce((a, b) => (a.value >= b.value ? a : b));
}

/**
 * Evaluates every gate for `candidate` against the live `incumbent`. The
 * decision is the conjunction: there is no weighted score and no override.
 */
export function evaluateGates(
  candidate: EngineMeasurement,
  incumbent: EngineMeasurement,
  gates: RolloutGates,
): RolloutDecision {
  const results: GateResult[] = [];

  for (const track of TRACKS) {
    const range = gates.cobertura[track];
    const value = candidate.tracks[track].poolCoverage;
    const passed = value >= range.min && value <= range.max;
    results.push(
      gate(
        `cobertura.${track}`,
        `Cobertura de ${track} (pool que el track atiende por diseño)`,
        passed,
        pct(value),
        `entre ${pct(range.min)} y ${pct(range.max)}`,
        `La cobertura de ${track} del candidato (${pct(value)}) cae fuera del rango objetivo; el vigente publica ${pct(incumbent.tracks[track].poolCoverage)}.`,
      ),
    );
  }

  const equity = worst(candidate, (t) => candidate.tracks[t].equityFloor);
  results.push(
    gate(
      "equidad",
      "Cobertura mínima (pool) / mediana por subpoblación",
      equity.value >= gates.equidad.min_ratio,
      `${f(equity.value)} (${equity.track})`,
      `≥ ${f(gates.equidad.min_ratio, 2)}`,
      `Alguna subpoblación de ${equity.track} queda por debajo de ${f(gates.equidad.min_ratio, 2)} × la mediana (${f(equity.value)}). No se fuerzan matches falsos: la corrección es transparencia y visibilidad en amistad.`,
    ),
  );

  const gini = best(candidate, (t) => candidate.tracks[t].gini);
  const giniCeiling = Math.min(
    gates.exposicion.gini_max[gini.track],
    gates.exposicion.no_peor_que_actual ? incumbent.tracks[gini.track].gini : Number.POSITIVE_INFINITY,
  );
  results.push(
    gate(
      "exposicion",
      "Gini de exposición (reparto de visibilidad, no deseabilidad)",
      gini.value <= giniCeiling,
      `${f(gini.value)} (${gini.track})`,
      `≤ ${f(giniCeiling)}`,
      `El candidato concentra la exposición de ${gini.track} (Gini ${f(gini.value)}) por encima del techo ${f(giniCeiling)}; el vigente tiene ${f(incumbent.tracks[gini.track].gini)}.`,
    ),
  );

  const rho = worst(candidate, (t) => candidate.tracks[t].spearmanVsIncumbent);
  results.push(
    gate(
      "correlacion_rangos",
      "Correlación de rangos con el motor vigente (cambio gradual)",
      rho.value >= gates.correlacion_rangos.min_spearman,
      `ρ = ${f(rho.value)} (${rho.track})`,
      `ρ ≥ ${f(gates.correlacion_rangos.min_spearman, 2)}`,
      `El reordenamiento de ${rho.track} (ρ = ${f(rho.value)}) es demasiado abrupto respecto al motor vigente; cambiaría la constelación de golpe.`,
    ),
  );

  const noiseRho = worst(candidate, (t) => candidate.tracks[t].noise.spearman);
  const noiseJaccard = worst(candidate, (t) => candidate.tracks[t].noise.jaccard);
  const noisePassed =
    noiseRho.value >= gates.estabilidad_ruido.min_spearman &&
    noiseJaccard.value >= gates.estabilidad_ruido.min_jaccard;
  results.push(
    gate(
      "estabilidad_ruido",
      "Estabilidad ante ruido de respuesta (±1 Likert)",
      noisePassed,
      `ρ = ${f(noiseRho.value)}, Jaccard = ${f(noiseJaccard.value)}`,
      `ρ ≥ ${f(gates.estabilidad_ruido.min_spearman, 2)} y Jaccard ≥ ${f(gates.estabilidad_ruido.min_jaccard, 2)}`,
      `El candidato es demasiado sensible al ruido de respuesta (ρ = ${f(noiseRho.value)}, Jaccard = ${f(noiseJaccard.value)}): publicaría matches distintos ante variaciones mínimas del test.`,
    ),
  );

  results.push(
    gate(
      "invariantes",
      "Violaciones estructurales (simetría, orden, duplicados, rango)",
      candidate.violations <= gates.invariantes.max_violaciones,
      String(candidate.violations),
      `≤ ${gates.invariantes.max_violaciones}`,
      `El candidato produce ${candidate.violations} violaciones estructurales; el vigente produce ${incumbent.violations}.`,
    ),
  );

  const msPerThousand = candidate.pairs === 0 ? 0 : (candidate.elapsedMs * 1000) / candidate.pairs;
  results.push(
    gate(
      "tiempo",
      "Tiempo de cómputo por mil pares evaluados",
      msPerThousand <= gates.tiempo.max_ms_por_mil_pares,
      `${f(msPerThousand, 2)} ms`,
      `≤ ${f(gates.tiempo.max_ms_por_mil_pares, 2)} ms`,
      `El candidato tarda ${f(msPerThousand, 2)} ms por mil pares, fuera del presupuesto de ${f(gates.tiempo.max_ms_por_mil_pares, 2)} ms.`,
    ),
  );

  results.push(
    gate(
      "conservacion",
      "Matches con conversación abierta que se perderían",
      candidate.lostProtectedPairs <= gates.conservacion.max_perdida,
      String(candidate.lostProtectedPairs),
      `≤ ${gates.conservacion.max_perdida}`,
      `El candidato eliminaría ${candidate.lostProtectedPairs} matches que ya tienen una conversación abierta. Una conversación existente nunca se rompe por un cambio de motor.`,
    ),
  );

  const failed = results.filter((r) => !r.passed).map((r) => r.id);
  return { activate: failed.length === 0, gates: results, failed };
}