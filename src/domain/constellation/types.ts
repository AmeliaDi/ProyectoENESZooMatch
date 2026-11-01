/**
 * Constellation domain contracts. Units everywhere: lengths in world px (the
 * SVG viewBox, which equals CSS px at zoom 1), times in seconds, unit mass.
 */

export type MatchTrack = "romance" | "amistad";

export type BodyKind = "self" | "match" | "ghost";

/** One match as the scene needs it: no names, no vectors, no PII. */
export interface SceneMatch {
  id: string;
  similarity: number;
  track: MatchTrack;
}

/** Pairwise affinity between two matches (neither is the current user). */
export type PairSimilarity = (a: SceneMatch, b: SceneMatch) => number;

export interface SceneInput {
  selfId: string;
  matches: readonly SceneMatch[];
  track: MatchTrack;
  /** Exclusive similarity threshold of `track` (from matching config). */
  threshold: number;
  width: number;
  height: number;
  ghostCount: number;
  /** Real pair affinities when known; defaults to `estimatePairSimilarity`. */
  pairSimilarity?: PairSimilarity;
  /** Overrides `scene.maxRealMatches` (dev stress scenarios only). */
  maxMatches?: number;
}

export interface SceneBody {
  id: string;
  kind: BodyKind;
  similarity: number;
  /** Collision radius: half the sprite support. */
  radius: number;
  /** Visual radius, which scales with affinity (sprite size only). */
  displayRadius: number;
  homeX: number;
  homeY: number;
}

export type LinkKind = "spoke" | "pair";

export interface SceneLink {
  key: string;
  a: string;
  b: string;
  kind: LinkKind;
  similarity: number;
  /** Spring rest length; equals the distance between both homes. */
  rest: number;
}

/** A mutually compatible clique of 3+ matches (the self node is implied). */
export interface SceneGroup {
  ids: readonly string[];
  /** Weakest internal pair affinity (conservative group score). */
  score: number;
}

export interface Scene {
  selfId: string;
  track: MatchTrack;
  threshold: number;
  width: number;
  height: number;
  bodies: SceneBody[];
  links: SceneLink[];
  groups: SceneGroup[];
}

export interface Vec2 {
  x: number;
  y: number;
}
