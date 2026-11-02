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

/** Connection stroke opacity, proportional to similarity (0.18 – 0.72). */
export function edgeStrokeOpacity(similarity: number): number {
  return 0.18 + clamp(similarity, 0, 1) * 0.54;
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
