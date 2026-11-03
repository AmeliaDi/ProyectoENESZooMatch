/**
 * Fixed-step integrator for the constellation.
 *
 * - Semi-implicit (symplectic) Euler at `integration.stepHz`: v += a·dt, then
 *   x += v·dt. Positions of the previous step are kept so the renderer can
 *   interpolate, which makes 30/60/90/120 Hz displays show the same motion.
 * - Forces (unit mass): link springs with near-critical damping, home springs
 *   (the scene's equilibrium), orbital gravity, group cohesion, a quadratic
 *   collision ramp, soft walls, air drag and the drag anchor.
 * - After integrating, a projection pass enforces ‖xᵢ − xⱼ‖ ≥ Rᵢ + Rⱼ + δ and
 *   removes the approaching normal velocity (perfectly inelastic contact), so
 *   contacts only ever dissipate energy.
 */

import type { PhysicsConfig } from "@/config";

import { pushShares } from "./scene";
import { ensureCapacity, forEachNearPair } from "./spatial-hash";
import { pruneLeaving, type Body, type World } from "./world";

const EPS = 1e-9;
/** Smoothing of the jitter metric (per step). */
const JITTER_SMOOTHING = 0.05;

function isSolid(body: Body): boolean {
  return !body.leaving;
}

/** Movement priority in a contact: higher never yields to lower. */
function priority(world: World, i: number): number {
  const body = world.bodies[i]!;
  if (body.kind === "self") return 3;
  if (world.anchor?.index === i) return 2;
  return body.kind === "match" ? 1 : 0;
}

function contactShares(world: World, i: number, j: number, amount: number): [number, number] {
  const pi = priority(world, i);
  const pj = priority(world, j);
  if (pi === pj) {
    const a = world.bodies[i]!;
    const b = world.bodies[j]!;
    return pushShares(a, b, amount);
  }
  return pi > pj ? [0, amount] : [amount, 0];
}

function maxInteraction(world: World, cfg: PhysicsConfig): number {
  let r = 0;
  for (const body of world.bodies) r = Math.max(r, body.radius);
  return 2 * r + cfg.bodies.clearance + cfg.collision.softMargin;
}

function applyLinks(world: World): void {
  const bodies = world.bodies;
  for (const link of world.links) {
    const a = bodies[link.a]!;
    const b = bodies[link.b]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy);
    if (d < EPS) continue;
    const ux = dx / d;
    const uy = dy / d;
    const closing = (b.vx - a.vx) * ux + (b.vy - a.vy) * uy;
    const f = link.stiffness * (d - link.rest) + link.damping * closing;
    a.ax += f * ux;
    a.ay += f * uy;
    b.ax -= f * ux;
    b.ay -= f * uy;
  }
}

function applyHome(world: World, cfg: PhysicsConfig): void {
  const kMatch = cfg.home.stiffness;
  const kGhost = cfg.home.ghostStiffness;
  const g = cfg.gravity.strength;
  world.bodies.forEach((body, i) => {
    if (body.kind === "self" || world.anchor?.index === i) return;
    const k = body.kind === "ghost" ? kGhost : kMatch;
    const c = 2 * cfg.home.dampingRatio * Math.sqrt(k + (body.kind === "match" ? g : 0));
    body.ax += k * (body.hx - body.x) - c * body.vx;
    body.ay += k * (body.hy - body.y) - c * body.vy;
    if (body.kind !== "match" || body.leaving || g === 0) return;
    // Orbital gravity: pulls towards the centre down to the home orbit (and
    // out to it from inside), so it adds radial firmness without moving the
    // equilibrium.
    const rx = body.x - world.cx;
    const ry = body.y - world.cy;
    const r = Math.hypot(rx, ry);
    if (r < EPS) return;
    const rHome = Math.hypot(body.hx - world.cx, body.hy - world.cy);
    const f = -g * (r - rHome);
    body.ax += (f * rx) / r;
    body.ay += (f * ry) / r;
  });
}

function applyGroups(world: World, cfg: PhysicsConfig): void {
  const s = cfg.group.strength;
  if (s === 0) return;
  for (const group of world.groups) {
    const n = group.members.length;
    if (n < 2) continue;
    let cx = 0;
    let cy = 0;
    let hx = 0;
    let hy = 0;
    for (const i of group.members) {
      const b = world.bodies[i]!;
      cx += b.x;
      cy += b.y;
      hx += b.hx;
      hy += b.hy;
    }
    cx /= n;
    cy /= n;
    hx /= n;
    hy /= n;
    for (const i of group.members) {
      if (world.anchor?.index === i) continue;
      const b = world.bodies[i]!;
      // Pull each member towards its place in the figure around the live
      // centroid: zero when the figure keeps its shape.
      b.ax += s * (cx + (b.hx - hx) - b.x);
      b.ay += s * (cy + (b.hy - hy) - b.y);
    }
  }
}

/** Copies current positions into the broad-phase grid. */
function loadGrid(world: World): number {
  const { bodies, grid } = world;
  const n = bodies.length;
  ensureCapacity(grid, n);
  for (let i = 0; i < n; i++) {
    grid.x[i] = bodies[i]!.x;
    grid.y[i] = bodies[i]!.y;
  }
  return n;
}

function applyCollisions(world: World, cfg: PhysicsConfig): number {
  const { bodies } = world;
  const n = loadGrid(world);
  const margin = cfg.collision.softMargin;
  const k = cfg.collision.stiffness;
  const damping = 2 * cfg.collision.dampingRatio * Math.sqrt(k);
  let contacts = 0;
  forEachNearPair(world.grid, n, maxInteraction(world, cfg), (i, j) => {
    const a = bodies[i]!;
    const b = bodies[j]!;
    if (!isSolid(a) || !isSolid(b)) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy);
    const reach = a.radius + b.radius + cfg.bodies.clearance + margin;
    if (d >= reach || d < EPS) return;
    contacts++;
    const ux = dx / d;
    const uy = dy / d;
    const depth = reach - d;
    const closing = (b.vx - a.vx) * ux + (b.vy - a.vy) * uy;
    const f = (k * depth * depth) / margin - (closing < 0 ? damping * closing : 0);
    const [sa, sb] = contactShares(world, i, j, 1);
    if (sa > 0) {
      a.ax -= f * ux;
      a.ay -= f * uy;
    }
    if (sb > 0) {
      b.ax += f * ux;
      b.ay += f * uy;
    }
  });
  return contacts;
}

function wallForce(position: number, velocity: number, lo: number, hi: number, k: number, c: number): number {
  if (position < lo) return k * (lo - position) - (velocity < 0 ? c * velocity : 0);
  if (position > hi) return k * (hi - position) - (velocity > 0 ? c * velocity : 0);
  return 0;
}

function softBounds(lo: number, hi: number, size: number): [number, number] {
  return lo <= hi ? [lo, hi] : [size / 2, size / 2];
}

function applyBounds(world: World, cfg: PhysicsConfig): void {
  const k = cfg.bounds.stiffness;
  const c = 2 * cfg.bounds.dampingRatio * Math.sqrt(k);
  const p = cfg.bounds.padding;
  const [x0, x1] = softBounds(p, world.width - p, world.width);
  const [y0, y1] = softBounds(p, world.height - p, world.height);
  for (const body of world.bodies) {
    if (body.kind === "self") continue;
    body.ax += wallForce(body.x, body.vx, x0, x1, k, c);
    body.ay += wallForce(body.y, body.vy, y0, y1, k, c);
  }
}

function applyAnchor(world: World, cfg: PhysicsConfig): void {
  const anchor = world.anchor;
  if (!anchor) return;
  const body = world.bodies[anchor.index];
  if (!body) return;
  const k = cfg.interaction.anchorStiffness;
  const c = 2 * cfg.interaction.anchorDampingRatio * Math.sqrt(k);
  body.ax += k * (anchor.x - body.x) - c * body.vx;
  body.ay += k * (anchor.y - body.y) - c * body.vy;
}

function hardClamp(value: number, size: number, cfg: PhysicsConfig): { value: number; hit: -1 | 0 | 1 } {
  const inset = cfg.bounds.padding - cfg.bounds.hardMargin;
  const lo = Math.min(inset, size / 2);
  const hi = Math.max(size - inset, size / 2);
  if (value < lo) return { value: lo, hit: -1 };
  if (value > hi) return { value: hi, hit: 1 };
  return { value, hit: 0 };
}

function integrate(world: World, cfg: PhysicsConfig, dt: number): void {
  const air = cfg.air.damping;
  const vmax = cfg.limits.maxSpeed;
  for (const body of world.bodies) {
    body.px = body.x;
    body.py = body.y;
    if (body.kind === "self") {
      body.vx = 0;
      body.vy = 0;
      continue;
    }
    body.vx += (body.ax - air * body.vx) * dt;
    body.vy += (body.ay - air * body.vy) * dt;
    const speed = Math.hypot(body.vx, body.vy);
    if (speed > vmax) {
      body.vx *= vmax / speed;
      body.vy *= vmax / speed;
    }
    body.x += body.vx * dt;
    body.y += body.vy * dt;
    const cx = hardClamp(body.x, world.width, cfg);
    const cy = hardClamp(body.y, world.height, cfg);
    body.x = cx.value;
    body.y = cy.value;
    if (cx.hit * body.vx > 0) body.vx = 0;
    if (cy.hit * body.vy > 0) body.vy = 0;
  }
}

/**
 * Position projection: enforces the separation theorem for every solid pair
 * and makes each corrected contact perfectly inelastic along the normal.
 */
export function projectionIterations(bodyCount: number, cfg: PhysicsConfig): number {
  const { crowdBodies, crowdIterations, projectionIterations: full } = cfg.collision;
  return bodyCount > crowdBodies ? Math.min(full, crowdIterations) : full;
}

export function projectContacts(world: World, cfg: PhysicsConfig): void {
  const { bodies } = world;
  const cell = maxInteraction(world, cfg);
  const iterations = projectionIterations(bodies.length, cfg);
  for (let iteration = 0; iteration < iterations; iteration++) {
    const n = loadGrid(world);
    let moved = false;
    forEachNearPair(world.grid, n, cell, (i, j) => {
      const a = bodies[i]!;
      const b = bodies[j]!;
      if (!isSolid(a) || !isSolid(b)) return;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let d = Math.hypot(dx, dy);
      const min = a.radius + b.radius + cfg.bodies.clearance;
      if (d >= min - EPS) return;
      if (d < EPS) {
        // Deterministic split direction: index parity.
        dx = (i + j) % 2 === 0 ? 1 : -1;
        dy = 0;
        d = 1;
      }
      const ux = dx / d;
      const uy = dy / d;
      const [sa, sb] = contactShares(world, i, j, min - d);
      const closing = (b.vx - a.vx) * ux + (b.vy - a.vy) * uy;
      if (closing < 0) {
        const total = sa + sb;
        if (total > 0) {
          a.vx += (ux * closing * sa) / total;
          a.vy += (uy * closing * sa) / total;
          b.vx -= (ux * closing * sb) / total;
          b.vy -= (uy * closing * sb) / total;
        }
      }
      if (sa > 0) {
        a.x = hardClamp(a.x - ux * sa, world.width, cfg).value;
        a.y = hardClamp(a.y - uy * sa, world.height, cfg).value;
      }
      if (sb > 0) {
        b.x = hardClamp(b.x + ux * sb, world.width, cfg).value;
        b.y = hardClamp(b.y + uy * sb, world.height, cfg).value;
      }
      // A body pinned by the wall cannot yield its share; the other one (if
      // it is allowed to move at all) absorbs what is left.
      const residual = min - Math.hypot(b.x - a.x, b.y - a.y);
      if (residual > EPS) {
        if (a.kind !== "self" && sa === 0) {
          a.x = hardClamp(a.x - ux * residual, world.width, cfg).value;
          a.y = hardClamp(a.y - uy * residual, world.height, cfg).value;
        } else if (b.kind !== "self" && sb === 0) {
          b.x = hardClamp(b.x + ux * residual, world.width, cfg).value;
          b.y = hardClamp(b.y + uy * residual, world.height, cfg).value;
        }
      }
      moved = true;
    });
    if (!moved) return;
  }
}

function updateBonds(world: World, cfg: PhysicsConfig): void {
  for (const link of world.links) {
    const a = world.bodies[link.a]!;
    const b = world.bodies[link.b]!;
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const bond = world.bonds.get(link.key);
    if (!bond) {
      world.bonds.set(link.key, { joined: d <= link.rest * cfg.bonds.joinFactor, since: world.time });
      continue;
    }
    if (!bond.joined && d <= link.rest * cfg.bonds.joinFactor) {
      bond.joined = true;
      bond.since = world.time;
    } else if (bond.joined && d > link.rest * cfg.bonds.breakFactor) {
      bond.joined = false;
      bond.since = world.time;
    }
  }
}

function updateFades(world: World, dt: number, cfg: PhysicsConfig): boolean {
  const rate = dt / cfg.transition.fadeSeconds;
  let fading = false;
  for (const body of world.bodies) {
    if (body.alpha === body.alphaTarget) continue;
    fading = true;
    body.alpha =
      body.alpha < body.alphaTarget
        ? Math.min(body.alphaTarget, body.alpha + rate)
        : Math.max(body.alphaTarget, body.alpha - rate);
  }
  return fading;
}

/** ½Σ|v|² over bodies that take part in the dynamics (px²/s²). */
export function kineticEnergy(world: World): number {
  let e = 0;
  for (const body of world.bodies) {
    if (body.kind === "self") continue;
    e += 0.5 * (body.vx * body.vx + body.vy * body.vy);
  }
  return e;
}

/**
 * Total mechanical energy: kinetic plus the potentials of links, homes,
 * orbital gravity, group cohesion, soft walls and the collision ramp
 * (U = k·s³ / 3m for penetration s into the soft margin m).
 */
export function mechanicalEnergy(world: World, cfg: PhysicsConfig): number {
  let e = kineticEnergy(world);
  const margin = cfg.collision.softMargin;
  for (let i = 0; i < world.bodies.length; i++) {
    const a = world.bodies[i]!;
    if (!isSolid(a)) continue;
    for (let j = i + 1; j < world.bodies.length; j++) {
      const b = world.bodies[j]!;
      if (!isSolid(b)) continue;
      const depth = a.radius + b.radius + cfg.bodies.clearance + margin - Math.hypot(b.x - a.x, b.y - a.y);
      if (depth > 0) e += (cfg.collision.stiffness * depth ** 3) / (3 * margin);
    }
  }
  for (const link of world.links) {
    const a = world.bodies[link.a]!;
    const b = world.bodies[link.b]!;
    const stretch = Math.hypot(b.x - a.x, b.y - a.y) - link.rest;
    e += 0.5 * link.stiffness * stretch * stretch;
  }
  const p = cfg.bounds.padding;
  world.bodies.forEach((body, i) => {
    if (body.kind === "self" || world.anchor?.index === i) return;
    const k = body.kind === "ghost" ? cfg.home.ghostStiffness : cfg.home.stiffness;
    e += 0.5 * k * ((body.x - body.hx) ** 2 + (body.y - body.hy) ** 2);
    if (body.kind === "match" && !body.leaving) {
      const r = Math.hypot(body.x - world.cx, body.y - world.cy);
      const rHome = Math.hypot(body.hx - world.cx, body.hy - world.cy);
      e += 0.5 * cfg.gravity.strength * (r - rHome) ** 2;
    }
    const wx = Math.max(0, p - body.x, body.x - (world.width - p));
    const wy = Math.max(0, p - body.y, body.y - (world.height - p));
    e += 0.5 * cfg.bounds.stiffness * (wx * wx + wy * wy);
  });
  for (const group of world.groups) {
    const n = group.members.length;
    if (n < 2) continue;
    let cx = 0;
    let cy = 0;
    let hx = 0;
    let hy = 0;
    for (const i of group.members) {
      const b = world.bodies[i]!;
      cx += b.x / n;
      cy += b.y / n;
      hx += b.hx / n;
      hy += b.hy / n;
    }
    for (const i of group.members) {
      const b = world.bodies[i]!;
      e += 0.5 * cfg.group.strength * ((b.x - b.hx - (cx - hx)) ** 2 + (b.y - b.hy - (cy - hy)) ** 2);
    }
  }
  return e;
}

export interface StepStats {
  contacts: number;
}

/** One fixed step of `1 / stepHz` seconds. */
export function step(world: World, cfg: PhysicsConfig): StepStats {
  const dt = 1 / cfg.integration.stepHz;
  for (const body of world.bodies) {
    body.ax = 0;
    body.ay = 0;
  }
  applyLinks(world);
  applyHome(world, cfg);
  applyGroups(world, cfg);
  const contacts = applyCollisions(world, cfg);
  applyBounds(world, cfg);
  applyAnchor(world, cfg);
  integrate(world, cfg, dt);
  projectContacts(world, cfg);

  let sq = 0;
  let count = 0;
  for (const body of world.bodies) {
    if (body.kind !== "match" || body.leaving) continue;
    sq += (body.x - body.px) ** 2 + (body.y - body.py) ** 2;
    count++;
  }
  const rms = count > 0 ? Math.sqrt(sq / count) : 0;
  world.jitter += (rms - world.jitter) * JITTER_SMOOTHING;

  world.time += dt;
  world.steps++;
  updateBonds(world, cfg);
  const fading = updateFades(world, dt, cfg);
  pruneLeaving(world);
  world.kinetic = kineticEnergy(world);

  const calm = world.kinetic < cfg.sleep.kineticThreshold && world.anchor === null && !fading;
  world.quiet = calm ? world.quiet + dt : 0;
  if (world.quiet >= cfg.sleep.seconds) {
    world.asleep = true;
    world.sleptAt = world.time;
    for (const body of world.bodies) {
      body.vx = 0;
      body.vy = 0;
      body.px = body.x;
      body.py = body.y;
    }
    world.kinetic = 0;
  }
  return { contacts };
}

export interface AdvanceResult {
  steps: number;
  contacts: number;
  /** Interpolation factor between the last two fixed steps, in [0, 1). */
  alpha: number;
}

/**
 * Feeds `frameSeconds` of real time into the fixed-step accumulator.
 * Long frames are clamped and any backlog beyond `maxStepsPerFrame` is
 * dropped, so a slow device slows the sky down instead of freezing.
 */
export function advance(world: World, frameSeconds: number, cfg: PhysicsConfig): AdvanceResult {
  const dt = 1 / cfg.integration.stepHz;
  const frame = Math.min(Math.max(0, frameSeconds), cfg.integration.maxFrameSeconds);
  if (world.asleep) {
    world.time += frame;
    return { steps: 0, contacts: 0, alpha: 0 };
  }
  world.accumulator += frame;
  let steps = 0;
  let contacts = 0;
  while (world.accumulator >= dt - EPS && steps < cfg.integration.maxStepsPerFrame) {
    contacts = step(world, cfg).contacts;
    world.accumulator = Math.max(0, world.accumulator - dt);
    steps++;
    if (world.asleep) {
      world.accumulator = 0;
      break;
    }
  }
  if (steps === cfg.integration.maxStepsPerFrame) world.accumulator = Math.min(world.accumulator, dt);
  return { steps, contacts, alpha: world.asleep ? 0 : Math.min(1, world.accumulator / dt) };
}

/** Runs the simulation offline until it sleeps (or `maxSeconds` elapse). */
export function settle(world: World, cfg: PhysicsConfig, maxSeconds = cfg.scene.settleSeconds): World {
  const limit = Math.ceil(maxSeconds * cfg.integration.stepHz);
  for (let i = 0; i < limit && !world.asleep; i++) step(world, cfg);
  return world;
}
