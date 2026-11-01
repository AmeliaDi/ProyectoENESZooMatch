/**
 * Scene construction: who is in the sky, where each star "lives" (its home),
 * and which constellation lines exist.
 *
 * Homes are the equilibrium of the physics: every spring's rest length is the
 * distance between the homes it joins, so a settled sky sits exactly on its
 * homes and the forces vanish there. Layout decisions therefore live here and
 * the integrator only has to get there gracefully.
 */

import { MATCHING_CONFIG, type PhysicsConfig } from "@/config";
import { fnv1a32, mulberry32 } from "@/domain/shared";

import { detectGroups, estimatePairSimilarity, pairTable } from "./groups";
import type {
  MatchTrack,
  Scene,
  SceneBody,
  SceneGroup,
  SceneInput,
  SceneLink,
  SceneMatch,
  Vec2,
} from "./types";

const TAU = Math.PI * 2;
const HOME_RELAX_ITERATIONS = 96;
const EPS = 1e-9;

/** Exclusive similarity threshold of a track, read from matching config. */
export function getTrackThreshold(track: MatchTrack): number {
  return MATCHING_CONFIG.tracks[track].minimum_similarity_exclusive;
}

/** Order-independent link key (`a::b`). */
export function linkKey(a: string, b: string): string {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

/** Affinity above the threshold, normalised to [0, 1]. `null` if not a match. */
export function affinityAboveThreshold(similarity: number, threshold: number): number | null {
  if (!(similarity > threshold)) return null;
  const span = 1 - threshold;
  return span <= 0 ? 1 : Math.min(1, (similarity - threshold) / span);
}

/**
 * Target distance from the observer: r(s) = R_max − t^γ (R_max − R_min), with
 * t the normalised affinity. Strictly decreasing in similarity; `null` at or
 * below the threshold (no attraction for non-matches). R_max fits the padded
 * viewport, so a 320 px phone still keeps every orbit on screen.
 */
export function similarityToDistance(
  similarity: number,
  threshold: number,
  width: number,
  height: number,
  cfg: PhysicsConfig,
): number | null {
  const t = affinityAboveThreshold(similarity, threshold);
  if (t === null) return null;
  const minDim = Math.min(width, height);
  const fit = Math.max(0, minDim / 2 - cfg.bounds.padding);
  const outer = Math.min(minDim * cfg.orbit.radiusRatio, fit);
  const inner = Math.min(cfg.orbit.minRadius, outer);
  return outer - Math.pow(t, cfg.orbit.gamma) * (outer - inner);
}

/** Centre-to-centre distance two bodies must keep (R_i + R_j + δ). */
export function contactDistance(a: { radius: number }, b: { radius: number }, cfg: PhysicsConfig): number {
  return a.radius + b.radius + cfg.bodies.clearance;
}

function wrapAngle(angle: number): number {
  const wrapped = angle % TAU;
  return wrapped < 0 ? wrapped + TAU : wrapped;
}

function signedAngle(angle: number): number {
  const wrapped = wrapAngle(angle + Math.PI);
  return wrapped - Math.PI;
}

function clampInto(value: number, size: number, padding: number): number {
  const lo = Math.min(padding, size / 2);
  const hi = Math.max(size - padding, size / 2);
  return Math.min(hi, Math.max(lo, value));
}

function hashAngle(key: string): number {
  return (fnv1a32(key) / 0xffffffff) * TAU;
}

/** Real matches of the active track, deduplicated and capped by affinity. */
export function activeMatches(
  matches: readonly SceneMatch[],
  track: MatchTrack,
  threshold: number,
  cap: number,
): SceneMatch[] {
  const seen = new Set<string>();
  const out: SceneMatch[] = [];
  for (const match of matches) {
    if (match.track !== track || !(match.similarity > threshold) || seen.has(match.id)) continue;
    seen.add(match.id);
    out.push(match);
  }
  out.sort((a, b) => b.similarity - a.similarity || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out.slice(0, cap);
}

interface AngleUnit {
  ids: string[];
  weight: number;
  preferred: number;
  anchored: boolean;
}

function circularMean(angles: readonly number[]): number {
  let sx = 0;
  let sy = 0;
  for (const a of angles) {
    sx += Math.cos(a);
    sy += Math.sin(a);
  }
  return Math.atan2(sy, sx);
}

/**
 * Angular destinations. Units (single stars or whole groups) are sorted by
 * their preferred angle and laid on evenly weighted slots, so the cyclic
 * order is preserved and no two paths cross during a track switch. The global
 * phase is the circular mean that minimises the angular travel of the stars
 * that were already on screen.
 */
function assignAngles(
  matches: readonly SceneMatch[],
  groups: readonly SceneGroup[],
  track: MatchTrack,
  centre: Vec2,
  previous: ReadonlyMap<string, Vec2> | undefined,
): Map<string, number> {
  const preferredOf = (id: string): { angle: number; anchored: boolean } => {
    const seen = previous?.get(id);
    if (seen && Math.hypot(seen.x - centre.x, seen.y - centre.y) > EPS) {
      return { angle: Math.atan2(seen.y - centre.y, seen.x - centre.x), anchored: true };
    }
    return { angle: hashAngle(`angle:${track}:${id}`), anchored: false };
  };

  const grouped = new Set(groups.flatMap((g) => g.ids));
  const units: AngleUnit[] = [];
  for (const group of groups) {
    const prefs = group.ids.map(preferredOf);
    units.push({
      ids: [...group.ids],
      weight: group.ids.length,
      preferred: wrapAngle(circularMean(prefs.map((p) => p.angle))),
      anchored: prefs.some((p) => p.anchored),
    });
  }
  for (const match of matches) {
    if (grouped.has(match.id)) continue;
    const pref = preferredOf(match.id);
    units.push({ ids: [match.id], weight: 1, preferred: wrapAngle(pref.angle), anchored: pref.anchored });
  }
  units.sort((a, b) => a.preferred - b.preferred || (a.ids[0]! < b.ids[0]! ? -1 : 1));

  const total = units.reduce((sum, unit) => sum + unit.weight, 0);
  const slotCentres: number[] = [];
  let cumulative = 0;
  for (const unit of units) {
    slotCentres.push((TAU * (cumulative + unit.weight / 2)) / Math.max(1, total));
    cumulative += unit.weight;
  }

  const anchoredOffsets = units.flatMap((unit, k) =>
    unit.anchored ? [unit.preferred - slotCentres[k]!] : [],
  );
  const phase =
    anchoredOffsets.length > 0 ? circularMean(anchoredOffsets) : hashAngle(`phase:${track}`);

  const slot = TAU / Math.max(1, total);
  const angles = new Map<string, number>();
  units.forEach((unit, k) => {
    const centreAngle = phase + slotCentres[k]!;
    unit.ids.forEach((id, index) => {
      angles.set(id, wrapAngle(centreAngle + (index - (unit.ids.length - 1) / 2) * slot));
    });
  });
  return angles;
}

/**
 * Group members share one ring (their mean orbit) and sit `sectorSpacing`
 * contact diameters apart, so a group reads as one figure.
 */
function groupRadii(
  groups: readonly SceneGroup[],
  radiusOf: ReadonlyMap<string, number>,
): Map<string, number> {
  const out = new Map(radiusOf);
  for (const group of groups) {
    const mean = group.ids.reduce((sum, id) => sum + (radiusOf.get(id) ?? 0), 0) / group.ids.length;
    for (const id of group.ids) out.set(id, mean);
  }
  return out;
}

function groupSpacing(
  groups: readonly SceneGroup[],
  angles: Map<string, number>,
  radii: ReadonlyMap<string, number>,
  diameter: number,
  spacing: number,
): void {
  for (const group of groups) {
    const radius = radii.get(group.ids[0]!) ?? 1;
    const step = Math.min(TAU / group.ids.length, (diameter * spacing) / Math.max(radius, EPS));
    const centre = circularMean(group.ids.map((id) => angles.get(id) ?? 0));
    const ordered = [...group.ids].sort(
      (a, b) => signedAngle((angles.get(a) ?? 0) - centre) - signedAngle((angles.get(b) ?? 0) - centre),
    );
    ordered.forEach((id, index) => {
      angles.set(id, wrapAngle(centre + (index - (ordered.length - 1) / 2) * step));
    });
  }
}

/**
 * Spacing between two homes: contact distance plus the soft collision margin,
 * so the repulsive ramp is exactly zero at equilibrium and does not shift it.
 */
export function homeSpacing(a: { radius: number }, b: { radius: number }, cfg: PhysicsConfig): number {
  return contactDistance(a, b, cfg) + cfg.collision.softMargin;
}

/**
 * Projective circle packing on the homes: any pair closer than the home
 * spacing is pushed apart along the secant. The observer never moves; real
 * stars never yield to ghosts. Deterministic (index order, fixed iteration cap).
 */
export function relaxHomes(bodies: SceneBody[], width: number, height: number, cfg: PhysicsConfig): void {
  const padding = cfg.bounds.padding;
  for (let iteration = 0; iteration < HOME_RELAX_ITERATIONS; iteration++) {
    let moved = false;
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i]!;
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j]!;
        const min = homeSpacing(a, b, cfg);
        let dx = b.homeX - a.homeX;
        let dy = b.homeY - a.homeY;
        let d = Math.hypot(dx, dy);
        if (d >= min - EPS) continue;
        if (d < EPS) {
          const angle = hashAngle(`split:${linkKey(a.id, b.id)}`);
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          d = 1;
        }
        const overlap = min - d;
        const [shareA, shareB] = pushShares(a, b, overlap);
        if (shareA > 0) {
          a.homeX = clampInto(a.homeX - (dx / d) * shareA, width, padding);
          a.homeY = clampInto(a.homeY - (dy / d) * shareA, height, padding);
        }
        if (shareB > 0) {
          b.homeX = clampInto(b.homeX + (dx / d) * shareB, width, padding);
          b.homeY = clampInto(b.homeY + (dy / d) * shareB, height, padding);
        }
        moved = true;
      }
    }
    if (!moved) return;
  }
}

/** Who yields in a contact: never the observer, ghosts before real stars. */
export function pushShares(
  a: { kind: SceneBody["kind"] },
  b: { kind: SceneBody["kind"] },
  amount: number,
): [number, number] {
  if (a.kind === "self") return [0, b.kind === "self" ? 0 : amount];
  if (b.kind === "self") return [amount, 0];
  if (a.kind === "ghost" && b.kind !== "ghost") return [amount, 0];
  if (b.kind === "ghost" && a.kind !== "ghost") return [0, amount];
  return [amount / 2, amount / 2];
}

function ghostBodies(input: SceneInput, cfg: PhysicsConfig): SceneBody[] {
  const count = Math.max(0, Math.min(cfg.scene.maxGhosts, Math.floor(input.ghostCount)));
  const rand = mulberry32(fnv1a32(`ghost::${input.selfId}::${input.track}`));
  const minDim = Math.min(input.width, input.height);
  const cx = input.width / 2;
  const cy = input.height / 2;
  const bodies: SceneBody[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / Math.max(1, count)) * TAU + rand() * cfg.scene.ghostAngleJitter;
    const orbit = minDim * (cfg.scene.ghostOrbitMin + rand() * cfg.scene.ghostOrbitSpan);
    bodies.push({
      id: `ghost-${input.selfId}-${i}`,
      kind: "ghost",
      similarity: 0,
      radius: cfg.bodies.ghostRadius,
      displayRadius: cfg.bodies.ghostRadius,
      homeX: clampInto(cx + Math.cos(angle) * orbit, input.width, cfg.bounds.padding),
      homeY: clampInto(cy + Math.sin(angle) * orbit, input.height, cfg.bounds.padding),
    });
  }
  return bodies;
}

/** Drops ghosts that could not be packed (tiny skies with many matches). */
function dropCrowdedGhosts(bodies: SceneBody[], cfg: PhysicsConfig): SceneBody[] {
  const kept: SceneBody[] = [];
  for (const body of bodies) {
    if (
      body.kind === "ghost" &&
      kept.some(
        (other) =>
          Math.hypot(body.homeX - other.homeX, body.homeY - other.homeY) <
          homeSpacing(body, other, cfg) - 1e-6,
      )
    ) {
      continue;
    }
    kept.push(body);
  }
  return kept;
}

function buildLinks(
  selfId: string,
  matches: readonly SceneMatch[],
  groups: readonly SceneGroup[],
  bodyById: ReadonlyMap<string, SceneBody>,
  threshold: number,
  pair: (i: number, j: number) => number,
  cfg: PhysicsConfig,
): SceneLink[] {
  const links = new Map<string, SceneLink>();
  const add = (a: string, b: string, kind: SceneLink["kind"], similarity: number): void => {
    const key = linkKey(a, b);
    if (links.has(key)) return;
    const ba = bodyById.get(a);
    const bb = bodyById.get(b);
    if (!ba || !bb) return;
    const rest = Math.hypot(bb.homeX - ba.homeX, bb.homeY - ba.homeY);
    links.set(key, { key, a, b, kind, similarity, rest });
  };

  for (const match of matches) add(selfId, match.id, "spoke", match.similarity);

  const index = new Map(matches.map((m, i) => [m.id, i]));
  for (const group of groups) {
    for (let p = 0; p < group.ids.length; p++) {
      for (let q = p + 1; q < group.ids.length; q++) {
        const i = index.get(group.ids[p]!)!;
        const j = index.get(group.ids[q]!)!;
        add(group.ids[p]!, group.ids[q]!, "pair", pair(i, j));
      }
    }
  }

  for (let i = 0; i < matches.length; i++) {
    const neighbours: { j: number; s: number; id: string }[] = [];
    for (let j = 0; j < matches.length; j++) {
      if (j === i) continue;
      const s = pair(i, j);
      if (s > threshold) neighbours.push({ j, s, id: matches[j]!.id });
    }
    neighbours.sort((a, b) => b.s - a.s || (a.id < b.id ? -1 : 1));
    for (const { j, s } of neighbours.slice(0, cfg.edges.linksPerNode)) {
      add(matches[i]!.id, matches[j]!.id, "pair", s);
    }
  }

  return [...links.values()].sort((a, b) =>
    a.kind !== b.kind ? (a.kind === "spoke" ? -1 : 1) : b.similarity - a.similarity || (a.key < b.key ? -1 : 1),
  );
}

/**
 * Builds the scene for one track. `previous` (current on-screen positions)
 * keeps the cyclic order of stars that survive a track switch.
 */
export function buildScene(
  input: SceneInput,
  cfg: PhysicsConfig,
  previous?: ReadonlyMap<string, Vec2>,
): Scene {
  const { width, height, threshold, track } = input;
  const centre = { x: width / 2, y: height / 2 };
  const matches = activeMatches(input.matches, track, threshold, input.maxMatches ?? cfg.scene.maxRealMatches);
  const pairSimilarity = input.pairSimilarity ?? estimatePairSimilarity;
  const groups = detectGroups(matches, threshold, pairSimilarity, cfg.group);

  const radiusOf = new Map<string, number>();
  for (const match of matches) {
    radiusOf.set(match.id, similarityToDistance(match.similarity, threshold, width, height, cfg) ?? 0);
  }
  const radii = groupRadii(groups, radiusOf);
  const angles = assignAngles(matches, groups, track, centre, previous);
  const diameter = 2 * cfg.bodies.matchRadius + cfg.bodies.clearance + cfg.collision.softMargin;
  groupSpacing(groups, angles, radii, diameter, cfg.group.sectorSpacing);

  const self: SceneBody = {
    id: input.selfId,
    kind: "self",
    similarity: 1,
    radius: cfg.bodies.selfRadius,
    displayRadius: cfg.bodies.selfRadius,
    homeX: centre.x,
    homeY: centre.y,
  };
  const matchBodies: SceneBody[] = matches.map((match) => {
    const angle = angles.get(match.id) ?? 0;
    const r = radii.get(match.id) ?? 0;
    return {
      id: match.id,
      kind: "match",
      similarity: match.similarity,
      radius: cfg.bodies.matchRadius,
      displayRadius: cfg.bodies.matchDisplayBase + match.similarity * cfg.bodies.matchDisplayScale,
      homeX: clampInto(centre.x + Math.cos(angle) * r, width, cfg.bounds.padding),
      homeY: clampInto(centre.y + Math.sin(angle) * r, height, cfg.bounds.padding),
    };
  });

  const bodies = [self, ...matchBodies, ...ghostBodies(input, cfg)];
  relaxHomes(bodies, width, height, cfg);
  const packed = dropCrowdedGhosts(bodies, cfg);
  const bodyById = new Map(packed.map((b) => [b.id, b]));
  const pair = pairTable(matches, pairSimilarity);

  return {
    selfId: input.selfId,
    track,
    threshold,
    width,
    height,
    bodies: packed,
    links: buildLinks(input.selfId, matches, groups, bodyById, threshold, pair, cfg),
    groups,
  };
}
