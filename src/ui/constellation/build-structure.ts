/**
 * Constellation render layer — world → React render structure.
 *
 * The only place that translates the physics `World` into the declarative tree
 * the canvas renders. Pure (no DOM, no React, no clocks), and it runs once per
 * data change, resize or track switch — never per frame.
 */

import type { SceneMatch, World } from "@/domain/constellation";
import { formatIdentity } from "@/domain/identity/format-identity";
import type { MatchTrack } from "@/types/microtest";

import {
  GHOST_ANIMAL_ID,
  GHOST_COLOR_ID,
  GHOST_OPACITY,
  SPRITE_SIZE_FACTOR,
  edgeStrokeOpacity,
  edgeStrokeWidth,
  formatAffinityPercent,
  glowLevel,
  isRadiantAffinity,
  matchAriaLabel,
  nodeOpacity,
  selfAriaLabel,
} from "./render-helpers";
import { CONSTELLATION_COPY, type ConstellationMatchInput } from "./types";
import type {
  ConstellationSelfInput,
  ConstellationStructure,
  NodeMeta,
  RenderEdge,
  RenderNode,
} from "./types";


/** Adapts the view-model matches to the scene's minimal input (no names), deduplicated per track. */
export function toSceneMatches(matches: readonly ConstellationMatchInput[]): SceneMatch[] {
  const byTrackAndId = new Map<string, SceneMatch>();
  for (const match of matches) {
    const key = `${match.track}:${match.id}`;
    const existing = byTrackAndId.get(key);
    if (existing && existing.similarity >= match.similarity) continue;
    byTrackAndId.set(key, { id: match.id, similarity: match.similarity, track: match.track });
  }
  return [...byTrackAndId.values()];
}

function toMeta(node: ConstellationSelfInput | ConstellationMatchInput, similarity: number): NodeMeta {
  return {
    identity: node.identity,
    animalId: node.animalId,
    colorId: node.colorId,
    mark: node.mark ?? null,
    colorHex: node.colorHex,
    name: formatIdentity(node.identity).title,
    similarity,
  };
}

/** Indexes every participant by id, including the self node, prioritizing `activeTrack` when a counterpart is in both tracks. */
export function buildNodeMeta(
  me: ConstellationSelfInput,
  matches: readonly ConstellationMatchInput[],
  activeTrack?: MatchTrack,
): Map<string, NodeMeta> {
  const meta = new Map<string, NodeMeta>();
  const metaTrack = new Map<string, MatchTrack>();
  meta.set(me.id, toMeta(me, 1));
  for (const match of matches) {
    const current = meta.get(match.id);
    const currentTrack = metaTrack.get(match.id);
    if (current) {
      const currentIsActive = activeTrack !== undefined && currentTrack === activeTrack;
      const candidateIsActive = activeTrack !== undefined && match.track === activeTrack;
      if (currentIsActive && !candidateIsActive) continue;
      if (currentIsActive === candidateIsActive && current.similarity >= match.similarity) continue;
    }
    metaTrack.set(match.id, match.track);
    meta.set(match.id, toMeta(match, match.similarity));
  }
  return meta;
}

/** Meta for the decorative stars the scene synthesises: not a person, so no identity. */
export const GHOST_META: NodeMeta = {
  identity: null,
  animalId: GHOST_ANIMAL_ID,
  colorId: GHOST_COLOR_ID,
  mark: null,
  colorHex: "#c9d4ff",
  name: "",
  similarity: 0,
};

function resolveMeta(meta: Map<string, NodeMeta>, id: string, isGhost: boolean): NodeMeta {
  if (isGhost) return GHOST_META;
  return meta.get(id) ?? GHOST_META;
}

function adjacencyOf(edges: readonly RenderEdge[]): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();
  const push = (from: string, to: string): void => {
    const list = adjacency.get(from);
    if (!list) adjacency.set(from, [to]);
    else if (!list.includes(to)) list.push(to);
  };
  for (const edge of edges) {
    push(edge.source, edge.target);
    push(edge.target, edge.source);
  }
  return adjacency;
}

/**
 * Builds the render structure for a world. Leaving stars (from the previous
 * track) are kept so they can fade out, but they are never interactive and
 * never announced to screen readers.
 */
export function structureFromWorld(
  world: World,
  meta: Map<string, NodeMeta>,
  track: MatchTrack,
): ConstellationStructure {
  const nodes: RenderNode[] = world.bodies.map((body) => {
    const isGhost = body.kind === "ghost";
    const isSelf = body.kind === "self";
    const info = resolveMeta(meta, body.id, isGhost);
    // Every accessible name comes from `formatIdentity` on the stored identity;
    // a ghost (or an id with no person behind it) is pure decoration.
    const ariaLabel =
      isGhost || info.identity === null
        ? CONSTELLATION_COPY.ghostDecorative
        : isSelf
          ? selfAriaLabel(info.identity)
          : matchAriaLabel(info.identity, body.similarity, track);
    return {
      id: body.id,
      radius: body.displayRadius,
      displaySize: body.displayRadius * SPRITE_SIZE_FACTOR,
      isSelf,
      isGhost,
      isLeaving: body.leaving,
      animalId: info.animalId,
      colorId: info.colorId,
      mark: info.mark,
      colorHex: info.colorHex,
      name: info.name,
      affinityLabel: isGhost || isSelf ? null : `${formatAffinityPercent(body.similarity)}%`,
      radiant: !isGhost && !isSelf && !body.leaving && isRadiantAffinity(body.similarity, track),
      glowLevel: isGhost || isSelf ? 0 : glowLevel(body.similarity, world.threshold),
      ariaLabel,
      opacity: isGhost ? GHOST_OPACITY : isSelf ? 1 : nodeOpacity(body.similarity, world.threshold),
      initialX: body.x,
      initialY: body.y,
    };
  });

  const radiantIds = new Set(nodes.filter((node) => node.radiant).map((node) => node.id));
  const edges: RenderEdge[] = world.links.map((link) => {
    const a = world.bodies[link.a]!;
    const b = world.bodies[link.b]!;
    const other = a.kind === "self" ? b.id : a.id;
    return {
      key: link.key,
      source: a.id,
      target: b.id,
      kind: link.kind,
      similarity: link.similarity,
      width: edgeStrokeWidth(link.similarity),
      opacity: edgeStrokeOpacity(link.similarity),
      radiant: link.kind === "spoke" && radiantIds.has(other),
    };
  });

  return {
    nodes,
    edges,
    groups: world.groups.map((group) => group.ids),
    adjacency: adjacencyOf(edges),
    threshold: world.threshold,
    selfId: world.selfId,
    width: world.width,
    height: world.height,
  };
}
