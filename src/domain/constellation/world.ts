/**
 * The live constellation: bodies with position and velocity in world px and
 * px/s, springs (links) and the bond state used by the join choreography.
 *
 * A `World` is a plain mutable record owned by one caller. The functions in
 * this module and in `step.ts` mutate the world they receive, but they never
 * read clocks, randomness or the DOM, so the same calls always produce the
 * same trajectory.
 */

import type { PhysicsConfig } from "@/config";

import { driftSeedFor, type DriftSeed } from "./noise";
import { affinityAboveThreshold, getTrackCeiling } from "./scene";
import { createPairGrid, type PairGrid } from "./spatial-hash";
import type { BodyKind, LinkKind, MatchTrack, Scene, Vec2 } from "./types";

export interface Body {
  id: string;
  kind: BodyKind;
  /** Left the active track: no links, no collisions, fading out. */
  leaving: boolean;
  radius: number;
  displayRadius: number;
  similarity: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Position at the previous fixed step (render interpolation). */
  px: number;
  py: number;
  /** Equilibrium position chosen by the scene. */
  hx: number;
  hy: number;
  ax: number;
  ay: number;
  alpha: number;
  alphaTarget: number;
  drift: DriftSeed;
}

export interface Link {
  key: string;
  a: number;
  b: number;
  kind: LinkKind;
  similarity: number;
  rest: number;
  stiffness: number;
  damping: number;
}

/** Hysteresis state of one link; `since` is the time of the last change. */
export interface Bond {
  joined: boolean;
  since: number;
}

export interface Group {
  ids: readonly string[];
  members: number[];
  score: number;
}

export interface Anchor {
  index: number;
  x: number;
  y: number;
}

export interface World {
  selfId: string;
  track: MatchTrack;
  threshold: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
  bodies: Body[];
  index: Map<string, number>;
  links: Link[];
  groups: Group[];
  bonds: Map<string, Bond>;
  /** Seconds since the world was created (simulated while awake). */
  time: number;
  accumulator: number;
  steps: number;
  /** Seconds the sky has stayed below the sleep threshold. */
  quiet: number;
  asleep: boolean;
  wokeAt: number;
  sleptAt: number | null;
  anchor: Anchor | null;
  kinetic: number;
  /** Smoothed RMS displacement per step of real stars (px). */
  jitter: number;
  /** Reusable broad-phase scratch space. */
  grid: PairGrid;
}

/** Point where the ray from the centre at `angle` meets the padded viewport. */
export function edgePoint(
  cx: number,
  cy: number,
  angle: number,
  width: number,
  height: number,
  padding: number,
): Vec2 {
  const hw = Math.max(0, width / 2 - padding);
  const hh = Math.max(0, height / 2 - padding);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const tx = Math.abs(c) > 1e-9 ? hw / Math.abs(c) : Infinity;
  const ty = Math.abs(s) > 1e-9 ? hh / Math.abs(s) : Infinity;
  const t = Math.min(tx, ty);
  return { x: cx + c * t, y: cy + s * t };
}

function linkFromScene(
  link: Scene["links"][number],
  index: ReadonlyMap<string, number>,
  threshold: number,
  ceiling: number,
  cfg: PhysicsConfig,
): Link | null {
  const a = index.get(link.a);
  const b = index.get(link.b);
  if (a === undefined || b === undefined) return null;
  const t = affinityAboveThreshold(link.similarity, threshold, ceiling) ?? 0;
  const stiffness = cfg.edges.stiffnessMin + t * (cfg.edges.stiffnessMax - cfg.edges.stiffnessMin);
  // Spokes pull one free mass against the pinned observer (μ = 1); pairs act
  // on the relative coordinate of two unit masses (μ = ½).
  const reducedMass = link.kind === "spoke" ? 1 : 0.5;
  const damping = 2 * cfg.edges.dampingRatio * Math.sqrt(stiffness * reducedMass);
  return { key: link.key, a, b, kind: link.kind, similarity: link.similarity, rest: link.rest, stiffness, damping };
}

function bodyFromScene(body: Scene["bodies"][number], x: number, y: number, alpha: number): Body {
  return {
    id: body.id,
    kind: body.kind,
    leaving: false,
    radius: body.radius,
    displayRadius: body.displayRadius,
    similarity: body.similarity,
    x,
    y,
    vx: 0,
    vy: 0,
    px: x,
    py: y,
    hx: body.homeX,
    hy: body.homeY,
    ax: 0,
    ay: 0,
    alpha,
    alphaTarget: 1,
    drift: driftSeedFor(body.id),
  };
}

function reindex(world: World): void {
  world.index = new Map(world.bodies.map((b, i) => [b.id, i]));
}

export type Entrance = "settled" | "from-edge";

/**
 * Creates a world for `scene`. `settled` places every star on its home;
 * `from-edge` makes real matches fly in from the rim along their own ray, so
 * entering paths never cross.
 */
export function createWorld(scene: Scene, cfg: PhysicsConfig, entrance: Entrance): World {
  const cx = scene.width / 2;
  const cy = scene.height / 2;
  const seenIds = new Set<string>();
  const uniqueSceneBodies = scene.bodies.filter((body) => {
    if (seenIds.has(body.id)) return false;
    seenIds.add(body.id);
    return true;
  });
  const bodies = uniqueSceneBodies.map((body) => {
    if (entrance === "settled" || body.kind === "self") return bodyFromScene(body, body.homeX, body.homeY, 1);
    const angle = Math.atan2(body.homeY - cy, body.homeX - cx);
    const start =
      body.kind === "ghost"
        ? { x: body.homeX, y: body.homeY }
        : edgePoint(cx, cy, angle, scene.width, scene.height, cfg.bounds.padding);
    return bodyFromScene(body, start.x, start.y, 0);
  });
  const world: World = {
    selfId: scene.selfId,
    track: scene.track,
    threshold: scene.threshold,
    width: scene.width,
    height: scene.height,
    cx,
    cy,
    bodies,
    index: new Map(),
    links: [],
    groups: [],
    bonds: new Map(),
    time: 0,
    accumulator: 0,
    steps: 0,
    quiet: 0,
    asleep: false,
    wokeAt: 0,
    sleptAt: null,
    anchor: null,
    kinetic: 0,
    jitter: 0,
    grid: createPairGrid(Math.max(32, bodies.length)),
  };
  reindex(world);
  attachScene(world, scene, cfg);
  if (entrance === "settled") {
    for (const link of world.links) world.bonds.set(link.key, { joined: true, since: -Infinity });
  }
  return world;
}

function attachScene(world: World, scene: Scene, cfg: PhysicsConfig): void {
  world.links = scene.links.flatMap((link) => {
    const built = linkFromScene(link, world.index, scene.threshold, getTrackCeiling(scene.track), cfg);
    return built ? [built] : [];
  });
  world.groups = scene.groups.map((group) => ({
    ids: group.ids,
    members: group.ids.flatMap((id) => {
      const i = world.index.get(id);
      return i === undefined ? [] : [i];
    }),
    score: group.score,
  }));
}

/** Clears sleep so the integrator runs again from the current state. */
export function wake(world: World): void {
  if (!world.asleep && world.quiet === 0) return;
  world.asleep = false;
  world.quiet = 0;
  world.accumulator = 0;
  world.wokeAt = world.time;
  world.sleptAt = null;
}

/**
 * Re-targets a live world to a new scene (track switch, new data). Stars that
 * stay keep position and velocity and walk to their new homes; newcomers fly
 * in from the rim; stars that left drift out to the rim and fade.
 */
export function transitionWorld(previous: World, scene: Scene, cfg: PhysicsConfig): World {
  const next = createWorld(scene, cfg, "from-edge");
  for (const body of next.bodies) {
    const i = previous.index.get(body.id);
    const old = i === undefined ? undefined : previous.bodies[i];
    if (!old || old.kind !== body.kind) continue;
    body.x = old.x;
    body.y = old.y;
    body.px = old.x;
    body.py = old.y;
    body.vx = old.vx;
    body.vy = old.vy;
    body.alpha = old.alpha;
  }
  const seen = new Set(next.bodies.map((b) => b.id));
  for (const old of previous.bodies) {
    if (old.kind !== "match" || seen.has(old.id) || (old.leaving && old.alpha <= 0)) continue;
    seen.add(old.id);
    const angle = Math.atan2(old.y - next.cy, old.x - next.cx);
    const rim = edgePoint(next.cx, next.cy, angle, next.width, next.height, cfg.bounds.padding);
    next.bodies.push({ ...old, leaving: true, hx: rim.x, hy: rim.y, alphaTarget: 0, ax: 0, ay: 0 });
  }
  reindex(next);
  for (const link of next.links) {
    const bond = previous.bonds.get(link.key);
    if (bond) next.bonds.set(link.key, { ...bond });
  }
  next.time = previous.time;
  next.wokeAt = previous.time;
  next.grid = previous.grid;
  return next;
}

/** Removes fully faded leavers (always stored after the active bodies). */
export function pruneLeaving(world: World): void {
  if (!world.bodies.some((b) => b.leaving && b.alpha <= 0)) return;
  world.bodies = world.bodies.filter((b) => !(b.leaving && b.alpha <= 0));
  reindex(world);
}

/** Starts dragging a star; the observer and leavers cannot be grabbed. */
export function grab(world: World, id: string, x: number, y: number): boolean {
  const index = world.index.get(id);
  const body = index === undefined ? undefined : world.bodies[index];
  if (index === undefined || !body || body.kind !== "match" || body.leaving) return false;
  world.anchor = { index, x, y };
  wake(world);
  return true;
}

export function moveAnchor(world: World, x: number, y: number): void {
  if (!world.anchor) return;
  world.anchor.x = x;
  world.anchor.y = y;
  wake(world);
}

/**
 * Moves a star straight to `(x, y)` with no velocity. Only for the static
 * (reduced-motion) sky, where there is no integrator to follow the anchor;
 * contacts are resolved by the caller's next `settle`.
 */
export function placeAt(world: World, id: string, x: number, y: number): void {
  const index = world.index.get(id);
  const body = index === undefined ? undefined : world.bodies[index];
  if (!body || body.kind !== "match") return;
  body.x = x;
  body.y = y;
  body.px = x;
  body.py = y;
  body.vx = 0;
  body.vy = 0;
}

/** Lets go of the dragged star with the estimated throw velocity. */
export function release(world: World, velocity: Vec2): void {
  const anchor = world.anchor;
  world.anchor = null;
  if (!anchor) return;
  const body = world.bodies[anchor.index];
  if (body) {
    body.vx = velocity.x;
    body.vy = velocity.y;
  }
  wake(world);
}

/** Deterministic impulse on every real star (dev "drag agresivo"). */
export function kick(world: World, speed: number, seed: (i: number) => number): void {
  world.bodies.forEach((body, i) => {
    if (body.kind !== "match" || body.leaving) return;
    const angle = seed(i) * Math.PI * 2;
    body.vx += Math.cos(angle) * speed;
    body.vy += Math.sin(angle) * speed;
  });
  wake(world);
}
