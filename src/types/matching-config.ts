/**
 * Layered matching model configuration (docs/MATCHING.md). Every numeric leaf
 * of `data/matching-config.json` is annotated with `{valor, etiqueta, fuente}`;
 * the loader strips the annotation, so these types carry plain values.
 */
import type { HardFilterField } from "./microtest";

export const MATCH_CATEGORY_IDS = [
  "personalidad",
  "valores",
  "dealbreakers",
  "relacional",
  "estilo",
  "big_five",
  "conflicto",
  "apego",
  "afecto",
  "mbti",
  "eneagrama",
] as const;
export type MatchCategoryId = (typeof MATCH_CATEGORY_IDS)[number];

export const PARAM_LABELS = [
  "prior_literatura",
  "estimado_sintetico",
  "supuesto_diseno",
  "pendiente_verificacion",
] as const;
export type ParamLabel = (typeof PARAM_LABELS)[number];

/** Gaussian (Mahalanobis) kernel over a block of latent factors. */
export interface KernelCategory {
  kind: "kernel";
  /** Relative factor weights (mean-normalized at build time). */
  factors: Record<string, number>;
  /** Kernel bandwidth h = c·√d in latent SD units. */
  bandwidth_per_sqrt_dim: number;
  /**
   * Asymmetric penalty η per factor: the gap is inflated by
   * (1 + η·max(0, −min(θa, θb))) when the lower of the two sits below the
   * population mean. Symmetric in (a, b).
   */
  low_side?: Record<string, number>;
}

/** Tolerance window: flat up to `tolerance`, Gaussian decay with `scale` beyond. */
export interface DeadzoneCategory {
  kind: "deadzone";
  factors: Record<string, number>;
  tolerance: Record<string, number>;
  scale: number;
  /** `product`: one large gap sinks the category; `geometric`: weighted geometric mean. */
  combine: "product" | "geometric";
}

/** Overlap (Bhattacharyya coefficient) of two softmax type distributions. */
export interface DistributionCategory {
  kind: "distribution";
  factors: Record<string, number>;
  temperature: number;
  /** Value an uninformative (maximum-entropy) comparison shrinks toward. */
  neutral: number;
}

export type CategoryConfig = KernelCategory | DeadzoneCategory | DistributionCategory;

export interface TrackConfig {
  /** Pairs at or below this value are never shown (null-quantile calibrated). */
  minimum_similarity_exclusive: number;
  /** Per-pair false-match rate under the permutation null used to calibrate the threshold. */
  null_alpha: number;
  /**
   * Achievable ceiling of the score (high quantile of real synthetic pairs).
   * The score is an EXPECTED similarity under uncertainty, so 1 is never
   * reached; relative positions above the threshold are scaled to this.
   */
  reference_high: number;
  max_matches: number;
  hard_filters: HardFilterField[];
  /** Soft-min strictness β of the core aggregation. */
  beta: number;
  /** Core categories aggregated by weighted soft-min (weights sum to 1). */
  core: Partial<Record<MatchCategoryId, number>>;
  /** Tail categories added linearly; never floors or dealbreakers. */
  tail: Partial<Record<MatchCategoryId, number>>;
  /** Critical floors: below them the total is scaled down by s/floor. */
  floors: Partial<Record<MatchCategoryId, number>>;
}

export interface QualityConfig {
  lz_floor: number;
  lz_ok: number;
  longstring_ok: number;
  longstring_max: number;
  sd_ok: number;
  minimum: number;
}

export interface MatchingConfig {
  version: string;
  scoring: { quadrature_nodes: number; mbti_ambiguity_se: number; enneagram_ambiguity_entropy: number };
  quality: QualityConfig;
  categories: Record<MatchCategoryId, CategoryConfig>;
  tail_groups: {
    extras: MatchCategoryId[];
    extras_max_total: number;
    identity: MatchCategoryId[];
    identity_max_total: number;
  };
  calibration: { seed: number; population: number; null_pairs: number };
  group: { beta: number };
  badges: { per_track: { romance: number; amistad: number } };
  tracks: { romance: TrackConfig; amistad: TrackConfig };
  /** Design assumptions for the qualitative confidence shown with a match. */
  explainability: {
    /** Minimum relative position above the threshold for "confianza alta". */
    confidence_high_margin: number;
    /** Core-category similarity (%) under which a match is never "alta". */
    category_floor: number;
    /** Mean posterior variance of the pair (track core factors) above which a match is never "alta". */
    confidence_max_uncertainty: number;
  };
}
