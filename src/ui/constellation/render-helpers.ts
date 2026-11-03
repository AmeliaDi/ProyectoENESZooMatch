/**
 * Constellation render layer — pure helpers.
 *
 * Everything here is side-effect free, DOM-free and React-free so it can be
 * unit-tested in Vitest's `node` environment. The physics lives in
 * `@/domain/constellation`; these helpers only map its numbers to strokes,
 * opacities, sprite sizes and es-MX copy.
 */

import type { CompatibilityBadge, MatchTrack } from "@/types/microtest";

import { CONSTELLATION_COPY } from "./types";
import type { ConstellationMatchInput, ConstellationSelfInput } from "./types";

// ─── Tunables (render-only; physics constants live in data/physics-config.json) ─

/**
 * Sprite edge length as a multiple of the display radius. The 16×16 grid keeps
 * a transparent margin, so a value slightly above 2 keeps the visible body
 * roughly the size of the display circle.
 */
export const SPRITE_SIZE_FACTOR = 2.4;

/** Minimum pointer/touch target radius padding, in world units (≥ 44 px targets). */
export const HIT_RADIUS_PADDING = 8;

/** Gap (user units) between the sprite top, or its orbiting hearts, and the affinity label. */
export const AFFINITY_LABEL_GAP = 5;
/** Hearts orbit this fraction of the sprite size above it (see `OrbitingHearts`). */
export const HEART_LIFT_RATIO = 0.42;

/** `y` of the affinity label baseline, relative to the node centre. */
export function affinityLabelY(displaySize: number, romance: boolean): number {
  const top = -displaySize / 2 - (romance ? displaySize * HEART_LIFT_RATIO : 0);
  return top - AFFINITY_LABEL_GAP;
}

/** Idle sprite frame period, in milliseconds (2-frame blink loop). */
export const IDLE_FRAME_INTERVAL_MS = 600;

/** Resize debounce, in milliseconds: a resize rebuilds the scene. */
export const SIZE_DEBOUNCE_MS = 220;

/** Badge caps per track, mirroring the matching engine's output. */
export const BADGE_LIMITS: Record<MatchTrack, number> = {
  romance: 5,
  amistad: 3,
};

/**
 * Romance affinity (0-1) that unlocks the `romance_pulse` sprite. Shared by
 * the canvas and the detail sheet so both use exactly one threshold.
 */
export const ROMANCE_SPRITE_THRESHOLD = 0.75;

/** Shown affinity (rounded %) from which a match star turns golden. */
export const RADIANT_AFFINITY_PERCENT = 95;

/**
 * Decided on the rounded percent the person reads, so a star labelled «95%»
 * always glows and one labelled «94%» never does.
 */
export function isRadiantAffinity(similarity: number): boolean {
  return Number(formatAffinityPercent(similarity)) >= RADIANT_AFFINITY_PERCENT;
}

/** Ghost sprites use these registered catalogue ids. */
export const GHOST_ANIMAL_ID = "estrellita";
export const GHOST_COLOR_ID = "ennea-neblina";

/** Pixel dash of constellation lines (on/off, world units). */
export const LINE_DASH: readonly [number, number] = [4, 3];

/** Rounds a coordinate for DOM attribute writes (keeps strings short). */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// ─── Small numeric helpers ───────────────────────────────────────────────────

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * Normalises a similarity against its track threshold, so `threshold` → 0 and
 * `1.0` → 1. Used for every "brightness scales with affinity" mapping.
 */
export function normalizeSimilarity(similarity: number, threshold: number): number {
  const span = 1 - threshold;
  if (span <= 0) return 1;
  return clamp((similarity - threshold) / span, 0, 1);
}

/** Body opacity: even the weakest allowed match stays clearly visible. */
export function nodeOpacity(similarity: number, threshold: number): number {
  return 0.62 + normalizeSimilarity(similarity, threshold) * 0.38;
}

/** Connection stroke width, proportional to similarity (1 – 2.6 user units). */
export function edgeStrokeWidth(similarity: number): number {
  return 1 + clamp(similarity, 0, 1) * 1.6;
}

/**
 * Lowest stroke opacity of a constellation line. Lines are painted with the
 * `rim` token (gold when radiant); at this opacity they still clear 3:1
 * against the sky in every mode (`contrast-audit.test.ts`). Was 0.18.
 */
export const EDGE_OPACITY_MIN = 0.75;
/** Opacity added by similarity on top of the floor (max 0.95, under the sprites). */
export const EDGE_OPACITY_SPAN = 0.2;
/** Extra opacity of the lines touching the hovered / focused star. */
export const EDGE_LIT_BOOST = 0.25;

/** Connection stroke opacity: never under the 3:1 floor, brighter with similarity. */
export function edgeStrokeOpacity(similarity: number): number {
  return EDGE_OPACITY_MIN + clamp(similarity, 0, 1) * EDGE_OPACITY_SPAN;
}

/** Opacity of a star whose neighbourhood is not in focus (sprite and halo only). */
export const DIMMED_OPACITY = 0.55;

/**
 * The % label never fades below this opacity, even on weak or dimmed stars,
 * so it keeps ≥ 4.5:1 on the day sky (was 0.55 → 3.49:1).
 */
export const AFFINITY_LABEL_MIN_OPACITY = 0.8;

/** The gold % (≥ 95 %) is a key figure under the gold rule: always fully opaque. */
export function affinityLabelOpacity(bodyOpacity: number, radiant = false): number {
  if (radiant) return 1;
  return Math.max(AFFINITY_LABEL_MIN_OPACITY, Math.min(1, bodyOpacity));
}

/**
 * Halo tiers by normalised affinity: a match's dithered halo gets denser in
 * steps (Bayer 25 % → 50 % → 75 %), never continuously, so it is pre-rendered
 * as three shared patterns.
 */
export const GLOW_STEPS: readonly number[] = [1 / 3, 2 / 3];
export type GlowLevel = 0 | 1 | 2;

export function glowLevel(similarity: number, threshold: number): GlowLevel {
  const norm = normalizeSimilarity(similarity, threshold);
  const [low = 1, high = 1] = GLOW_STEPS;
  return norm >= high ? 2 : norm >= low ? 1 : 0;
}

/** Decorative ghosts never take part in interactions. */
export const GHOST_OPACITY = 0.34;


// ─── Formatting ──────────────────────────────────────────────────────────────

/** `0.873` → `"87"`. Used for visible copy (matches the `%`-without-space style). */
export function formatAffinityPercent(similarity: number): string {
  return String(Math.round(clamp(similarity, 0, 1) * 100));
}

/** es-MX track wording used inside sentences. */
export function trackNoun(track: MatchTrack): string {
  return track === "romance" ? "romance" : "amistad";
}

/**
 * Accessible name for a real match node, exactly in the documented shape:
 * `"Ajolotito rosa orquídea, 87 % de afinidad estimada en romance"`.
 */
export function matchAriaLabel(
  animalName: string,
  colorName: string,
  similarity: number,
  track: MatchTrack,
): string {
  const identity = colorName.trim().length > 0 ? `${animalName} ${colorName}` : animalName;
  return `${identity}, ${formatAffinityPercent(similarity)} % de afinidad estimada en ${trackNoun(track)}`;
}

/** Accessible name for the centred self node. */
export function selfAriaLabel(animalName: string, colorName: string, alias: string): string {
  const identity = colorName.trim().length > 0 ? `${animalName} ${colorName}` : animalName;
  const who = alias.trim().length > 0 ? `${alias}, ` : "";
  return `${who}${identity}, ${CONSTELLATION_COPY.selfSuffix}`;
}

/** `1 conexión` / `7 conexiones`. */
export function connectionsLabel(count: number): string {
  return `${count} ${count === 1 ? CONSTELLATION_COPY.connectionsOne : CONSTELLATION_COPY.connectionsMany}`;
}

/**
 * Badges shown in the detail sheet: sorted by affinity (descending, stable) and
 * capped at top 5 for romance / top 3 for amistad.
 */
export function sliceBadges(
  badges: readonly CompatibilityBadge[],
  track: MatchTrack,
): CompatibilityBadge[] {
  return badges
    .map((badge, index) => ({ badge, index }))
    .sort((a, b) => b.badge.affinity - a.badge.affinity || a.index - b.index)
    .slice(0, BADGE_LIMITS[track])
    .map((entry) => entry.badge);
}

// ─── Data-key helpers ────────────────────────────────────────────────────────

/**
 * A cheap structural fingerprint of the input data. The scene rebuild is keyed
 * on THIS string rather than on object identity, so callers can pass freshly
 * mapped arrays on every render without restarting the physics.
 */
export function buildDataKey(
  me: ConstellationSelfInput,
  matches: readonly ConstellationMatchInput[],
): string {
  let key = `${me.id}|${me.animalId}|${me.colorId}|${me.alias}`;
  for (const match of matches) {
    key += `#${match.id}:${match.track}:${match.similarity.toFixed(4)}:${match.animalId}:${match.colorId}`;
  }
  return key;
}

/** Matches that are real under `track`: strictly above its threshold. */
export function matchesForTrack(
  matches: readonly ConstellationMatchInput[],
  track: MatchTrack,
  threshold: number,
): ConstellationMatchInput[] {
  const seen = new Set<string>();
  const result: ConstellationMatchInput[] = [];
  for (const match of matches) {
    if (match.track !== track) continue;
    if (!(match.similarity > threshold)) continue;
    if (seen.has(match.id)) continue;
    seen.add(match.id);
    result.push(match);
  }
  return result.sort((a, b) => b.similarity - a.similarity || (a.id < b.id ? -1 : 1));
}
