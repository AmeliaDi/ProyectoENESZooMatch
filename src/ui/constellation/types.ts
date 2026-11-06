/**
 * Constellation render layer — public prop contract.
 *
 * This module is the ONLY data surface Phase C needs to care about. Everything
 * below is data-agnostic: the components never fetch, never read Supabase and
 * never import the matching engine directly. Phase C feeds them from
 * `GET /api/result` (the same payload `PublicResultView` already parses).
 *
 * Design rules for this contract:
 * - All user-facing copy produced from these fields is es-MX, warm and inclusive.
 * - `identity` is the stored, frozen `IdentityDto`: the ONLY name source of a
 *   node. Every label, sheet headline and aria text renders it through
 *   `formatIdentity()`; nobody concatenates animal and colour here.
 * - `animalId` / `colorId` / `mark` are the same catalogue ids carried by that
 *   identity (`getSpriteFrame(animalId, colorId, frame)`), copied at the
 *   adapter boundary, never re-derived from names or hexes.
 * - `similarity` is the raw 0-1 track similarity, NOT a percentage.
 * - Thresholds are never part of this contract; the canvas reads them from
 *   `getTrackThreshold(track)` (which reads `data/matching-config.json`).
 */

import type { PhysicsConfig } from "@/config";
import type { IdentityDto } from "@/contracts/identity";
import type { ChemistrySummary, LayerAffinityBand, MatchExplanation, SharedProfileDto, SpriteMark } from "@/contracts/result";
import type { LinkKind, PairSimilarity } from "@/domain/constellation";
import type { CompatibilityBadge, MatchTrack } from "@/types/microtest";
import type { CSSProperties, RefObject } from "react";

import type { GlowLevel } from "./render-helpers";

export type { SpriteMark };

// ─── Node input (the unified shape) ──────────────────────────────────────────

/**
 * One constellation participant. Used for the current user (`isSelf: true`),
 * for real matches (`isSelf: false, isGhost: false`) and — synthetically, inside
 * the canvas only — for decorative ghosts.
 */
export interface ConstellationNodeInput {
  /** Stable unique id (Supabase user id, or any unique key). */
  id: string;
  /** Stored identity of this person; the only route to a name or an aria text. */
  identity: IdentityDto;
  /** Catalogue animal id, e.g. `"ajolotito"` — the one stored on `identity`. */
  animalId: string;
  /** Catalogue colour id, e.g. `"ennea-2"` — the one stored on `identity`. */
  colorId: string;
  /** Enneagram subtype mark; absent/`null` draws none. */
  mark?: SpriteMark | null | undefined;
  /** Display hex (`#rrggbb`) for halos, rings and connection lines. */
  colorHex: string;
  /** Raw 0-1 similarity with the current user, for this node's track. */
  similarity: number;
  /** Track this match belongs to. Ignored for the self node. */
  track: MatchTrack;
  /** Affinity badges (top 5 romance / top 3 amistad, already computed). */
  badges: CompatibilityBadge[];
  /** Server-computed chemistry band; `null` hides the detail sheet header. */
  chemistry: ChemistrySummary | null;
  /** Full poetic explanation, or `null` when the API omitted it. */
  explanation: MatchExplanation | null;
  /** True only for the current user's centred node. */
  isSelf: boolean;
  /** True for decorative, non-interactive peripheral nodes. */
  isGhost: boolean;
  /** Per-layer affinity bands with this person (ADR-030). */
  layers?: readonly LayerAffinityBand[] | undefined;
  /** What this person chose to share; absent = nothing. */
  shared?: SharedProfileDto | undefined;
}

/** The current user: no similarity, track, badges or explanation of its own. */
export type ConstellationSelfInput = Omit<
  ConstellationNodeInput,
  "similarity" | "track" | "badges" | "chemistry" | "explanation" | "isSelf" | "isGhost"
>;

/** A real match. `track` decides under which tab it appears. */
export type ConstellationMatchInput = Omit<
  ConstellationNodeInput,
  "isSelf" | "isGhost"
>;

// ─── Component props ─────────────────────────────────────────────────────────

/** Props of the composed experience (`ConstellationView`) — Phase C's entry. */
export interface ConstellationViewProps {
  /** The current user. */
  me: ConstellationSelfInput;
  /** Every match, from BOTH tracks. The canvas filters by the active track. */
  matches: readonly ConstellationMatchInput[];
  /** Track shown on first paint. Defaults to `"romance"`. */
  initialTrack?: MatchTrack;
  /** Decorative peripheral stars. Clamped to 0-12 by the layout engine. */
  ghostCount?: number;
  /**
   * Force reduced-motion behaviour. When omitted the components read
   * `matchMedia("(prefers-reduced-motion: reduce)")` themselves and keep
   * listening for changes.
   */
  reducedMotion?: boolean;
  /** Extra classes for the outer wrapper. */
  className?: string;
  /**
   * Inline style for the outer wrapper. The constellation needs a definite
   * height to measure itself against; the default is
   * `min(72vh, 44rem)` with a `22rem` floor. Override it here rather than
   * fighting Tailwind class order.
   */
  style?: CSSProperties;
  /** Heading shown above the canvas. Defaults to `COPY.viewTitle`. */
  title?: string;
  /** Shown when the active track has no match above its threshold. */
  emptyMessage?: string;
}

/** Props of the raw canvas, when Phase C wants to own the toggle/sheet. */
export interface ConstellationCanvasProps {
  me: ConstellationSelfInput;
  matches: readonly ConstellationMatchInput[];
  /** Currently active track (controlled). */
  track: MatchTrack;
  ghostCount?: number;
  /** Resolved reduced-motion flag (controlled). */
  reducedMotion: boolean;
  /** Node whose detail sheet is open, or `null`. */
  selectedNodeId: string | null;
  /** Called on click / tap / Enter / Space of a real node. */
  onSelectNode: (nodeId: string) => void;
  /** Extra classes for the canvas wrapper. */
  className?: string;
  /** Inline style for the canvas wrapper (see `ConstellationViewProps.style`). */
  style?: CSSProperties;
  /** Shown, centred over an empty sky, when the track has no match. */
  emptyMessage?: string;
  /** Real pairwise affinities between matches, when the server provides them. */
  pairSimilarity?: PairSimilarity;
  /** Dev-only hook: receives live engine metrics once per animation frame. */
  onMetrics?: (metrics: CanvasMetrics) => void;
  /** Dev-only: physics config override (defaults to `data/physics-config.json`). */
  physics?: PhysicsConfig;
  /** Dev-only: allow more than `scene.maxRealMatches` stars (stress tests). */
  maxMatches?: number;
  /** Dev-only: overrides the track threshold from the matching config. */
  thresholdOverride?: number;
  /** Dev-only: imperative handle for scenario buttons. */
  controlRef?: RefObject<CanvasControl | null>;
  /**
   * Chat state per node id: an open chat gilds the spoke; a pending
   * invitation shows a small speech mark over the star (never a count).
   */
  chatMarks?: { open: ReadonlySet<string>; pending: ReadonlySet<string> };
}

/** Live engine numbers reported to the dev physics panel. */
export interface CanvasMetrics {
  fps: number;
  /** Mean milliseconds per fixed physics step during the last frame. */
  msPerStep: number;
  stepsPerFrame: number;
  kinetic: number;
  contacts: number;
  /** Smoothed RMS displacement per step (px). */
  jitter: number;
  asleep: boolean;
  /** Seconds from the last wake-up to sleep, `null` while awake. */
  settleSeconds: number | null;
  bodies: number;
  links: number;
  groups: number;
}

/** Imperative controls the dev panel can call. */
export interface CanvasControl {
  recenter: () => void;
  /** Deterministic impulse on every real star ("drag agresivo"). */
  kick: () => void;
}

/** Props of the segmented Romance / Amistad toggle. */
export interface TrackToggleProps {
  track: MatchTrack;
  onChange: (track: MatchTrack) => void;
  /** Live counts, rendered as a subtle hint next to each segment. */
  counts?: { romance: number; amistad: number };
  /** Resolved reduced-motion flag. */
  reducedMotion?: boolean;
  /**
   * `id` of the region the toggle controls, wired to `aria-controls`.
   * Defaults to `"constellation-panel"`.
   */
  panelId?: string;
  className?: string;
}

/** Props of the detail sheet (bottom sheet on mobile, side panel on desktop). */
export interface NodeDetailSheetProps {
  /** The match being inspected, or `null` to keep the sheet closed. */
  node: ConstellationMatchInput | null;
  /** The current user — needed for the poetic headline. */
  self: ConstellationSelfInput;
  /** Active track; drives colours and the chemistry wording. */
  track: MatchTrack;
  reducedMotion: boolean;
  onClose: () => void;
}

/**
 * Props of a single pixel sprite.
 *
 * Frame resolution order:
 * 1. `frame` — explicit override, wins over everything (used by the dev gallery
 *    and by the canvas when it wants a frozen frame under reduced motion).
 * 2. `romance` → the `"romance_pulse"` frame (heart-eyes + floating hearts).
 * 3. `happy` → the `"happy"` frame (^ ^ eyes + floating heart).
 * 4. otherwise the shared idle ticker alternates `"idle_1"` / `"idle_2"`.
 */
export interface PixelAnimalProps {
  animalId: string;
  colorId: string;
  /** Enneagram subtype mark (own sprite, or a counterpart who opted in). */
  mark?: SpriteMark | null | undefined;
  /** Explicit frame override. When set, every other frame flag is ignored. */
  frame?: SpriteFrameName;
  /** Show the celebrating frame (active connection, hover or focus). */
  happy?: boolean;
  /**
   * Show the romance frame. Wins over `happy`. The constellation enables it for
   * romantic connections with affinity >= 75%.
   */
  romance?: boolean;
  /**
   * Participate in the 2-frame idle blink. Pass `false` for ghosts, for
   * reduced motion, and for server-rendered snapshots.
   */
  animated?: boolean;
  /** Rendered edge length in CSS px / user units (the sprite is square). */
  size: number;
  /**
   * Top-left offset of the nested `<svg>`, in user units. The canvas passes
   * `-size / 2` for both so the sprite is centred on its node's origin.
   */
  x?: number;
  y?: number;
  /** 0-1. Ghosts and low-similarity nodes are dimmed through this. */
  opacity?: number;
  className?: string;
}

/** The four frames the sprite engine can produce. */
export type SpriteFrameName = "idle_1" | "idle_2" | "happy" | "romance_pulse";

// ─── Internal render structures (produced by the canvas) ─────────────────────

/**
 * A node as the React tree sees it. Geometry lives here ONCE; the animation
 * loop mutates the DOM `transform` attribute directly and never re-renders.
 */
export interface RenderNode {
  id: string;
  mark: SpriteMark | null;
  /** Physics/display radius in user units (from the layout engine). */
  radius: number;
  /** Sprite edge length in user units. */
  displaySize: number;
  isSelf: boolean;
  isGhost: boolean;
  /** Left the active track and is fading out: never interactive. */
  isLeaving: boolean;
  animalId: string;
  colorId: string;
  colorHex: string;
  /** Canonical name from `formatIdentity`; the star tag clips it to fit. */
  name: string;
  /** Small visible affinity (`"87%"`) for real matches; `null` for you and ghosts. */
  affinityLabel: string | null;
  /** Very high estimated affinity: the star is painted golden. Never you or ghosts. */
  radiant: boolean;
  /** Dithered halo density step (0-2), rising with affinity. Matches only. */
  glowLevel: GlowLevel;
  /** Fully-formed es-MX accessible name. */
  ariaLabel: string;
  /** 0-1 body opacity, scaled by similarity for real matches. */
  opacity: number;
  /** Position used for the very first paint only. */
  initialX: number;
  initialY: number;
}

/** A connection line as the React tree sees it. */
export interface RenderEdge {
  /** Stable, order-independent key (`a::b`). */
  key: string;
  source: string;
  target: string;
  /** `spoke` joins you to a match; `pair` joins two matches. */
  kind: LinkKind;
  /** 0-1 edge weight. */
  similarity: number;
  /** Stroke width in user units, proportional to similarity. */
  width: number;
  /** 0-1 stroke opacity: a 3:1 floor plus a similarity bonus. */
  opacity: number;
  /**
   * Spoke to a golden (radiant) match: drawn in gold. Every other line uses
   * the theme `rim` token (CSS class), whose contrast is audited per mode.
   */
  radiant: boolean;
}

/** The whole static React structure; rebuilt only on data / track / resize. */
export interface ConstellationStructure {
  nodes: RenderNode[];
  edges: RenderEdge[];
  /** Mutually compatible groups (ids), drawn as a figure outline. */
  groups: (readonly string[])[];
  /** `nodeId` → ids of the nodes it is connected to under the active track. */
  adjacency: Map<string, string[]>;
  /** Track threshold the structure was built with (drives every brightness map). */
  threshold: number;
  /** Id of the centred self node. */
  selfId: string;
  /** ViewBox width in user units (=== CSS px). */
  width: number;
  /** ViewBox height in user units (=== CSS px). */
  height: number;
}

/**
 * Everything the render tree needs to know about one id, indexed once per data
 * change. The physics engine only carries `animal` / `color` (ids and a hex);
 * the stored identity and its canonical name live here. `identity` is `null`
 * only for decorative ghosts — they are not people and never get a name.
 */
export interface NodeMeta {
  identity: IdentityDto | null;
  animalId: string;
  colorId: string;
  mark: SpriteMark | null;
  colorHex: string;
  /** Canonical display name (`formatIdentity(...).title`); `""` for ghosts. */
  name: string;
  /** Raw 0-1 similarity; `1` for the self node, `0` for ghosts. */
  similarity: number;
}

// ─── Centralised es-MX copy ──────────────────────────────────────────────────

/**
 * Every user-facing string of the constellation layer, in one place.
 * Warm, affective, inclusive (‑x endings), never clinical.
 */
export const CONSTELLATION_COPY = {
  viewTitle: "Tu constelación",
  viewSubtitle:
    "Cada estrella es alguien con quien tu afinidad estimada es alta. Arrástralas y toca una para ver por qué.",
  trackRomance: "Romance",
  trackAmistad: "Amistad",
  trackToggleLabel: "Elige el tipo de conexión que quieres explorar",
  loading: "Acomodando las estrellas…",
  canvasLabel:
    "Mapa interactivo de tus conexiones. Usa Tab para recorrerlas y Enter para abrirlas.",
  selfSuffix: "tú, el centro de tu constelación",
  connectionsOne: "conexión",
  connectionsMany: "conexiones",
  emptyRomance:
    "Aún no aparece una afinidad romántica en este cielo. Las constelaciones se siguen acomodando y tu vibra sigue siendo única.",
  emptyAmistad:
    "Todavía no llega esa amistad con la que harías click, pero el cielo sigue creciendo.",
  closeSheet: "Cerrar detalle",
  sheetEyebrowRomance: "Conexión romántica",
  sheetEyebrowAmistad: "Conexión de amistad",
  sheetChemistryTitle: "Química entre ustedes",
  sheetWhyTitle: "Por qué funciona",
  sheetDailyTitle: "En el día a día",
  sheetCareTitle: "Punto de atención",
  sheetAffinityTitle: "Dónde se encuentran",
  sheetPersonalityTitle: "Así es",
  sheetPsychometricsTitle: "Capa psicométrica",
  sheetEnneagram: "Eneagrama",
  sheetCognitive: "Funciones",
  sheetAttachment: "Apego",
  sheetCompatibility: "Compatibilidad psicométrica",
  sheetBadgesTitle: "Lo que más les une",
  sheetMbti: "MBTI",
  sheetMbtiTitle: "Cómo se piensan",
  sheetBigFiveTitle: "Rasgos compartidos",
  srListHeading: "Lista textual de tus conexiones",
  srListIntro:
    "Versión en texto de la constelación, con cada conexión y su porcentaje de afinidad.",
  srOpenDetail: "Ver el detalle de esta conexión",
  srNoConnections: "En este cielo todavía no hay conexiones que listar.",
  ghostDecorative: "Estrella decorativa",
  recenter: "Recentrar el cielo",
  zoomIn: "Acercar",
  zoomOut: "Alejar",
} as const;
