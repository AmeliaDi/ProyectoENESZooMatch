/**
 * Constellation render layer — world → React render structure.
 *
 * The only place that translates the physics `World` into the declarative tree
 * the canvas renders. Pure (no DOM, no React, no clocks), and it runs once per
 * data change, resize or track switch — never per frame.
 */

import type { SceneMatch, World } from "@/domain/constellation";
import type { MatchTrack } from "@/types/microtest";

import {
  GHOST_ANIMAL_ID,
  GHOST_COLOR_ID,
  GHOST_OPACITY,
  SPRITE_SIZE_FACTOR,
  edgeStrokeOpacity,
  edgeStrokeWidth,
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

/** Neutral thread colour for match↔match links (the ink token). */
export const EDGE_NEUTRAL_COLOR = "#c9d4ff";

/** Adapts the view-model matches to the scene's minimal input (no names). */
export function toSceneMatches(matches: readonly ConstellationMatchInput[]): SceneMatch[] {
  return matches.map((match) => ({ id: match.id, similarity: match.similarity, track: match.track }));
}

/** Indexes every participant by id, including the self node. */
export function buildNodeMeta(
  me: ConstellationSelfInput,
  matches: readonly ConstellationMatchInput[],
): Map<string, NodeMeta> {
  const meta = new Map<string, NodeMeta>();
  meta.set(me.id, {
    animalId: me.animalId,
    colorId: me.colorId,
    colorHex: me.colorHex,
    animalName: me.animalName,
    colorName: me.colorName,
    alias: me.alias,
    similarity: 1,
  });
  for (const match of matches) {
    meta.set(match.id, {
      animalId: match.animalId,
      colorId: match.colorId,
      colorHex: match.colorHex,
      animalName: match.animalName,
      colorName: match.colorName,
      alias: match.alias,
      similarity: match.similarity,
    });
  }
  return meta;
}

/** Meta for the decorative stars the scene synthesises. */
export const GHOST_META: NodeMeta = {
  animalId: GHOST_ANIMAL_ID,
  colorId: GHOST_COLOR_ID,
  colorHex: "#c9d4ff",
  animalName: CONSTELLATION_COPY.ghostDecorative,
  colorName: "",
  alias: "",
  similarity: 0,
};

function resolveMeta(meta: Map<string, NodeMeta>, id: string, isGhost: boolean): NodeMeta {
  if (isGhost) return GHOST_META;
  return meta.get(id) ?? { ...GHOST_META, animalName: "" };
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
    const ariaLabel = isGhost
      ? CONSTELLATION_COPY.ghostDecorative
      : isSelf
        ? selfAriaLabel(info.animalName, info.colorName, info.alias)
        : matchAriaLabel(info.animalName, info.colorName, body.similarity, track);
    return {
      id: body.id,
      radius: body.displayRadius,
      displaySize: body.displayRadius * SPRITE_SIZE_FACTOR,
      isSelf,
      isGhost,
      isLeaving: body.leaving,
      animalId: info.animalId,
      colorId: info.colorId,
      colorHex: info.colorHex,
      alias: info.alias,
      ariaLabel,
      opacity: isGhost ? GHOST_OPACITY : isSelf ? 1 : nodeOpacity(body.similarity, world.threshold),
      initialX: body.x,
      initialY: body.y,
    };
  });

  const colorById = new Map(nodes.map((node) => [node.id, node.colorHex]));
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
      color: link.kind === "spoke" ? (colorById.get(other) ?? EDGE_NEUTRAL_COLOR) : EDGE_NEUTRAL_COLOR,
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
