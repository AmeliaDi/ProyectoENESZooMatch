import type { MatchTrack } from "./microtest";

/** Inclusive target range for the coverage of one track. */
export interface CoverageRange {
  readonly min: number;
  readonly max: number;
}

export interface AffinityNotice {
  /** `public.notifications.type`; the CHECK is widened by the rollout migration. */
  readonly type: string;
  readonly titulo: string;
  readonly cuerpo: string;
}

/**
 * Rollout gates (Fase 6, docs/COMPARATIVA_MODELOS.md). Every numeric leaf is
 * annotated `{valor, etiqueta, fuente}` in `data/rollout-gates.json`; the loader
 * strips the annotation and keeps the value. ALL gates must pass to activate.
 */
export interface RolloutGates {
  readonly version: string;
  readonly cobertura: Readonly<Record<MatchTrack, CoverageRange>>;
  readonly equidad: { readonly min_ratio: number };
  readonly exposicion: {
    readonly gini_max: Readonly<Record<MatchTrack, number>>;
    /** The challenger may not concentrate exposure more than the live engine. */
    readonly no_peor_que_actual: boolean;
  };
  readonly correlacion_rangos: { readonly min_spearman: number };
  readonly estabilidad_ruido: { readonly min_spearman: number; readonly min_jaccard: number };
  readonly invariantes: { readonly max_violaciones: number };
  readonly tiempo: { readonly max_ms_por_mil_pares: number };
  readonly conservacion: { readonly max_perdida: number };
  readonly activacion: { readonly variable: string; readonly notificacion: AffinityNotice };
}

/** What one track of one engine actually published, measured on the same pool. */
export interface TrackMeasurement {
  /** Coverage over every person in the pool. */
  readonly coverage: number;
  /** Coverage over the pool the track is designed to serve (romance opt-outs out). */
  readonly poolCoverage: number;
  readonly gini: number;
  readonly equityFloor: number;
  /** Spearman ρ between this engine's pair ranking and the incumbent's. */
  readonly spearmanVsIncumbent: number;
  /** Re-run after ±1 Likert noise on a share of items. */
  readonly noise: { readonly spearman: number; readonly jaccard: number };
}

/** One full shadow run of one engine over one synthetic pool. */
export interface EngineMeasurement {
  readonly engine: string;
  readonly people: number;
  readonly pairs: number;
  readonly elapsedMs: number;
  readonly tracks: Readonly<Record<MatchTrack, TrackMeasurement>>;
  /** Canonical-order, self-pair, duplicate and range defects in the output. */
  readonly violations: number;
  /** Protected pairs (open conversation) the engine would drop. */
  readonly lostProtectedPairs: number;
}

export interface GateResult {
  readonly id: string;
  readonly label: string;
  readonly passed: boolean;
  readonly observed: string;
  readonly required: string;
  /** Empty when the gate passes; otherwise the reason activation is blocked. */
  readonly reason: string;
}

export interface RolloutDecision {
  readonly activate: boolean;
  readonly gates: readonly GateResult[];
  readonly failed: readonly string[];
}