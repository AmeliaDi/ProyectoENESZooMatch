/**
 * Constellation Layout Engine — Pure deterministic physics for node visualization.
 * No side effects, no DOM, no React. All functions are pure and testable.
 *
 * Design notes:
 * - Initial positions are seeded from node-id hashes (mulberry32), so the same
 *   inputs always produce the same layout (no Math.random, no clocks).
 * - `stepSimulation` never mutates its input; it returns a fresh state object.
 * - Similarity thresholds are READ from `data/matching-config-v2.json` via
 *   `getTrackThreshold` — they are never hardcoded.
 * - The floating drift is a positional sinusoidal offset applied only AFTER the
 *   system settles (velocity equilibrium). Kinetic energy is computed from
 *   spring/collision velocities alone, so the ambient float can never prevent
 *   convergence nor flip `isEquilibrium` back to false.
 * - Similarity between two match nodes (neither of which is self) is estimated
 *   deterministically as `simA * simB` (product of their cosines with self —
 *   an upper bound on their mutual cosine), which is enough to form edges and
 *   detect clusters without needing the raw vectors.
 */

import rawConfig from "../../data/matching-config-v2.json";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Local re-declaration (structurally identical to the microtest-v2 type) to
 *  keep this module dependency-free and avoid circular imports. */
export type MatchTrack = "romance" | "amistad";

export interface ConstellationNode {
  id: string; // unique identifier (user id or synthetic)
  x: number; // current position
  y: number; // current position
  vx: number; // velocity x
  vy: number; // velocity y
  radius: number; // collision/display radius (pixels)
  isSelf: boolean; // true for the current user's node
  animal: string; // animal diminutive for display
  color: string; // color hex for display
  alias: string; // display name
  similarity: number; // 0-1 similarity to self node
  track: MatchTrack; // which track this match belongs to
  isGhost: boolean; // decorative node with no real data
}

export interface ConstellationEdge {
  source: string; // node id
  target: string; // node id
  similarity: number; // edge weight (0-1)
  targetDistance: number; // desired spring distance
}

export interface ConstellationGraph {
  nodes: ConstellationNode[];
  edges: ConstellationEdge[];
  clusters: ConstellationCluster[];
}

export interface ConstellationCluster {
  nodeIds: string[];
  centroidX: number;
  centroidY: number;
  avgSimilarity: number;
}

export interface SimulationParams {
  springStiffness: number; // spring force constant (default 0.005)
  springDamping: number; // velocity damping per step (default 0.92)
  repulsionStrength: number; // collision repulsion force (default 0.8)
  centerGravity: number; // pull toward center (default 0.0002)
  driftStrength: number; // floating noise amplitude (default 0.15)
  maxVelocity: number; // velocity cap (default 2.0)
  equilibriumThreshold: number; // total kinetic energy below which = settled (default 0.01)
  boundsPadding: number; // pixels from edge (default 40)
}

export interface SimulationState {
  nodes: ConstellationNode[];
  edges: ConstellationEdge[];
  width: number; // viewport width
  height: number; // viewport height
  tick: number; // frame counter
  isEquilibrium: boolean; // true when settled
  totalKineticEnergy: number;
  /** Consecutive ticks with KE below threshold (needed for the 10-tick rule). */
  settledTicks: number;
}

export interface DistanceConfig {
  minDist: number; // minimum distance for highest similarity (default 80)
  maxDist: number; // maximum distance for threshold similarity (default 300)
}

/** Shape of the data `buildGraph` / `switchTrack` accept for the current user. */
export interface SelfIdentity {
  id: string;
  animal: string;
  color: string;
  alias: string;
}

/** Shape of a match result consumed by the layout engine. */
export interface MatchInput {
  id: string;
  animal: string;
  color: string;
  alias: string;
  similarity: number;
  track: MatchTrack;
}

// ─── Default params ───────────────────────────────────────────────────────────

export const DEFAULT_SIMULATION_PARAMS: SimulationParams = {
  springStiffness: 0.005,
  springDamping: 0.92,
  repulsionStrength: 0.8,
  centerGravity: 0.0002,
  driftStrength: 0.15,
  maxVelocity: 2.0,
  equilibriumThreshold: 0.01,
  boundsPadding: 40,
};

export const DEFAULT_DISTANCE_CONFIG: DistanceConfig = {
  minDist: 80,
  maxDist: 300,
};

/** Consecutive low-energy ticks required before declaring equilibrium. */
const EQUILIBRIUM_TICKS = 10;

/** Default number of ticks `precomputeLayout` runs. Chosen high enough that a
 *  typical constellation (weak springs settling against center gravity) fully
 *  reaches equilibrium — empirically ~1750 ticks, so 2000 gives headroom. */
const DEFAULT_PRECOMPUTE_TICKS = 2000;

/** Radius constants: self is fixed, matches scale with similarity. */
const SELF_RADIUS = 24;
const BASE_RADIUS = 12;
const RADIUS_SCALE = 8;
const GHOST_RADIUS = 6;

/** Decorative ghost nodes: default 8, never more than 12. */
const DEFAULT_GHOST_COUNT = 8;
const MAX_GHOST_COUNT = 12;

/**
 * Hard cap for real match nodes. The physics pass is O(n²) × 2000 ticks and
 * cluster detection is brute-force, so a pathological pool must not block the
 * main thread. 24 is just above the observed maximum (~21); the list view still
 * exposes every match, this cap only bounds the constellation canvas.
 */
export const MAX_REAL_MATCHES = 24;

// ─── Threshold helper (reads data/matching-config-v2.json) ───────────────────

/**
 * Returns the active exclusive similarity threshold for a track, read from
 * `data/matching-config-v2.json`. NEVER hardcode thresholds elsewhere.
 */
export function getTrackThreshold(track: MatchTrack): number {
  return rawConfig.tracks[track].minimum_similarity_exclusive;
}

// ─── Core Functions ───────────────────────────────────────────────────────────

/**
 * Maps similarity (0-1) to a target distance between nodes.
 * Monotonically DECREASING: higher similarity → shorter distance.
 * Returns null if similarity <= threshold (STRICTLY greater required).
 *
 * Formula: linear interpolation from maxDist (at threshold) to minDist (at 1.0)
 *   distance = maxDist - (sim - threshold) / (1 - threshold) * (maxDist - minDist)
 */
export function similarityToDistance(
  similarity: number,
  threshold: number,
  config?: Partial<DistanceConfig>,
): number | null {
  if (!(similarity > threshold)) return null;
  const { minDist, maxDist } = { ...DEFAULT_DISTANCE_CONFIG, ...config };
  const span = maxDist - minDist;
  const denom = 1 - threshold;
  if (denom <= 0) return minDist; // degenerate threshold=1 → everything is null anyway
  const t = Math.min(1, (similarity - threshold) / denom);
  return maxDist - t * span;
}

/**
 * Deterministic FNV-1a hash from string → unsigned 32-bit int.
 * Used for seeded initial positions and drift phases.
 */
export function hashSeed(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Seeded pseudo-random number generator (mulberry32).
 * Returns a function that produces deterministic floats in [0, 1).
 */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function clampToBounds(
  value: number,
  dimension: number,
  padding: number,
): { clamped: boolean; value: number } {
  // Degrade gracefully when the viewport is smaller than 2 * padding.
  const lo = Math.min(padding, dimension / 2);
  const hi = Math.max(dimension - padding, dimension / 2);
  if (value < lo) return { clamped: true, value: lo };
  if (value > hi) return { clamped: true, value: hi };
  return { clamped: false, value };
}

function makeEdge(
  source: ConstellationNode,
  target: ConstellationNode,
  similarity: number,
  threshold: number,
  distanceConfig?: Partial<DistanceConfig>,
): ConstellationEdge | null {
  const targetDistance = similarityToDistance(similarity, threshold, distanceConfig);
  if (targetDistance === null) return null;
  return { source: source.id, target: target.id, similarity, targetDistance };
}

/**
 * Deterministic pairwise similarity estimate between two matches (neither is
 * self): the product of their cosines with self, an upper bound on their
 * mutual cosine. Documented approximation — keeps the engine pure (no raw
 * vectors needed) while allowing triangles/clusters to form.
 */
function estimatePairSimilarity(simA: number, simB: number): number {
  return simA * simB;
}

function buildEdges(
  self: ConstellationNode,
  matchNodes: ConstellationNode[],
  threshold: number,
  distanceConfig?: Partial<DistanceConfig>,
): ConstellationEdge[] {
  const edges: ConstellationEdge[] = [];
  for (const match of matchNodes) {
    const selfEdge = makeEdge(self, match, match.similarity, threshold, distanceConfig);
    if (selfEdge) edges.push(selfEdge);
  }
  for (let i = 0; i < matchNodes.length; i++) {
    for (let j = i + 1; j < matchNodes.length; j++) {
      const a = matchNodes[i];
      const b = matchNodes[j];
      const pairSim = estimatePairSimilarity(a.similarity, b.similarity);
      const edge = makeEdge(a, b, pairSim, threshold, distanceConfig);
      if (edge) edges.push(edge);
    }
  }
  return edges;
}

// ─── Graph construction ───────────────────────────────────────────────────────

/**
 * Generates ghost nodes: decorative, low-opacity nodes with no real match data.
 * Positioned (seeded) around the periphery of the viewport. They participate
 * only in drift and bounds — NOT in spring forces, collision or center gravity
 * (they have no edges and no physics interactions), so they float freely and
 * never disturb the equilibrium of the real constellation.
 */
export function generateGhostNodes(
  count: number,
  width: number,
  height: number,
  seed: string,
): ConstellationNode[] {
  const safeCount = Math.max(0, Math.min(MAX_GHOST_COUNT, Math.floor(count)));
  const rand = seededRandom(hashSeed(`ghost::${seed}`));
  const ghosts: ConstellationNode[] = [];
  const cx = width / 2;
  const cy = height / 2;
  const minDim = Math.min(width, height);
  for (let i = 0; i < safeCount; i++) {
    const id = `ghost-${seed}-${i}`;
    // Periphery band: 46%–58% of the half-min-dimension from center.
    const angle = (i / Math.max(1, safeCount)) * Math.PI * 2 + rand() * 0.8;
    const orbit = minDim * (0.46 + rand() * 0.12);
    const gx = clampToBounds(
      cx + Math.cos(angle) * orbit,
      width,
      DEFAULT_SIMULATION_PARAMS.boundsPadding,
    ).value;
    const gy = clampToBounds(
      cy + Math.sin(angle) * orbit,
      height,
      DEFAULT_SIMULATION_PARAMS.boundsPadding,
    ).value;
    ghosts.push({
      id,
      x: gx,
      y: gy,
      vx: 0,
      vy: 0,
      radius: GHOST_RADIUS,
      isSelf: false,
      animal: "estrella",
      color: "#c9d4ff",
      alias: "",
      similarity: 0,
      track: "amistad",
      isGhost: true,
    });
  }
  return ghosts;
}

/**
 * Builds the constellation graph from the user's match data.
 *
 * - Self node starts at the exact viewport center with radius 24.
 * - Matches (filtered by active track) are seeded on an orbit around center
 *   using a per-node mulberry32 PRNG derived from their id hash.
 * - Match radius scales with similarity: BASE_RADIUS + similarity * RADIUS_SCALE.
 * - Edges only for pairs with similarity STRICTLY greater than the threshold
 *   (self↔match uses the real similarity; match↔match uses the deterministic
 *   product estimate). Ghost nodes never have edges.
 */
export function buildGraph(
  me: SelfIdentity,
  matches: MatchInput[],
  track: MatchTrack,
  threshold: number,
  viewportWidth: number,
  viewportHeight: number,
  ghostCount: number = DEFAULT_GHOST_COUNT,
): ConstellationGraph {
  const cx = viewportWidth / 2;
  const cy = viewportHeight / 2;
  const minDim = Math.min(viewportWidth, viewportHeight);

  // Filter to the active track AND to real matches (similarity strictly above
  // the threshold), dedupe by id, deterministic order. Below-threshold pairs
  // are not matches, so they get no node — this also guarantees every real
  // node is spring-anchored to self and the layout always converges.
  const seen = new Set<string>();
  const filteredMatches = matches.filter(
    (m) => m.track === track && m.similarity > threshold && !seen.has(m.id) && seen.add(m.id),
  );
  const activeMatches =
    filteredMatches.length > MAX_REAL_MATCHES
      ? [...filteredMatches]
          .sort((a, b) => b.similarity - a.similarity || a.id.localeCompare(b.id))
          .slice(0, MAX_REAL_MATCHES)
      : filteredMatches;

  const selfNode: ConstellationNode = {
    id: me.id,
    x: cx,
    y: cy,
    vx: 0,
    vy: 0,
    radius: SELF_RADIUS,
    isSelf: true,
    animal: me.animal,
    color: me.color,
    alias: me.alias,
    similarity: 1,
    track,
    isGhost: false,
  };

  const matchNodes: ConstellationNode[] = activeMatches.map((m) => {
    const rand = seededRandom(hashSeed(m.id));
    const angle = rand() * Math.PI * 2;
    const orbit = minDim * (0.22 + rand() * 0.2);
    const x = clampToBounds(cx + Math.cos(angle) * orbit, viewportWidth, DEFAULT_SIMULATION_PARAMS.boundsPadding).value;
    const y = clampToBounds(cy + Math.sin(angle) * orbit, viewportHeight, DEFAULT_SIMULATION_PARAMS.boundsPadding).value;
    return {
      id: m.id,
      x,
      y,
      vx: 0,
      vy: 0,
      radius: BASE_RADIUS + m.similarity * RADIUS_SCALE,
      isSelf: false,
      animal: m.animal,
      color: m.color,
      alias: m.alias,
      similarity: m.similarity,
      track: m.track,
      isGhost: false,
    };
  });

  const ghosts = generateGhostNodes(ghostCount, viewportWidth, viewportHeight, `${me.id}::${track}`);
  const edges = buildEdges(selfNode, matchNodes, threshold);

  const nodes = [selfNode, ...matchNodes, ...ghosts];
  const graph: ConstellationGraph = { nodes, edges, clusters: [] };
  graph.clusters = detectClusters(graph);
  return graph;
}

// ─── Cluster detection ────────────────────────────────────────────────────────

/**
 * Detects clusters: maximal groups of 3+ nodes that are ALL mutually connected
 * (complete subgraph / clique detection). For ≤50 nodes this brute-forces all
 * triangles from sorted node ids and expands each greedily into a maximal
 * clique (deterministic candidate order: descending internal similarity, then id).
 */
export function detectClusters(graph: ConstellationGraph): ConstellationCluster[] {
  const { nodes, edges } = graph;
  if (nodes.length < 3 || edges.length === 0) return [];
  // Brute-force triangle enumeration is O(n³). buildGraph already caps real
  // matches; this guard protects direct callers from pathological graphs.
  if (nodes.length > 80) return [];

  const nodeById = new Map<string, ConstellationNode>();
  for (const n of nodes) nodeById.set(n.id, n);

  // Undirected adjacency with edge weights (ignore edges to unknown nodes).
  const adjacency = new Map<string, Map<string, number>>();
  for (const n of nodes) adjacency.set(n.id, new Map());
  for (const e of edges) {
    if (!adjacency.has(e.source) || !adjacency.has(e.target)) continue;
    adjacency.get(e.source)!.set(e.target, e.similarity);
    adjacency.get(e.target)!.set(e.source, e.similarity);
  }

  const ids = nodes.map((n) => n.id).sort();
  const edgeWeight = (a: string, b: string): number => adjacency.get(a)?.get(b) ?? 0;

  const expandToClique = (seedTriangle: string[]): string[] => {
    let clique = [...seedTriangle].sort();
    let grew = true;
    while (grew) {
      grew = false;
      const candidates = ids
        .filter((id) => !clique.includes(id))
        .map((id) => ({
          id,
          avgSim: clique.reduce((sum, m) => sum + edgeWeight(id, m), 0) / clique.length,
        }))
        .filter((c) => clique.every((m) => edgeWeight(c.id, m) > 0))
        .sort((a, b) => b.avgSim - a.avgSim || (a.id < b.id ? -1 : 1));
      if (candidates.length > 0) {
        clique = [...clique, candidates[0].id].sort();
        grew = true;
      }
    }
    return clique;
  };

  const seenSignatures = new Set<string>();
  const cliques: string[][] = [];

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      if (edgeWeight(ids[i], ids[j]) <= 0) continue;
      for (let k = j + 1; k < ids.length; k++) {
        if (edgeWeight(ids[i], ids[k]) <= 0 || edgeWeight(ids[j], ids[k]) <= 0) continue;
        const clique = expandToClique([ids[i], ids[j], ids[k]]);
        const signature = clique.join("|");
        if (seenSignatures.has(signature)) continue;
        seenSignatures.add(signature);
        cliques.push(clique);
      }
    }
  }

  const clusters = cliques.map((nodeIds) => {
    const members = nodeIds.map((id) => nodeById.get(id)!);
    const centroidX = members.reduce((s, n) => s + n.x, 0) / members.length;
    const centroidY = members.reduce((s, n) => s + n.y, 0) / members.length;
    let simSum = 0;
    let simCount = 0;
    for (let a = 0; a < nodeIds.length; a++) {
      for (let b = a + 1; b < nodeIds.length; b++) {
        simSum += edgeWeight(nodeIds[a], nodeIds[b]);
        simCount++;
      }
    }
    return {
      nodeIds,
      centroidX,
      centroidY,
      avgSimilarity: simCount > 0 ? simSum / simCount : 0,
    };
  });

  // Deterministic order: largest first, then lexicographic signature.
  clusters.sort(
    (a, b) => b.nodeIds.length - a.nodeIds.length || (a.nodeIds.join("|") < b.nodeIds.join("|") ? -1 : 1),
  );
  return clusters;
}

// ─── Simulation ───────────────────────────────────────────────────────────────

/** Creates initial simulation state from a graph (deep-copies nodes/edges). */
export function createSimulationState(
  graph: ConstellationGraph,
  width: number,
  height: number,
): SimulationState {
  return {
    nodes: graph.nodes.map((n) => ({ ...n })),
    edges: graph.edges.map((e) => ({ ...e })),
    width,
    height,
    tick: 0,
    isEquilibrium: false,
    totalKineticEnergy: 0,
    settledTicks: 0,
  };
}

/**
 * Advances the simulation by one step (dt in arbitrary units, typically 1).
 *
 * Physics applied in order:
 * 1. SPRING FORCE: for each edge, pull nodes toward targetDistance
 *      F = springStiffness * (currentDist - targetDist) * direction
 *    (ghost nodes are never endpoints of edges, so they get no spring force)
 * 2. COLLISION REPULSION: for any two real nodes closer than the sum of radii
 *      F = repulsionStrength * overlap * direction (push apart)
 *    (ghost nodes are excluded — they take part in drift + bounds only)
 * 3. CENTER GRAVITY: gentle pull toward viewport center (real nodes only)
 *      F = centerGravity * distance_from_center * direction
 * 4. DAMPING: multiply velocities by springDamping
 * 5. VELOCITY CAP: clamp velocity magnitude to maxVelocity
 * 6. UPDATE POSITIONS: x += vx * dt, y += vy * dt
 * 7. BOUNDS: clamp positions to [padding, dimension - padding]; if clamped,
 *    zero the velocity component in that direction
 * 8. EQUILIBRIUM: total kinetic energy = Σ(vx² + vy²); when below
 *    equilibriumThreshold for EQUILIBRIUM_TICKS (10) consecutive ticks →
 *    isEquilibrium = true (latched; drift is then layered on top as a
 *    positional-only offset so equilibrium is preserved)
 * 9. FLOATING DRIFT (only while isEquilibrium): deterministic sinusoidal noise
 *      dx = driftStrength * sin(tick * 0.01 + seed) * cos(tick * 0.007 + seed * 2)
 *      dy = driftStrength * cos(tick * 0.013 + seed) * sin(tick * 0.009 + seed * 3)
 *    with seed = (hashSeed(id) % 1000) / 1000 * 2π. Drift never touches
 *    velocity, so it cannot re-energize the system.
 *
 * Returns a NEW state object (immutable — does not mutate input).
 */
export function stepSimulation(
  state: SimulationState,
  dt: number,
  params?: Partial<SimulationParams>,
): SimulationState {
  const p = { ...DEFAULT_SIMULATION_PARAMS, ...params };
  const nodes = state.nodes.map((n) => ({ ...n }));
  const indexById = new Map<string, number>();
  nodes.forEach((n, i) => indexById.set(n.id, i));

  // 1. Spring forces along edges.
  for (const edge of state.edges) {
    const si = indexById.get(edge.source);
    const ti = indexById.get(edge.target);
    if (si === undefined || ti === undefined) continue;
    const a = nodes[si];
    const b = nodes[ti];
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    let dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) {
      // Degenerate: nudge along a deterministic direction derived from ids.
      const angle = ((hashSeed(a.id) ^ hashSeed(b.id)) % 360) * (Math.PI / 180);
      dx = Math.cos(angle);
      dy = Math.sin(angle);
      dist = 1e-6;
    }
    const ux = dx / dist;
    const uy = dy / dist;
    const force = p.springStiffness * (dist - edge.targetDistance) * dt;
    a.vx += ux * force;
    a.vy += uy * force;
    b.vx -= ux * force;
    b.vy -= uy * force;
  }

  // 2. Collision repulsion between all pairs of real nodes.
  //    Ghost nodes are decorative: per spec they take part in drift + bounds
  //    only, so they are excluded from collision (and from gravity below).
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    if (a.isGhost) continue;
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      if (b.isGhost) continue;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      const minDist = a.radius + b.radius;
      if (dist >= minDist) continue;
      if (dist === 0) {
        const angle = ((hashSeed(a.id) ^ hashSeed(b.id)) % 360) * (Math.PI / 180);
        dx = Math.cos(angle);
        dy = Math.sin(angle);
        dist = 1e-6;
      }
      const ux = dx / dist;
      const uy = dy / dist;
      const overlap = minDist - dist;
      const force = p.repulsionStrength * overlap * dt;
      a.vx -= ux * force;
      a.vy -= uy * force;
      b.vx += ux * force;
      b.vy += uy * force;
    }
  }

  // 3. Center gravity.
  const cx = state.width / 2;
  const cy = state.height / 2;
  for (const n of nodes) {
    if (n.isGhost) continue; // ghosts float freely — no center gravity
    const dx = cx - n.x;
    const dy = cy - n.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) continue;
    const force = p.centerGravity * dist * dt;
    n.vx += (dx / dist) * force;
    n.vy += (dy / dist) * force;
  }

  // 4. Damping + 5. velocity cap.
  for (const n of nodes) {
    n.vx *= p.springDamping;
    n.vy *= p.springDamping;
    const speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
    if (speed > p.maxVelocity) {
      const scale = p.maxVelocity / speed;
      n.vx *= scale;
      n.vy *= scale;
    }
  }

  // 6. Integrate positions + 7. bounds.
  for (const n of nodes) {
    n.x += n.vx * dt;
    n.y += n.vy * dt;
    const bx = clampToBounds(n.x, state.width, p.boundsPadding);
    if (bx.clamped) n.vx = 0;
    n.x = bx.value;
    const by = clampToBounds(n.y, state.height, p.boundsPadding);
    if (by.clamped) n.vy = 0;
    n.y = by.value;
  }

  // 8. Kinetic energy + equilibrium (latched after EQUILIBRIUM_TICKS).
  let totalKineticEnergy = 0;
  for (const n of nodes) totalKineticEnergy += n.vx * n.vx + n.vy * n.vy;

  const settledTicks =
    totalKineticEnergy < p.equilibriumThreshold ? state.settledTicks + 1 : 0;
  const isEquilibrium = state.isEquilibrium || settledTicks >= EQUILIBRIUM_TICKS;

  // 9. Floating drift: positional-only ambient motion once settled.
  if (isEquilibrium && p.driftStrength > 0) {
    const tick = state.tick + 1;
    for (const n of nodes) {
      const seed = ((hashSeed(n.id) % 1000) / 1000) * Math.PI * 2;
      const dx = p.driftStrength * Math.sin(tick * 0.01 + seed) * Math.cos(tick * 0.007 + seed * 2) * dt;
      const dy = p.driftStrength * Math.cos(tick * 0.013 + seed) * Math.sin(tick * 0.009 + seed * 3) * dt;
      n.x = clampToBounds(n.x + dx, state.width, p.boundsPadding).value;
      n.y = clampToBounds(n.y + dy, state.height, p.boundsPadding).value;
    }
  }

  return {
    nodes,
    edges: state.edges.map((e) => ({ ...e })),
    width: state.width,
    height: state.height,
    tick: state.tick + 1,
    isEquilibrium,
    totalKineticEnergy,
    settledTicks,
  };
}

/**
 * Applies a drag: sets a specific node's position directly (clamped to bounds)
 * and zeroes its velocity. Returns a NEW state with the node repositioned.
 */
export function dragNode(
  state: SimulationState,
  nodeId: string,
  newX: number,
  newY: number,
): SimulationState {
  const padding = DEFAULT_SIMULATION_PARAMS.boundsPadding;
  return {
    ...state,
    nodes: state.nodes.map((n) =>
      n.id === nodeId
        ? {
            ...n,
            x: clampToBounds(newX, state.width, padding).value,
            y: clampToBounds(newY, state.height, padding).value,
            vx: 0,
            vy: 0,
          }
        : { ...n },
    ),
    isEquilibrium: false,
    settledTicks: 0,
  };
}

/**
 * Releases a dragged node: gives it a small deterministic random velocity
 * impulse (seeded by id + tick) so it floats back naturally.
 */
export function releaseNode(state: SimulationState, nodeId: string): SimulationState {
  return {
    ...state,
    nodes: state.nodes.map((n) => {
      if (n.id !== nodeId) return { ...n };
      const rand = seededRandom(hashSeed(`${n.id}::release::${state.tick}`));
      const angle = rand() * Math.PI * 2;
      const magnitude = 0.5 + rand() * 0.5; // small impulse, well under maxVelocity
      return { ...n, vx: Math.cos(angle) * magnitude, vy: Math.sin(angle) * magnitude };
    }),
    isEquilibrium: false,
    settledTicks: 0,
  };
}

/**
 * Re-targets the simulation for a different track. Recalculates edges (and
 * node metadata) from `allMatches` filtered to the new track with the new
 * threshold, preserving current node positions for a smooth transition.
 * Nodes that no longer match keep their position but lose their edges;
 * matches absent from the state are added on the seeded orbit.
 */
export function switchTrack(
  state: SimulationState,
  allMatches: MatchInput[],
  newTrack: MatchTrack,
  newThreshold: number,
): SimulationState {
  const seen = new Set<string>();
  const active = allMatches.filter(
    (m) => m.track === newTrack && !seen.has(m.id) && seen.add(m.id),
  );

  const existingById = new Map(state.nodes.map((n) => [n.id, n]));
  const nextNodes: ConstellationNode[] = [];

  for (const n of state.nodes) {
    if (n.isSelf) {
      nextNodes.push({ ...n, track: newTrack });
      continue;
    }
    if (n.isGhost) {
      nextNodes.push({ ...n });
      continue;
    }
    const match = active.find((m) => m.id === n.id);
    if (match) {
      nextNodes.push({
        ...n,
        animal: match.animal,
        color: match.color,
        alias: match.alias,
        similarity: match.similarity,
        track: newTrack,
        radius: BASE_RADIUS + match.similarity * RADIUS_SCALE,
      });
    } else {
      // Still visible but no longer connected under the new track.
      nextNodes.push({ ...n, track: newTrack });
    }
  }

  // Add matches for the new track that are real matches (above the new
  // threshold) and not already present as nodes. Existing nodes are always
  // preserved (position continuity) even if they fall below the new threshold.
  const cx = state.width / 2;
  const cy = state.height / 2;
  const minDim = Math.min(state.width, state.height);
  for (const m of active) {
    if (existingById.has(m.id)) continue;
    if (!(m.similarity > newThreshold)) continue;
    const rand = seededRandom(hashSeed(m.id));
    const angle = rand() * Math.PI * 2;
    const orbit = minDim * (0.22 + rand() * 0.2);
    nextNodes.push({
      id: m.id,
      x: clampToBounds(cx + Math.cos(angle) * orbit, state.width, DEFAULT_SIMULATION_PARAMS.boundsPadding).value,
      y: clampToBounds(cy + Math.sin(angle) * orbit, state.height, DEFAULT_SIMULATION_PARAMS.boundsPadding).value,
      vx: 0,
      vy: 0,
      radius: BASE_RADIUS + m.similarity * RADIUS_SCALE,
      isSelf: false,
      animal: m.animal,
      color: m.color,
      alias: m.alias,
      similarity: m.similarity,
      track: newTrack,
      isGhost: false,
    });
  }

  const self = nextNodes.find((n) => n.isSelf);
  const matchNodes = nextNodes.filter((n) => !n.isSelf && !n.isGhost);
  const edges = self ? buildEdges(self, matchNodes, newThreshold) : [];

  return {
    ...state,
    nodes: nextNodes,
    edges,
    isEquilibrium: false,
    settledTicks: 0,
  };
}

/**
 * Pre-runs the simulation for N ticks (default 2000) to reach a stable layout.
 * Used for prefers-reduced-motion (no animation, just final positions).
 * Deterministic: identical to calling stepSimulation N times manually.
 */
export function precomputeLayout(
  graph: ConstellationGraph,
  width: number,
  height: number,
  ticks: number = DEFAULT_PRECOMPUTE_TICKS,
  params?: Partial<SimulationParams>,
): SimulationState {
  let state = createSimulationState(graph, width, height);
  for (let i = 0; i < ticks; i++) {
    state = stepSimulation(state, 1, params);
  }
  return state;
}
