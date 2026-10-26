/**
 * Constellation render layer — public barrel.
 *
 * Phase C should import from here:
 *
 * ```tsx
 * import { ConstellationView, type ConstellationMatchInput, type ConstellationSelfInput }
 *   from "@/components/constellation";
 * ```
 *
 * Everything exported from `./types` is the data contract; everything else is a
 * component or a pure helper that is safe to unit-test. Nothing in this folder
 * fetches, touches Supabase, or mutates the approved engines — the whole layer is
 * driven by props.
 */

// ─── Components ──────────────────────────────────────────────────────────────

export { ConstellationView } from "./ConstellationView";
export { ConstellationCanvas } from "./ConstellationCanvas";
export { TrackToggle } from "./TrackToggle";
export { NodeDetailSheet } from "./NodeDetailSheet";
export { PixelAnimal } from "./PixelAnimal";
export { OrbitingHearts, PixelHeart, RomanceDuo, SharedHeart } from "./RomanceHearts";

// ─── Prop contract + es-MX copy ──────────────────────────────────────────────

export { CONSTELLATION_COPY } from "./types";
export type {
  ConstellationCanvasProps,
  ConstellationMatchInput,
  ConstellationNodeInput,
  ConstellationSelfInput,
  ConstellationStructure,
  ConstellationViewProps,
  NodeDetailSheetProps,
  NodeMeta,
  PixelAnimalProps,
  RenderEdge,
  RenderNode,
  SpriteFrameName,
  TrackToggleProps,
} from "./types";

// ─── Pure helpers (importable, testable, DOM-free) ───────────────────────────

export {
  BADGE_LIMITS,
  GHOST_COLOR_ID,
  GHOST_ANIMAL_ID,
  MAX_RENDERED_EDGES,
  ROMANCE_SPRITE_THRESHOLD,
  buildDataKey,
  connectionsLabel,
  formatAffinityPercent,
  matchAriaLabel,
  matchesForTrack,
  nodeOpacity,
  selfAriaLabel,
  sliceBadges,
  trackNoun,
} from "./render-helpers";

export {
  buildNodeMeta,
  structureFromState,
  toMatchInputs,
  toSelfIdentity,
} from "./build-structure";

export { buildSpriteSheetSvg, spriteSheetUrl, warmSpriteSheets } from "./sprite-sheet";

export { REDUCED_MOTION_QUERY, useReducedMotionPreference } from "./hooks";
