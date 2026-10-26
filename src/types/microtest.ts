/**
 * ZooMatch — Multidimensional questionnaire type definitions
 * Supports dual-track matching (romance + friendship) with hard filters
 */

// ─── Categories ───────────────────────────────────────────────────────────────
export type Category =
  | "personalidad_bigfive"
  | "personalidad_mbti"
  | "identidad_filtros"
  | "afinidad_cultural"
  | "intimidad_afecto"
  | "valores_relacionales";

// ─── Dimensions ───────────────────────────────────────────────────────────────
// Personality - Big Five
export type BigFiveDimension =
  | "personalidad_apertura"
  | "personalidad_responsabilidad"
  | "personalidad_extraversion"
  | "personalidad_amabilidad"
  | "personalidad_estabilidad_emocional";

// Personality - MBTI (used for code derivation, included in both tracks)
export type MbtiDimension =
  | "mbti_extraversion"
  | "mbti_intuicion"
  | "mbti_pensamiento"
  | "mbti_juicio";

// Identity soft dimensions
export type IdentityDimension =
  | "identidad_exclusividad"
  | "identidad_comunicacion_afectiva";

// Cultural affinity dimensions
export type CulturalDimension =
  | "cultural_musica_exploracion"
  | "cultural_estetica_visual"
  | "cultural_hobbies_creativos"
  | "cultural_vida_universitaria"
  | "cultural_humor";

// Intimacy dimensions (romance track only)
export type IntimacyDimension =
  | "intimidad_palabras_afirmacion"
  | "intimidad_tiempo_calidad"
  | "intimidad_regalos_detalle"
  | "intimidad_contacto_fisico"
  | "intimidad_actos_servicio"
  | "intimidad_apertura_emocional"
  | "intimidad_comunicacion_deseos"
  | "intimidad_limites_respeto";

// Relational values dimensions
export type ValuesDimension =
  | "valores_empatia"
  | "valores_confianza"
  | "valores_gestion_conflicto"
  | "valores_igualdad_genero"
  | "valores_corresponsabilidad"
  | "valores_respeto_diversidad";

// All scoring dimensions (excludes hard filters)
export type Dimension =
  | BigFiveDimension
  | MbtiDimension
  | IdentityDimension
  | CulturalDimension
  | IntimacyDimension
  | ValuesDimension;

// Romance track dimensions (all scoring dims)
export type RomanceDimension = Dimension;

// Friendship track dimensions (no intimacy, no identity)
export type FriendshipDimension =
  | BigFiveDimension
  | MbtiDimension
  | CulturalDimension
  | ValuesDimension;

// ─── Hard filter fields ───────────────────────────────────────────────────────
export type HardFilterField =
  | "orientacion_sexual"
  | "identidad_genero"
  | "tipo_relacion_busca";

// ─── Response types ───────────────────────────────────────────────────────────
export type LikertValue = 1 | 2 | 3 | 4 | 5;

export interface LikertAnswer {
  itemId: string;
  value: LikertValue;
}

export interface FilterAnswer {
  itemId: string;
  selected: string[];
}

export interface QuizSubmission {
  likert: LikertAnswer[];
  filters: FilterAnswer[];
}

// ─── Item schema ──────────────────────────────────────────────────────────────
export type ResponseType = "likert_5" | "seleccion_multiple";

export interface QuizItem {
  id: string;
  categoria: Category;
  subcategoria: string;
  texto: string;
  tipo_respuesta: ResponseType;
  opciones?: string[];
  polaridad: "positiva" | "negativa" | null;
  pesos: Partial<Record<Dimension, 1 | -1>>;
  campo_perfil?: HardFilterField;
  track_romance: boolean;
  track_amistad: boolean;
  filtro_duro: boolean;
  fuente_id: string;
}

// ─── Scored profile ───────────────────────────────────────────────────────────
export type DimensionScores = Record<Dimension, number>;

export interface HardFilters {
  orientacion_sexual: string[];
  identidad_genero: string[];
  tipo_relacion_busca: string[];
}

export interface ScoredProfile {
  rawScores: DimensionScores;
  normalizedScores: DimensionScores;
  mbtiCode: string;
  hardFilters: HardFilters;
  romanceVector: number[];
  friendshipVector: number[];
}

// ─── Matching results ─────────────────────────────────────────────────────────
export type MatchTrack = "romance" | "amistad";

export interface CompatibilityBadge {
  dimension: string;
  label: string;
  affinity: number;
  icon: string;
}

export interface DualMatchResult {
  track: MatchTrack;
  otherUserId: string;
  similarity: number;
  badges: CompatibilityBadge[];
  narrative: string;
}

// ─── Dimension arrays (ordered, for vector construction) ──────────────────────
export const BIG_FIVE_DIMENSIONS: BigFiveDimension[] = [
  "personalidad_apertura",
  "personalidad_responsabilidad",
  "personalidad_extraversion",
  "personalidad_amabilidad",
  "personalidad_estabilidad_emocional",
];

export const MBTI_DIMENSIONS: MbtiDimension[] = [
  "mbti_extraversion",
  "mbti_intuicion",
  "mbti_pensamiento",
  "mbti_juicio",
];

export const IDENTITY_DIMENSIONS: IdentityDimension[] = [
  "identidad_exclusividad",
  "identidad_comunicacion_afectiva",
];

export const CULTURAL_DIMENSIONS: CulturalDimension[] = [
  "cultural_musica_exploracion",
  "cultural_estetica_visual",
  "cultural_hobbies_creativos",
  "cultural_vida_universitaria",
  "cultural_humor",
];

export const INTIMACY_DIMENSIONS: IntimacyDimension[] = [
  "intimidad_palabras_afirmacion",
  "intimidad_tiempo_calidad",
  "intimidad_regalos_detalle",
  "intimidad_contacto_fisico",
  "intimidad_actos_servicio",
  "intimidad_apertura_emocional",
  "intimidad_comunicacion_deseos",
  "intimidad_limites_respeto",
];

export const VALUES_DIMENSIONS: ValuesDimension[] = [
  "valores_empatia",
  "valores_confianza",
  "valores_gestion_conflicto",
  "valores_igualdad_genero",
  "valores_corresponsabilidad",
  "valores_respeto_diversidad",
];

export const ROMANCE_VECTOR_DIMENSIONS: Dimension[] = [
  // Personality (5)
  ...BIG_FIVE_DIMENSIONS,
  // Identity soft (2) — romance only
  ...IDENTITY_DIMENSIONS,
  // Cultural (5)
  ...CULTURAL_DIMENSIONS,
  // Intimacy (8) — romance only
  ...INTIMACY_DIMENSIONS,
  // Values (6)
  ...VALUES_DIMENSIONS,
];
// Total: 5+2+5+8+6 = 26 dimensions for romance vector

export const FRIENDSHIP_VECTOR_DIMENSIONS: FriendshipDimension[] = [
  // Personality (5)
  ...BIG_FIVE_DIMENSIONS,
  // Cultural (5)
  ...CULTURAL_DIMENSIONS,
  // Values (6)
  ...VALUES_DIMENSIONS,
];
// Total: 5+5+6 = 16 dimensions for friendship vector

export const ALL_DIMENSIONS: Dimension[] = [
  ...BIG_FIVE_DIMENSIONS,
  ...MBTI_DIMENSIONS,
  ...IDENTITY_DIMENSIONS,
  ...CULTURAL_DIMENSIONS,
  ...INTIMACY_DIMENSIONS,
  ...VALUES_DIMENSIONS,
];
// Total: 5+4+2+5+8+6 = 30 scoring dimensions

export const ROMANCE_VECTOR_LENGTH = ROMANCE_VECTOR_DIMENSIONS.length; // 26
export const FRIENDSHIP_VECTOR_LENGTH = FRIENDSHIP_VECTOR_DIMENSIONS.length; // 16

// ─── Utility types ────────────────────────────────────────────────────────────

// Category weights for weighted cosine similarity
export interface CategoryWeights {
  personalidad: number;
  afinidad_cultural: number;
  intimidad_afecto: number;
  valores_relacionales: number;
  identidad?: number;
}

export interface RomanceSelectivityConfig {
  intimacy_alignment_floor: number;
  conflict_alignment_floor: number;
  intimacy_penalty_weight: number;
  conflict_penalty_weight: number;
}

// Matching configuration
export interface TrackConfig {
  minimum_similarity_exclusive: number;
  centering: number;
  max_matches: number;
  /** Expected share of users with at least one match on this track. */
  target_coverage_percentile: number;
  dimensions: string[];
  hard_filters: HardFilterField[];
  weights: CategoryWeights;
  /** Romance-only alignment penalties. */
  selectivity?: RomanceSelectivityConfig;
}

export interface MatchingConfig {
  version: string;
  tracks: {
    romance: TrackConfig;
    amistad: TrackConfig;
  };
  calibration: {
    method: string;
    target_coverage: number;
    max_users: number;
  };
}

// Notification types
export type NotificationType = "match_romance" | "match_amistad" | "no_match" | "welcome";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

// Profile with animal + color identity
export interface ProfileIdentity {
  animalId: string;
  animalDiminutivo: string;
  colorId: string;
  colorNombre: string;
  colorHex: string;
  alias: string;
  narrative: string;
}
