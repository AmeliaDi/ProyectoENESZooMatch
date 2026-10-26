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
 * - `animalId` / `colorId` are the CATALOGUE ids consumed by
 *   `getSpriteFrame(animalId, colorId, frame)`; `animalName` / `colorName` are
 *   the human es-MX words used in aria-labels and headlines. They are separate
 *   on purpose: the sprite engine needs ids, screen readers need words.
 * - `similarity` is the raw 0-1 track similarity, NOT a percentage.
 * - Thresholds are never part of this contract; the canvas reads them from
 *   `getTrackThreshold(track)` (which reads `data/matching-config.json`).
 */

import type { MatchExplanation } from "@/lib/explainability";
import type { CompatibilityBadge, MatchTrack } from "@/types/microtest";
import type { CSSProperties } from "react";

// ─── Node input (the unified shape) ──────────────────────────────────────────

/**
 * One constellation participant. Used for the current user (`isSelf: true`),
 * for real matches (`isSelf: false, isGhost: false`) and — synthetically, inside
 * the canvas only — for decorative ghosts.
 */
export interface ConstellationNodeInput {
  /** Stable unique id (Supabase user id, or any unique key). */
  id: string;
  /** Catalogue animal id, e.g. `"ajolotito"` — feeds `getSpriteFrame`. */
  animalId: string;
  /** Catalogue colour id, e.g. `"rosa_mexicano"` — feeds `getSpriteFrame`. */
  colorId: string;
  /** Display hex (`#rrggbb`) for halos, rings and connection lines. */
  colorHex: string;
  /** es-MX animal diminutive in display case, e.g. `"Ajolotito"`. */
  animalName: string;
  /** es-MX colour name in lowercase, e.g. `"rosa mexicano"`. */
  colorName: string;
  /** Public display name (never the matrícula). */
  alias: string;
  /** Raw 0-1 similarity with the current user, for this node's track. */
  similarity: number;
  /** Track this match belongs to. Ignored for the self node. */
  track: MatchTrack;
  /** Affinity badges (top 5 romance / top 3 amistad, already computed). */
  badges: CompatibilityBadge[];
  /** Full poetic explanation, or `null` when the API omitted it. */
  explanation: MatchExplanation | null;
  /** True only for the current user's centred node. */
  isSelf: boolean;
  /** True for decorative, non-interactive peripheral nodes. */
  isGhost: boolean;
  /** Matched person's MBTI code, when known (surfaced in the detail sheet). */
  mbtiCode?: string | null;
  /**
   * Optional raw track vectors. When BOTH are present and their length matches
   * the active track's dimension array, the detail sheet recomputes the
   * affinity bars live via `generateAffinityBreakdown`. Otherwise it falls back
   * to `explanation.breakdown`. Phase C can safely omit these.
   */
  selfVector?: readonly number[];
  matchVector?: readonly number[];
}

/** The current user: no similarity, track, badges or explanation of its own. */
export type ConstellationSelfInput = Omit<
  ConstellationNodeInput,
  "similarity" | "track" | "badges" | "explanation" | "isSelf" | "isGhost"
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
  /**
   * Cap on painted connection lines. Defaults to `MAX_RENDERED_EDGES` (180).
   * The simulation always uses every edge; only the paint is capped.
   */
  maxRenderedEdges?: number;
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
 * 2. `happy` → the `"happy"` frame (^ ^ eyes + floating heart).
 * 3. otherwise the shared idle ticker alternates `"idle_1"` / `"idle_2"`.
 */
export interface PixelAnimalProps {
  animalId: string;
  colorId: string;
  /** Explicit frame override. When set, `happy` and the idle ticker are ignored. */
  frame?: SpriteFrameName;
  /** Show the celebrating frame (active connection, hover or focus). */
  happy?: boolean;
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

/** The three frames the sprite engine can produce. */
export type SpriteFrameName = "idle_1" | "idle_2" | "happy";

// ─── Internal render structures (produced by the canvas) ─────────────────────

/**
 * A node as the React tree sees it. Geometry lives here ONCE; the animation
 * loop mutates the DOM `transform` attribute directly and never re-renders.
 */
export interface RenderNode {
  id: string;
  /** Physics/display radius in user units (from the layout engine). */
  radius: number;
  /** Sprite edge length in user units. */
  displaySize: number;
  isSelf: boolean;
  isGhost: boolean;
  animalId: string;
  colorId: string;
  colorHex: string;
  alias: string;
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
  /** 0-1 edge weight. */
  similarity: number;
  /** Stroke width in user units, proportional to similarity. */
  width: number;
  /** 0-1 stroke opacity, proportional to similarity. */
  opacity: number;
  /** Stroke colour (the outer node's hex for self-edges, ink for the rest). */
  color: string;
  /** Spring rest length — the "join" effect fires when distance drops below it. */
  targetDistance: number;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
}

/** The whole static React structure; rebuilt only on data / track / resize. */
export interface ConstellationStructure {
  nodes: RenderNode[];
  edges: RenderEdge[];
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
 * the accessible names and catalogue ids live here.
 */
export interface NodeMeta {
  animalId: string;
  colorId: string;
  colorHex: string;
  animalName: string;
  colorName: string;
  alias: string;
  /** Raw 0-1 similarity; `1` for the self node, `0` for ghosts. */
  similarity: number;
}

// ─── Centralised es-MX copy ──────────────────────────────────────────────────

/**
 * Every user-facing string of the constellation layer, in one place.
 * Warm, affective, inclusive (‑x endings), never clinical.
 */
export const CONSTELLATION_COPY = {
  viewTitle: "Tu constelación de almas compatibles",
  viewSubtitle:
    "Cada estrellita es alguien que vibra contigo. Arrástralas, acércalas y toca una para leer su historia.",
  trackRomance: "💫 Romance",
  trackAmistad: "✨ Amistad",
  trackToggleLabel: "Elige el tipo de conexión que quieres explorar",
  loading: "Acomodando las estrellas…",
  canvasLabel:
    "Mapa interactivo de tus conexiones. Usa Tab para recorrerlas y Enter para abrirlas.",
  selfSuffix: "tú, el centro de tu constelación",
  connectionsOne: "conexión",
  connectionsMany: "conexiones",
  emptyRomance:
    "Aún no aparece un alma gemela en este cielo, pero tranquilx: las constelaciones se siguen acomodando y tu vibra sigue siendo única <3",
  emptyAmistad:
    "Todavía no llega esx amigx con el que harías click inmediato, pero tu manada sigue creciendo. Vuelve pronto <3",
  closeSheet: "Cerrar detalle",
  sheetEyebrowRomance: "Conexión romántica",
  sheetEyebrowAmistad: "Conexión de amistad",
  sheetChemistryTitle: "Química entre ustedes",
  sheetAffinityTitle: "Dónde se encuentran",
  sheetPersonalityTitle: "Así es",
  sheetBadgesTitle: "Lo que más les une",
  sheetMbti: "MBTI",
  srListHeading: "Lista textual de tus conexiones",
  srListIntro:
    "Versión en texto de la constelación, con cada conexión y su porcentaje de afinidad.",
  srOpenDetail: "Ver el detalle de esta conexión",
  srNoConnections: "En este cielo todavía no hay conexiones que listar.",
  ghostDecorative: "Estrella decorativa",
} as const;
