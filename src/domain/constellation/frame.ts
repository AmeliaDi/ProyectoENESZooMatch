/**
 * Render frame: what the canvas paints at a given instant, derived purely
 * from the world. Physics positions are interpolated between the last two
 * fixed steps; drift, the "lean" of joined stars and the bond choreography
 * are render-only, so none of them can feed energy back into the simulation.
 */

import type { PhysicsConfig } from "@/config";

import { driftOffset } from "./noise";
import { linkKey } from "./scene";
import type { LinkKind } from "./types";
import type { World } from "./world";

export interface FrameStar {
  id: string;
  x: number;
  y: number;
  alpha: number;
  /** Joined to the observer or to a neighbour recently: "feliz" sprite. */
  happy: boolean;
}

export type BondPhase = "tracing" | "joined" | "fading" | "apart";

export interface FrameLine {
  key: string;
  a: string;
  b: string;
  kind: LinkKind;
  similarity: number;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** 0–1 share of the segment already drawn (from `a` towards `b`). */
  progress: number;
  /** 0–1 visibility multiplier for the bond phase. */
  visibility: number;
  phase: BondPhase;
}

export interface FrameFlash {
  key: string;
  x: number;
  y: number;
  /** 0–1, peaks at the midpoint of the flash. */
  intensity: number;
}

export interface FrameGroup {
  ids: readonly string[];
  /** Outline vertices in angular order around the centroid. */
  points: { x: number; y: number }[];
  /** 0–1 share of the outline already drawn. */
  progress: number;
}

export interface Frame {
  stars: FrameStar[];
  lines: FrameLine[];
  flashes: FrameFlash[];
  groups: FrameGroup[];
  /** Uniform "breathing" scale of the whole sky around its centre. */
  breathe: number;
}

export interface FrameOptions {
  /** Interpolation factor in [0, 1). */
  alpha: number;
  /** Static frame: no drift, no breathing, no traced lines. */
  still: boolean;
}

function smooth(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

function bondVisual(
  joined: boolean,
  since: number,
  time: number,
  still: boolean,
  cfg: PhysicsConfig["bonds"],
): { phase: BondPhase; progress: number; visibility: number } {
  if (still) return joined ? { phase: "joined", progress: 1, visibility: 1 } : { phase: "apart", progress: 0, visibility: 0 };
  const age = time - since;
  if (joined) {
    const progress = smooth(age / cfg.traceSeconds);
    return { phase: progress < 1 ? "tracing" : "joined", progress, visibility: 1 };
  }
  const visibility = 1 - smooth(age / cfg.fadeSeconds);
  return { phase: visibility > 0 ? "fading" : "apart", progress: 1, visibility };
}

function groupOutline(points: { x: number; y: number }[]): { x: number; y: number }[] {
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  return [...points].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
}

export function buildFrame(world: World, cfg: PhysicsConfig, options: FrameOptions): Frame {
  const { alpha, still } = options;
  const time = world.time;
  const n = world.bodies.length;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  world.bodies.forEach((body, i) => {
    let x = body.px + (body.x - body.px) * alpha;
    let y = body.py + (body.y - body.py) * alpha;
    if (!still && body.kind !== "self" && world.anchor?.index !== i) {
      const d = driftOffset(body.drift, time, cfg.ambient.driftAmplitude, cfg.ambient.driftHz);
      x += d.x;
      y += d.y;
    }
    xs[i] = x;
    ys[i] = y;
  });

  const happy = new Set<number>();
  const lean = new Float64Array(n * 2);
  const lines: FrameLine[] = [];
  const flashes: FrameFlash[] = [];
  for (const link of world.links) {
    const bond = world.bonds.get(link.key) ?? { joined: false, since: time };
    const visual = bondVisual(bond.joined, bond.since, time, still, cfg.bonds);
    const ax = xs[link.a]!;
    const ay = ys[link.a]!;
    const bx = xs[link.b]!;
    const by = ys[link.b]!;
    lines.push({
      key: link.key,
      a: world.bodies[link.a]!.id,
      b: world.bodies[link.b]!.id,
      kind: link.kind,
      similarity: link.similarity,
      ax,
      ay,
      bx,
      by,
      ...visual,
    });
    if (!bond.joined) continue;
    const age = time - bond.since;
    if (still || age <= cfg.bonds.happySeconds) {
      happy.add(link.a);
      happy.add(link.b);
    }
    if (!still) {
      const d = Math.hypot(bx - ax, by - ay);
      if (d > 1e-9) {
        // Joined stars lean a pixel towards each other ("se orientan").
        const ux = (bx - ax) / d;
        const uy = (by - ay) / d;
        lean[link.a * 2] = lean[link.a * 2]! + ux;
        lean[link.a * 2 + 1] = lean[link.a * 2 + 1]! + uy;
        lean[link.b * 2] = lean[link.b * 2]! - ux;
        lean[link.b * 2 + 1] = lean[link.b * 2 + 1]! - uy;
      }
      const flashStart = cfg.bonds.traceSeconds;
      const t = (age - flashStart) / cfg.bonds.flashSeconds;
      if (t >= 0 && t < 1) {
        flashes.push({ key: link.key, x: (ax + bx) / 2, y: (ay + by) / 2, intensity: Math.sin(Math.PI * t) });
      }
    }
  }

  const stars: FrameStar[] = world.bodies.map((body, i) => {
    let x = xs[i]!;
    let y = ys[i]!;
    if (body.kind === "match") {
      const lx = lean[i * 2]!;
      const ly = lean[i * 2 + 1]!;
      const l = Math.hypot(lx, ly);
      if (l > 1e-9) {
        x += (lx / l) * cfg.bonds.leanPx;
        y += (ly / l) * cfg.bonds.leanPx;
      }
    }
    return { id: body.id, x, y, alpha: body.alpha, happy: body.kind !== "ghost" && happy.has(i) };
  });

  const groups: FrameGroup[] = world.groups.map((group) => {
    const points = groupOutline(group.members.map((i) => ({ x: stars[i]!.x, y: stars[i]!.y })));
    const joinedSince = group.members.reduce((latest, i) => {
      const spoke = world.bonds.get(linkKey(world.selfId, world.bodies[i]!.id));
      if (!spoke?.joined) return Infinity;
      return Math.max(latest, spoke.since);
    }, -Infinity);
    const progress = still ? 1 : Number.isFinite(joinedSince) ? smooth((time - joinedSince) / cfg.bonds.groupTraceSeconds) : 0;
    return { ids: group.ids, points, progress };
  });

  const breathe = still
    ? 1
    : 1 + cfg.ambient.breatheScale * Math.sin((2 * Math.PI * time) / cfg.ambient.breathePeriodSeconds);
  return { stars, lines, flashes, groups, breathe };
}
