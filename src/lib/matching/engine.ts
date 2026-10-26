/**
 * ZooMatch — Dual-track matching engine (romance + friendship).
 *
 * This module is the pure mathematical core of the matching engine. It turns
 * a completed questionnaire into a scored profile, applies hard filters, and
 * computes weighted cosine similarity across two independent tracks:
 *
 *  - romance:   26 dimensions (BigFive + Identity + Cultural + Intimacy + Values)
 *               gated by orientation / gender / relationship hard filters.
 *  - amistad:   16 dimensions (BigFive + Cultural + Values), no hard filters.
 *
 * Every exported function is deterministic and side-effect free.
 */

import type {
  CategoryWeights,
  CompatibilityBadge,
  DimensionScores,
  Dimension,
  DualMatchResult,
  HardFilterField,
  HardFilters,
  LikertValue,
  MatchTrack,
  MatchingConfig,
  QuizItem,
  QuizSubmission,
  ScoredProfile,
  TrackConfig,
} from "@/types/microtest";
import {
  ALL_DIMENSIONS,
  FRIENDSHIP_VECTOR_DIMENSIONS,
  ROMANCE_VECTOR_DIMENSIONS,
} from "@/types/microtest";

import matchingConfigRaw from "../../../data/matching-config.json";
import microtest from "../../../data/microtest.json";

// ─── Static data ──────────────────────────────────────────────────────────────

/** Likert scale bounds for the questionnaire (1–5). */
const LIKERT_MIN = 1;
const LIKERT_MAX = 5;
/** Reverse-scoring pivot for negatively weighted items: `PIVOT - value`. */
const LIKERT_REVERSE_PIVOT = LIKERT_MIN + LIKERT_MAX; // 6
/** Neutral score used for dimensions with no contributing items. */
const NEUTRAL_SCORE = 0.5;
/** MBTI letter threshold: `>= 0.5` yields the positive letter. */
const MBTI_THRESHOLD = 0.5;

interface RawTrackConfig {
  minimum_similarity_exclusive: number;
  centering: number;
  max_matches: number;
  dimensions: string[];
  hard_filters: string[];
  weights: Record<string, number>;
}

interface RawMatchingConfig {
  version: string;
  tracks: { romance: RawTrackConfig; amistad: RawTrackConfig };
  calibration: { method: string; target_coverage: number; max_users: number };
}

const rawConfig = matchingConfigRaw as unknown as RawMatchingConfig;

/**
 * Fills every {@link CategoryWeights} key so downstream lookups never see
 * `undefined`. Tracks that omit a category (e.g. friendship has no intimacy)
 * receive a weight of `0`, which drops that category from the weighted mean.
 */
function normalizeWeights(weights: Record<string, number>): CategoryWeights {
  return {
    personalidad: weights.personalidad ?? 0,
    afinidad_cultural: weights.afinidad_cultural ?? 0,
    intimidad_afecto: weights.intimidad_afecto ?? 0,
    valores_relacionales: weights.valores_relacionales ?? 0,
    identidad: weights.identidad ?? 0,
  };
}

function normalizeTrack(track: RawTrackConfig): TrackConfig {
  return {
    minimum_similarity_exclusive: track.minimum_similarity_exclusive,
    centering: track.centering,
    max_matches: track.max_matches,
    dimensions: [...track.dimensions],
    hard_filters: [...track.hard_filters] as HardFilterField[],
    weights: normalizeWeights(track.weights),
  };
}

/**
 * Strongly-typed matching configuration parsed from
 * `data/matching-config.json`. Weights are normalized so every category key
 * is present.
 */
export const MATCHING_CONFIG: MatchingConfig = {
  version: rawConfig.version,
  tracks: {
    romance: normalizeTrack(rawConfig.tracks.romance),
    amistad: normalizeTrack(rawConfig.tracks.amistad),
  },
  calibration: {
    method: rawConfig.calibration.method,
    target_coverage: rawConfig.calibration.target_coverage,
    max_users: rawConfig.calibration.max_users,
  },
};

/**
 * The full questionnaire item list parsed from `data/microtest.json`,
 * typed as {@link QuizItem}. Provided as a convenience default for callers of
 * {@link scoreQuiz} that do not supply their own items.
 */
export const MICROTEST_ITEMS = microtest.items as unknown as QuizItem[];

// ─── Badge metadata ───────────────────────────────────────────────────────────

interface BadgeMeta {
  readonly label: string;
  readonly icon: string;
}

/** Human-readable Spanish label + icon for every scored dimension. */
const BADGE_METADATA = {
  personalidad_apertura: { label: "Misma curiosidad por el mundo", icon: "🌍" },
  personalidad_responsabilidad: { label: "Ritmo de vida compatible", icon: "⚡" },
  personalidad_extraversion: { label: "Misma energía social", icon: "✨" },
  personalidad_amabilidad: { label: "Calidez compartida", icon: "🤗" },
  personalidad_estabilidad_emocional: { label: "Equilibrio emocional alineado", icon: "🧘" },
  identidad_exclusividad: { label: "Misma visión de compromiso", icon: "💫" },
  identidad_comunicacion_afectiva: { label: "Comunicación afectiva compatible", icon: "💬" },
  cultural_musica_exploracion: { label: "Gustos musicales conectados", icon: "🎵" },
  cultural_estetica_visual: { label: "Misma sensibilidad estética", icon: "🎨" },
  cultural_hobbies_creativos: { label: "Hobbies creativos compartidos", icon: "✂️" },
  cultural_vida_universitaria: { label: "Misma vibra universitaria", icon: "🎓" },
  cultural_humor: { label: "Humor compatible", icon: "😄" },
  intimidad_palabras_afirmacion: { label: "Ambos valoran las palabras de amor", icon: "💝" },
  intimidad_tiempo_calidad: { label: "Mismo lenguaje: tiempo juntos", icon: "⏰" },
  intimidad_regalos_detalle: { label: "Ambos aman los detalles", icon: "🎁" },
  intimidad_contacto_fisico: { label: "Mismo lenguaje: contacto físico", icon: "🫂" },
  intimidad_actos_servicio: { label: "Ambos valoran los actos de servicio", icon: "🤲" },
  intimidad_apertura_emocional: { label: "Apertura emocional profunda", icon: "💗" },
  intimidad_comunicacion_deseos: { label: "Comunicación de deseos alineada", icon: "🗣️" },
  intimidad_limites_respeto: { label: "Respeto por límites compartido", icon: "🛡️" },
  valores_empatia: { label: "Empatía mutua", icon: "💞" },
  valores_confianza: { label: "Confianza como base", icon: "🔒" },
  valores_gestion_conflicto: { label: "Misma forma de resolver conflictos", icon: "🕊️" },
  valores_igualdad_genero: { label: "Valores de igualdad alineados", icon: "⚖️" },
  valores_corresponsabilidad: { label: "Corresponsabilidad compartida", icon: "🤝" },
  valores_respeto_diversidad: { label: "Respeto por la diversidad", icon: "🌈" },
} as const satisfies Record<string, BadgeMeta>;

const BADGE_LOOKUP = BADGE_METADATA as Record<string, BadgeMeta>;

/** Default number of badges surfaced per track. */
const DEFAULT_ROMANCE_BADGES = 5;
const DEFAULT_FRIENDSHIP_BADGES = 3;
const DEFAULT_BADGE_LIMIT = DEFAULT_ROMANCE_BADGES;

// ─── Hard-filter compatibility tables ─────────────────────────────────────────

/** Relationship-type compatibility map. */
const RELATIONSHIP_COMPATIBILITY: Record<string, readonly string[]> = {
  monogamia: ["monogamia"],
  no_monogamia_etica: ["no_monogamia_etica", "poliamor", "anarquia_relacional"],
  poliamor: ["poliamor", "no_monogamia_etica", "anarquia_relacional"],
  anarquia_relacional: ["anarquia_relacional", "no_monogamia_etica", "poliamor"],
  sin_definir: ["sin_definir", "no_monogamia_etica", "poliamor", "anarquia_relacional", "solo_amistad"],
  solo_amistad: ["solo_amistad", "sin_definir"],
};

// ─── Scoring ──────────────────────────────────────────────────────────────────

function emptyScores(): DimensionScores {
  return Object.fromEntries(ALL_DIMENSIONS.map((dimension) => [dimension, 0])) as DimensionScores;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function deriveMbtiCode(normalized: DimensionScores): string {
  const positive = (dimension: Dimension) => normalized[dimension] >= MBTI_THRESHOLD;
  return [
    positive("mbti_extraversion") ? "E" : "I",
    positive("mbti_intuicion") ? "N" : "S",
    positive("mbti_pensamiento") ? "T" : "F",
    positive("mbti_juicio") ? "J" : "P",
  ].join("");
}

/**
 * Scores a complete quiz submission into normalized dimension scores,
 * derives the MBTI code, extracts hard filters, and builds the dual-track
 * romance / friendship vectors.
 *
 * Normalization: negatively weighted items are reverse-scored (`6 - value`)
 * before summing, so each dimension's raw score spans
 * `[itemCount * 1, itemCount * 5]`. The normalized score is
 * `(raw - min) / (max - min)`, clamped to `[0, 1]`. Dimensions with no
 * contributing items default to `0.5`.
 *
 * @throws If any Likert item required for scoring is missing from `answers`.
 */
export function scoreQuiz(answers: QuizSubmission, items: QuizItem[]): ScoredProfile {
  const likertByItem = new Map<string, LikertValue>(
    answers.likert.map((answer) => [answer.itemId, answer.value]),
  );
  const filtersByItem = new Map<string, string[]>(
    answers.filters.map((filter) => [filter.itemId, filter.selected]),
  );

  const rawScores = emptyScores();
  const itemCounts = emptyScores();

  for (const item of items) {
    if (item.tipo_respuesta !== "likert_5") continue;

    const weights = Object.entries(item.pesos) as Array<[Dimension, 1 | -1]>;
    if (weights.length === 0) continue;

    const answer = likertByItem.get(item.id);
    if (answer === undefined) {
      throw new Error(`Incomplete quiz: missing answer for item "${item.id}"`);
    }

    for (const [dimension, weight] of weights) {
      const effective = weight === -1 ? LIKERT_REVERSE_PIVOT - answer : answer;
      rawScores[dimension] += effective;
      itemCounts[dimension] += 1;
    }
  }

  const normalizedScores = emptyScores();
  for (const dimension of ALL_DIMENSIONS) {
    const count = itemCounts[dimension];
    if (count === 0) {
      normalizedScores[dimension] = NEUTRAL_SCORE;
      continue;
    }
    const min = count * LIKERT_MIN;
    const max = count * LIKERT_MAX;
    const range = max - min;
    normalizedScores[dimension] =
      range === 0 ? NEUTRAL_SCORE : clamp01((rawScores[dimension] - min) / range);
  }

  const hardFilters: HardFilters = {
    orientacion_sexual: [],
    identidad_genero: [],
    tipo_relacion_busca: [],
  };
  for (const item of items) {
    if (!item.filtro_duro || item.campo_perfil === undefined) continue;
    hardFilters[item.campo_perfil] = [...(filtersByItem.get(item.id) ?? [])];
  }

  return {
    rawScores,
    normalizedScores,
    mbtiCode: deriveMbtiCode(normalizedScores),
    hardFilters,
    romanceVector: ROMANCE_VECTOR_DIMENSIONS.map((dimension) => normalizedScores[dimension]),
    friendshipVector: FRIENDSHIP_VECTOR_DIMENSIONS.map((dimension) => normalizedScores[dimension]),
  };
}

// ─── Hard Filters ─────────────────────────────────────────────────────────────

function relationshipPairCompatible(x: string, y: string): boolean {
  if (x === y) return true;
  const fromX = RELATIONSHIP_COMPATIBILITY[x];
  const fromY = RELATIONSHIP_COMPATIBILITY[y];
  return (fromX?.includes(y) ?? false) || (fromY?.includes(x) ?? false);
}

const ORIENTATION_WILDCARDS = new Set(["todxs", "prefiero no decir"]);
const GENDER_WILDCARD = "prefiero no decir";

const ORIENTATION_TARGETS: Record<string, readonly string[]> = {
  hombres: ["hombre"],
  mujeres: ["mujer"],
  "personas no binarias": ["no binario", "género fluido", "agenero"],
};

export function attractedTo(orientations: string[], genders: string[]): boolean {
  if (
    orientations.length === 0 ||
    orientations.some((value) => ORIENTATION_WILDCARDS.has(value)) ||
    genders.length === 0 ||
    genders.includes(GENDER_WILDCARD)
  ) {
    return true;
  }

  const targets = orientations.flatMap((orientation) => ORIENTATION_TARGETS[orientation] ?? []);
  return targets.length === 0 || genders.some((gender) => targets.includes(gender));
}

function aceCompatible(a: string[], b: string[]): boolean {
  return (
    (!a.includes("asexual") || b.includes("asexual") || b.includes("demisexual")) &&
    (!b.includes("asexual") || a.includes("asexual") || a.includes("demisexual"))
  );
}

function isAttractionCompatible(a: HardFilters, b: HardFilters): boolean {
  return (
    attractedTo(a.orientacion_sexual, b.identidad_genero) &&
    attractedTo(b.orientacion_sexual, a.identidad_genero) &&
    aceCompatible(a.orientacion_sexual, b.orientacion_sexual)
  );
}

/**
 * Relationship-type compatibility.
 *
 * Compatible when ANY value in `a` is compatible with ANY value in `b`:
 *  - `monogamia` only matches `monogamia`.
 *  - `no_monogamia_etica` / `poliamor` / `anarquia_relacional` match each other.
 *  - `sin_definir` matches everything except strict `monogamia`.
 *  - exactly `["solo_amistad"]` blocks romance; mixed selections ignore that value.
 * An empty selection is treated as "no filter expressed" (compatible).
 */
export function isRelationshipCompatible(a: string[], b: string[]): boolean {
  const isSoloAmistadOnly = (values: string[]) =>
    values.length === 1 && values[0] === "solo_amistad";
  if (isSoloAmistadOnly(a) || isSoloAmistadOnly(b)) return false;
  const filteredA = a.filter((value) => value !== "solo_amistad");
  const filteredB = b.filter((value) => value !== "solo_amistad");
  if (filteredA.length === 0 || filteredB.length === 0) return true;
  return filteredA.some((x) => filteredB.some((y) => relationshipPairCompatible(x, y)));
}

/**
 * Checks whether two users' hard filters are compatible for romance matching.
 * All three filter types must be compatible (AND logic).
 */
export function checkHardFilters(a: HardFilters, b: HardFilters): boolean {
  return (
    isAttractionCompatible(a, b) &&
    isRelationshipCompatible(a.tipo_relacion_busca, b.tipo_relacion_busca)
  );
}

// ─── Similarity ───────────────────────────────────────────────────────────────

/**
 * Standard cosine similarity between two equal-length vectors.
 * Returns `0` when either magnitude is `0`.
 *
 * @throws If the two vectors have different lengths.
 */
export function cosineSimilarity(first: readonly number[], second: readonly number[]): number {
  if (first.length !== second.length) {
    throw new Error("Vectors must have the same length");
  }

  let dotProduct = 0;
  let firstMagnitude = 0;
  let secondMagnitude = 0;

  for (let index = 0; index < first.length; index += 1) {
    const firstValue = first[index] ?? 0;
    const secondValue = second[index] ?? 0;
    dotProduct += firstValue * secondValue;
    firstMagnitude += firstValue ** 2;
    secondMagnitude += secondValue ** 2;
  }

  const denominator = Math.sqrt(firstMagnitude) * Math.sqrt(secondMagnitude);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Maps a scoring dimension to its {@link CategoryWeights} key. MBTI dimensions
 * fold into `personalidad`; unknown dimensions map to `null` and are ignored.
 */
function categoryOfDimension(dimension: string): keyof CategoryWeights | null {
  if (dimension.startsWith("personalidad_") || dimension.startsWith("mbti_")) return "personalidad";
  if (dimension.startsWith("identidad_")) return "identidad";
  if (dimension.startsWith("cultural_")) return "afinidad_cultural";
  if (dimension.startsWith("intimidad_")) return "intimidad_afecto";
  if (dimension.startsWith("valores_")) return "valores_relacionales";
  return null;
}

/**
 * Weighted cosine similarity that applies per-category weights.
 *
 * Dimensions are grouped by category, a cosine similarity is computed within
 * each category's sub-vector, and the results are combined as a weighted mean:
 * `sum(weight_c * cosine_c) / sum(weight_c)`. This keeps categories with many
 * dimensions (e.g. intimacy, 8 dims) from drowning out categories with few
 * (e.g. identity, 2 dims).
 *
 * Categories absent from `dimensions`, or whose weight is `0`/undefined, do not
 * contribute. Returns `0` when no active weight exists.
 *
 * @throws If the vectors and `dimensions` do not all share the same length.
 */
export function weightedTrackSimilarity(
  a: readonly number[],
  b: readonly number[],
  dimensions: readonly string[],
  weights: CategoryWeights,
): number {
  if (a.length !== b.length || a.length !== dimensions.length) {
    throw new Error("Vectors and dimensions must all share the same length");
  }

  // Bucket indices by category, preserving first-seen category order.
  const buckets = new Map<keyof CategoryWeights, number[]>();
  for (let index = 0; index < dimensions.length; index += 1) {
    const category = categoryOfDimension(dimensions[index] ?? "");
    if (category === null) continue;
    const bucket = buckets.get(category);
    if (bucket) bucket.push(index);
    else buckets.set(category, [index]);
  }

  let weightSum = 0;
  let weightedSum = 0;
  for (const [category, indices] of buckets) {
    const weight = weights[category] ?? 0;
    if (weight === 0) continue;
    const subA = indices.map((index) => a[index] ?? 0);
    const subB = indices.map((index) => b[index] ?? 0);
    weightedSum += weight * cosineSimilarity(subA, subB);
    weightSum += weight;
  }

  return weightSum === 0 ? 0 : weightedSum / weightSum;
}

export function trackSimilarity(
  a: readonly number[],
  b: readonly number[],
  trackConfig: TrackConfig,
): number {
  const centeredA = a.map((value) => value - trackConfig.centering);
  const centeredB = b.map((value) => value - trackConfig.centering);
  const similarity = clamp01(
    (1 +
      weightedTrackSimilarity(
        centeredA,
        centeredB,
        trackConfig.dimensions,
        trackConfig.weights,
      )) /
      2,
  );
  if (similarity < 1e-12) return 0;
  if (similarity > 1 - 1e-12) return 1;
  return similarity;
}

// ─── Badges ───────────────────────────────────────────────────────────────────

/**
 * Generates compatibility badges from two users' aligned dimension vectors.
 *
 * Affinity per dimension is `1 - |a - b|`; the top `limit` dimensions by
 * affinity are returned with human-readable Spanish labels and icons. Ties are
 * broken by original dimension order to stay deterministic.
 *
 * @throws If the vectors and `dimensions` do not all share the same length.
 */
export function generateBadges(
  a: readonly number[],
  b: readonly number[],
  dimensions: readonly string[],
  track: MatchTrack,
  limit: number = track === "amistad" ? DEFAULT_FRIENDSHIP_BADGES : DEFAULT_BADGE_LIMIT,
): CompatibilityBadge[] {
  if (a.length !== b.length || a.length !== dimensions.length) {
    throw new Error("Vectors and dimensions must all share the same length");
  }

  const badges: CompatibilityBadge[] = dimensions.map((dimension, index) => {
    const affinity = 1 - Math.abs((a[index] ?? 0) - (b[index] ?? 0));
    const meta = BADGE_LOOKUP[dimension];
    return {
      dimension,
      label: meta?.label ?? dimension,
      affinity,
      icon: meta?.icon ?? "•",
    };
  });

  return badges
    .map((badge, order) => ({ badge, order }))
    .sort((left, right) => right.badge.affinity - left.badge.affinity || left.order - right.order)
    .slice(0, Math.max(0, limit))
    .map((entry) => entry.badge);
}

// ─── Full Match Computation ───────────────────────────────────────────────────

function lowercaseFirst(text: string): string {
  return text.length === 0 ? text : text[0]!.toLowerCase() + text.slice(1);
}

function buildNarrative(track: MatchTrack, badges: CompatibilityBadge[], similarity: number): string {
  const percent = Math.round(similarity * 100);
  const heading = track === "romance" ? "Conexión romántica" : "Conexión de amistad";
  const highlights = badges.slice(0, 2).map((badge) => lowercaseFirst(badge.label));

  if (highlights.length === 0) return `${heading} del ${percent}%.`;
  const joined = highlights.length === 1 ? highlights[0]! : `${highlights[0]} y ${highlights[1]}`;
  return `${heading} del ${percent}%. Destacan: ${joined}.`;
}

/**
 * Finds all dual-track matches for a user against a pool of scored profiles.
 *
 *  - Romance: hard filter → centered weighted cosine over the 26-dim romance vector →
 *    strictly-greater-than threshold → top 5 badges.
 *  - Friendship: centered weighted cosine over the 16-dim friendship vector →
 *    strictly-greater-than threshold → top 3 badges (no hard filters).
 *
 * A single `otherUserId` may appear twice in the result (once per track) when it
 * clears both thresholds. Callers should exclude the querying user from `pool`.
 */
export function findDualMatches(
  user: ScoredProfile,
  pool: Array<{ userId: string; profile: ScoredProfile }>,
  config: MatchingConfig,
): DualMatchResult[] {
  const romanceConfig = config.tracks.romance;
  const friendshipConfig = config.tracks.amistad;
  const results: DualMatchResult[] = [];

  for (const { userId, profile } of pool) {
    // Romance track — gated by hard filters.
    if (checkHardFilters(user.hardFilters, profile.hardFilters)) {
      const similarity = trackSimilarity(
        user.romanceVector,
        profile.romanceVector,
        romanceConfig,
      );
      if (similarity > romanceConfig.minimum_similarity_exclusive) {
        const badges = generateBadges(
          user.romanceVector,
          profile.romanceVector,
          romanceConfig.dimensions,
          "romance",
          DEFAULT_ROMANCE_BADGES,
        );
        results.push({
          track: "romance",
          otherUserId: userId,
          similarity,
          badges,
          narrative: buildNarrative("romance", badges, similarity),
        });
      }
    }

    // Friendship track — no hard filters.
    const friendshipSimilarity = trackSimilarity(
      user.friendshipVector,
      profile.friendshipVector,
      friendshipConfig,
    );
    if (friendshipSimilarity > friendshipConfig.minimum_similarity_exclusive) {
      const badges = generateBadges(
        user.friendshipVector,
        profile.friendshipVector,
        friendshipConfig.dimensions,
        "amistad",
        DEFAULT_FRIENDSHIP_BADGES,
      );
      results.push({
        track: "amistad",
        otherUserId: userId,
        similarity: friendshipSimilarity,
        badges,
        narrative: buildNarrative("amistad", badges, friendshipSimilarity),
      });
    }
  }

  return results;
}

export interface GlobalMatch {
  track: MatchTrack;
  userA: string;
  userB: string;
  similarity: number;
  badges: Array<{ dimension: string; affinity: number }>;
}

export function computeAllMatches(
  pool: Array<{ userId: string; profile: ScoredProfile }>,
  config: MatchingConfig,
): GlobalMatch[] {
  const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const users = [...pool].sort((a, b) =>
    compareIds(a.userId.toLowerCase(), b.userId.toLowerCase()),
  );
  const tracks: MatchTrack[] = ["romance", "amistad"];
  const selected = new Map<string, GlobalMatch>();

  for (const track of tracks) {
    const trackConfig = config.tracks[track];
    const candidates = users.map(() => [] as Array<{ index: number; similarity: number }>);

    for (let indexA = 0; indexA < users.length; indexA += 1) {
      const userA = users[indexA]!;
      for (let indexB = indexA + 1; indexB < users.length; indexB += 1) {
        const userB = users[indexB]!;
        if (userA.userId.toLowerCase() === userB.userId.toLowerCase()) continue;
        if (track === "romance" && !checkHardFilters(userA.profile.hardFilters, userB.profile.hardFilters)) {
          continue;
        }

        const vectorA = track === "romance" ? userA.profile.romanceVector : userA.profile.friendshipVector;
        const vectorB = track === "romance" ? userB.profile.romanceVector : userB.profile.friendshipVector;
        const similarity = trackSimilarity(vectorA, vectorB, trackConfig);
        if (similarity <= trackConfig.minimum_similarity_exclusive) continue;
        candidates[indexA]!.push({ index: indexB, similarity });
        candidates[indexB]!.push({ index: indexA, similarity });
      }
    }

    for (let userIndex = 0; userIndex < users.length; userIndex += 1) {
      const ranked = candidates[userIndex]!
        .sort(
          (a, b) =>
            b.similarity - a.similarity ||
            compareIds(
              users[a.index]!.userId.toLowerCase(),
              users[b.index]!.userId.toLowerCase(),
            ),
        )
        .slice(0, trackConfig.max_matches);
      for (const candidate of ranked) {
        const user = users[userIndex]!;
        const other = users[candidate.index]!;
        const userA = user.userId.toLowerCase();
        const userB = other.userId.toLowerCase();
        const orderedA = userA < userB ? userA : userB;
        const orderedB = userA < userB ? userB : userA;
        const key = `${track}:${orderedA}:${orderedB}`;
        if (selected.has(key)) continue;

        const vectorA = track === "romance" ? user.profile.romanceVector : user.profile.friendshipVector;
        const vectorB = track === "romance" ? other.profile.romanceVector : other.profile.friendshipVector;
        const badges = generateBadges(
          vectorA,
          vectorB,
          trackConfig.dimensions,
          track,
          track === "romance" ? DEFAULT_ROMANCE_BADGES : DEFAULT_FRIENDSHIP_BADGES,
        ).map(({ dimension, affinity }) => ({ dimension, affinity }));
        selected.set(key, {
          track,
          userA: orderedA,
          userB: orderedB,
          similarity: candidate.similarity,
          badges,
        });
      }
    }
  }

  return [...selected.values()].sort(
    (a, b) =>
      compareIds(a.track, b.track) ||
      compareIds(a.userA, b.userA) ||
      compareIds(a.userB, b.userB),
  );
}
