/**
 * Constellation render layer — pure helpers.
 *
 * Everything here is side-effect free, DOM-free and React-free so it can be
 * unit-tested in Vitest's `node` environment (the project's vitest glob only
 * picks up `src` TS test files, so component files are deliberately untested
 * and all the non-trivial logic lives here instead).
 *
 * These helpers are the glue between the approved physics engine
 * (`@/lib/constellation-layout`) and the SVG render tree. They never mutate the
 * engine's state objects.
 */

import type { ConstellationEdge, SimulationState } from "@/lib/constellation-layout";
import type { CompatibilityBadge, MatchTrack } from "@/types/microtest";

import { CONSTELLATION_COPY } from "./types";
import type { ConstellationMatchInput, ConstellationSelfInput } from "./types";

// ─── Tunables (render-only; the physics constants live in the engine) ────────

/**
 * Sprite edge length as a multiple of the physics radius. The 12×12 grid has
 * ~1 px of transparent margin, so a value slightly above 2 keeps the visible
 * body roughly the size of the collision circle without visual overlap.
 */
export const SPRITE_SIZE_FACTOR = 2.4;

/** Minimum pointer/touch target radius, in user units (≈48 px diameter). */
export const HIT_RADIUS_PADDING = 8;

/**
 * A connection counts as "joined" once the real distance drops to this fraction
 * of the spring rest length. Slightly above 1.0 so the spark fires a few frames
 * before the spring fully settles, which reads as the two stars meeting.
 */
export const JOIN_DISTANCE_FACTOR = 1.04;

/** Lifetime of one join spark, in milliseconds. */
export const SPARK_LIFETIME_MS = 720;

/** Hard cap on simultaneous sparks so a track switch can never flood the DOM. */
export const MAX_SPARKS = 8;

/** Idle sprite frame period, in milliseconds (2-frame blink loop). */
export const IDLE_FRAME_INTERVAL_MS = 600;

/** Frames skipped between physics steps once the layout is at equilibrium. */
export const AMBIENT_FRAME_DIVIDER = 3;

/** Upper bound on physics steps per animation frame (tab-switch catch-up). */
export const MAX_STEPS_PER_FRAME = 3;

/**
 * Resize debounce, in milliseconds. A full rebuild re-runs `precomputeLayout`
 * (~140 ms for 50 nodes on a desktop, several times that on a phone), so a
 * window drag must not trigger one per `ResizeObserver` callback.
 */
export const SIZE_DEBOUNCE_MS = 220;

/** Badge caps per track, mirroring the matching engine's output. */
export const BADGE_LIMITS: Record<MatchTrack, number> = {
  romance: 5,
  amistad: 3,
};

/**
 * Romance affinity (0-1) that unlocks the `romance_pulse` sprite. The prompt
 * sets the product rule at 75%; keeping it here makes the canvas and the detail
 * sheet share exactly one threshold.
 */
export const ROMANCE_SPRITE_THRESHOLD = 0.75;

/**
 * Upper bound on connection lines actually painted.
 *
 * The physics engine builds an edge for EVERY pair above the threshold, and
 * match↔match similarity is estimated as `simA * simB`, so a dense 50-match
 * constellation can produce 700+ edges. Stroking that many semi-transparent
 * lines every frame is the single biggest mobile paint cost, so rendering keeps
 * all self↔match spokes (they define the constellation's shape) plus the
 * strongest match↔match links up to this cap. The simulation still uses every
 * edge — only the paint is capped.
 */
export const MAX_RENDERED_EDGES = 180;

/** Ghost sprites use these registered catalogue ids (the engine labels them
 *  `"estrella"`, which is not a catalogue entry). */
export const GHOST_ANIMAL_ID = "estrellita";
export const GHOST_COLOR_ID = "plateado-lunar";

/** Rounds a coordinate for DOM attribute writes (keeps strings short). */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Pointer travel below this many CSS pixels is treated as a tap (open the detail
 * sheet) rather than a drag. Matches the platform convention of ~4-6 px.
 */
export const DRAG_CLICK_SLOP = 6;

// ─── Join-spark geometry ─────────────────────────────────────────────────────

/** 7×6 pixel heart, `x` = filled cell. Used for the brief "join" effect. */
export const HEART_ROWS: readonly string[] = [
  ".xx.xx.",
  "xxxxxxx",
  "xxxxxxx",
  ".xxxxx.",
  "..xxx..",
  "...x...",
] as const;

export interface HeartRect {
  x: number;
  y: number;
  w: number;
  /** Which of the two node colours paints this run: 0 = source, 1 = target. */
  colorIndex: 0 | 1;
}

let heartRectCache: HeartRect[] | null = null;

/**
 * Run-length-encoded heart, centred on the origin (so a spark only needs one
 * `translate`). Each run is split at the vertical midline so the left half
 * takes one node's colour and the right half takes the other's.
 */
export function heartRects(): readonly HeartRect[] {
  if (heartRectCache) return heartRectCache;
  const rects: HeartRect[] = [];
  const width = HEART_ROWS[0].length;
  const height = HEART_ROWS.length;
  const offsetX = -width / 2;
  const offsetY = -height / 2;
  const mid = offsetX + width / 2;
  for (let y = 0; y < height; y++) {
    const row = HEART_ROWS[y];
    let x = 0;
    while (x < row.length) {
      if (row[x] !== "x") {
        x++;
        continue;
      }
      let run = 1;
      while (x + run < row.length && row[x + run] === "x") run++;
      const left = offsetX + x;
      const right = left + run;
      if (left < mid && right > mid) {
        const split = mid - left;
        rects.push({ x: left, y: offsetY + y, w: split, colorIndex: 0 });
        rects.push({ x: mid, y: offsetY + y, w: run - split, colorIndex: 1 });
      } else {
        rects.push({ x: left, y: offsetY + y, w: run, colorIndex: left < mid ? 0 : 1 });
      }
      x += run;
    }
  }
  heartRectCache = rects;
  return rects;
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
 * `"Ajolotito rosa mexicano, 87 % de afinidad en romance"`.
 */
export function matchAriaLabel(
  animalName: string,
  colorName: string,
  similarity: number,
  track: MatchTrack,
): string {
  const identity = colorName.trim().length > 0 ? `${animalName} ${colorName}` : animalName;
  return `${identity}, ${formatAffinityPercent(similarity)} % de afinidad en ${trackNoun(track)}`;
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

// ─── Graph / state helpers ───────────────────────────────────────────────────

/**
 * Order-independent edge key, so `a→b` and `b→a` collide. The `::` separator is
 * deliberately printable: these keys end up in `data-edge-key` attributes and in
 * React `key`s, where a control character would be fragile.
 */
export function edgeKey(a: string, b: string): string {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

/**
 * Ids that must stay visible: the self node, every ghost, and both endpoints of
 * every live edge.
 *
 * `switchTrack` deliberately preserves nodes that no longer match under the new
 * track (so positions stay continuous when you switch back). Rendering them
 * would show people who are NOT matches, and leaving them in the physics would
 * let an invisible pile-up push the real constellation around — they have no
 * edges, so only centre gravity acts on them. Pruning keeps both the visual and
 * the physical model honest.
 */
export function activeNodeIds(state: SimulationState): Set<string> {
  const ids = new Set<string>();
  for (const node of state.nodes) {
    if (node.isSelf || node.isGhost) ids.add(node.id);
  }
  for (const edge of state.edges) {
    ids.add(edge.source);
    ids.add(edge.target);
  }
  return ids;
}

/**
 * Returns a state without the non-self, non-ghost nodes that lost every edge.
 * Returns the SAME object when nothing has to go, so callers can cheaply detect
 * a no-op.
 */
export function pruneInactiveNodes(state: SimulationState): SimulationState {
  const keep = activeNodeIds(state);
  if (state.nodes.every((node) => keep.has(node.id))) return state;
  const nodes = state.nodes.filter((node) => keep.has(node.id));
  return { ...state, nodes };
}

export interface CachedPosition {
  x: number;
  y: number;
}

/** Snapshot of every node position, used to keep track switches continuous. */
export function capturePositions(state: SimulationState): Map<string, CachedPosition> {
  const cache = new Map<string, CachedPosition>();
  for (const node of state.nodes) cache.set(node.id, { x: node.x, y: node.y });
  return cache;
}

/**
 * Re-applies remembered positions after `switchTrack` re-introduced nodes that
 * had been pruned. Velocities are left untouched (they are zero for re-added
 * nodes), so the spring system simply walks them back to their new rest points.
 */
export function applyCachedPositions(
  state: SimulationState,
  cache: ReadonlyMap<string, CachedPosition>,
): SimulationState {
  if (cache.size === 0) return state;
  let changed = false;
  const nodes = state.nodes.map((node) => {
    const cached = cache.get(node.id);
    if (!cached || (cached.x === node.x && cached.y === node.y)) return node;
    changed = true;
    return { ...node, x: cached.x, y: cached.y };
  });
  return changed ? { ...state, nodes } : state;
}

/**
 * Adjacency list built from the edges that are actually PAINTED (see
 * `selectRenderEdges`), so the "happy neighbour" highlight always matches what
 * the user can see rather than the full physics graph.
 */
export function buildAdjacency(edges: readonly ConstellationEdge[]): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();
  const push = (from: string, to: string): void => {
    const list = adjacency.get(from);
    if (list) {
      if (!list.includes(to)) list.push(to);
    } else {
      adjacency.set(from, [to]);
    }
  };
  for (const edge of edges) {
    push(edge.source, edge.target);
    push(edge.target, edge.source);
  }
  return adjacency;
}

/**
 * Picks the edges that will actually be painted, honouring `MAX_RENDERED_EDGES`.
 *
 * Order of the returned array is deterministic: self spokes first (descending
 * similarity, then id), then the strongest match↔match links. Determinism
 * matters because the React tree is keyed by position in this array.
 */
export function selectRenderEdges(
  edges: readonly ConstellationEdge[],
  selfId: string,
  maxEdges: number = MAX_RENDERED_EDGES,
): ConstellationEdge[] {
  if (edges.length <= maxEdges) return edges.slice();
  const spokes: ConstellationEdge[] = [];
  const pairs: ConstellationEdge[] = [];
  for (const edge of edges) {
    if (edge.source === selfId || edge.target === selfId) spokes.push(edge);
    else pairs.push(edge);
  }
  const byStrength = (a: ConstellationEdge, b: ConstellationEdge): number =>
    b.similarity - a.similarity ||
    (a.source === b.source
      ? a.target < b.target
        ? -1
        : a.target > b.target
          ? 1
          : 0
      : a.source < b.source
        ? -1
        : 1);
  spokes.sort(byStrength);
  pairs.sort(byStrength);
  return [...spokes, ...pairs].slice(0, Math.max(0, maxEdges));
}

// ─── Coordinate helpers ──────────────────────────────────────────────────────

/**
 * Converts a pointer position (client px) into viewBox user units.
 *
 * The canvas always sets `viewBox="0 0 width height"` from the SAME measured
 * box it is laid out in, so the aspect ratios match and the default
 * `preserveAspectRatio` introduces no letterboxing — a plain scale is exact.
 */
export function clientToViewBox(
  rect: { left: number; top: number; width: number; height: number },
  viewBoxWidth: number,
  viewBoxHeight: number,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const scaleX = rect.width > 0 ? viewBoxWidth / rect.width : 1;
  const scaleY = rect.height > 0 ? viewBoxHeight / rect.height : 1;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

/** Euclidean distance, inlined because it runs once per edge per frame. */
export function distance(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

// ─── Data-key helpers ────────────────────────────────────────────────────────

/**
 * A cheap structural fingerprint of the input data. The expensive rebuild
 * (graph + 2000-tick precompute) is keyed on THIS string rather than on object
 * identity, so Phase C can pass freshly-mapped arrays on every render without
 * re-running the layout.
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
