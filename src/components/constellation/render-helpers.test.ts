/**
 * Unit tests for the constellation render helpers.
 *
 * These run in Vitest's `node` environment (no jsdom), which is exactly why all
 * the non-trivial render logic was extracted into `render-helpers.ts` instead of
 * living inside the components. Everything asserted here is pure.
 */

import { describe, expect, it } from "vitest";

import type { ConstellationEdge, ConstellationNode, SimulationState } from "@/lib/constellation-layout";
import type { CompatibilityBadge } from "@/types/microtest";

import {
  AMBIENT_FRAME_DIVIDER,
  BADGE_LIMITS,
  GHOST_ANIMAL_ID,
  GHOST_COLOR_ID,
  GHOST_OPACITY,
  HIT_RADIUS_PADDING,
  JOIN_DISTANCE_FACTOR,
  MAX_RENDERED_EDGES,
  MAX_SPARKS,
  SPARK_LIFETIME_MS,
  SPRITE_SIZE_FACTOR,
  activeNodeIds,
  applyCachedPositions,
  buildAdjacency,
  buildDataKey,
  capturePositions,
  clamp,
  clientToViewBox,
  distance,
  edgeKey,
  edgeStrokeOpacity,
  edgeStrokeWidth,
  formatAffinityPercent,
  heartRects,
  matchAriaLabel,
  matchesForTrack,
  nodeOpacity,
  normalizeSimilarity,
  pruneInactiveNodes,
  round2,
  selectRenderEdges,
  selfAriaLabel,
  sliceBadges,
  trackNoun,
  connectionsLabel,
} from "./render-helpers";
import type { ConstellationMatchInput, ConstellationSelfInput } from "./types";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ROMANCE_THRESHOLD = 0.8;

function makeNode(id: string, overrides: Partial<ConstellationNode> = {}): ConstellationNode {
  return {
    id,
    x: 100,
    y: 100,
    vx: 0,
    vy: 0,
    radius: 12,
    isSelf: false,
    animal: "ajolotito",
    color: "#e8a0bf",
    alias: id,
    similarity: 0.9,
    track: "romance",
    isGhost: false,
    ...overrides,
  };
}

function makeEdge(source: string, target: string, similarity: number): ConstellationEdge {
  return { source, target, similarity, targetDistance: 120 };
}

function makeState(
  nodes: ConstellationNode[],
  edges: ConstellationEdge[],
): SimulationState {
  return {
    nodes,
    edges,
    width: 900,
    height: 620,
    tick: 0,
    isEquilibrium: true,
    totalKineticEnergy: 0,
    settledTicks: 10,
  };
}

function makeBadge(dimension: string, affinity: number): CompatibilityBadge {
  return { dimension, label: `Label ${dimension}`, affinity, icon: "★" };
}

const SELF: ConstellationSelfInput = {
  id: "me",
  animalId: "ajolotito",
  colorId: "rosa-pastel",
  colorHex: "#e8a0bf",
  animalName: "Ajolotito",
  colorName: "rosa pastel",
  alias: "Mar",
};

function makeMatch(id: string, similarity: number, track: "romance" | "amistad"): ConstellationMatchInput {
  return {
    id,
    animalId: "lobito",
    colorId: "azul-zafiro",
    colorHex: "#3b6fd4",
    animalName: "Lobito",
    colorName: "azul zafiro",
    alias: `Alias ${id}`,
    similarity,
    track,
    badges: [],
    explanation: null,
  };
}

// ─── Tunables ────────────────────────────────────────────────────────────────

describe("render tunables", () => {
  it("keeps the tunables in the ranges the render tree assumes", () => {
    expect(SPRITE_SIZE_FACTOR).toBeGreaterThan(2);
    expect(HIT_RADIUS_PADDING).toBeGreaterThanOrEqual(8);
    expect(JOIN_DISTANCE_FACTOR).toBeGreaterThan(1);
    expect(SPARK_LIFETIME_MS).toBeGreaterThan(0);
    expect(MAX_SPARKS).toBeGreaterThan(0);
    expect(AMBIENT_FRAME_DIVIDER).toBeGreaterThanOrEqual(2);
    expect(MAX_RENDERED_EDGES).toBeGreaterThan(0);
    expect(GHOST_OPACITY).toBeGreaterThan(0);
    expect(GHOST_OPACITY).toBeLessThan(1);
    expect(BADGE_LIMITS).toEqual({ romance: 5, amistad: 3 });
  });

  it("points ghosts at catalogue ids the sprite engine actually knows", () => {
    // "estrella" (the engine's own label) is NOT a registered animal, so the
    // render layer must substitute real catalogue ids.
    expect(GHOST_ANIMAL_ID).toBe("estrellita");
    expect(GHOST_COLOR_ID).toBe("plateado-lunar");
  });
});

// ─── Numeric mappings ────────────────────────────────────────────────────────

describe("clamp / normalizeSimilarity", () => {
  it("clamps to the given bounds", () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.4, 0, 1)).toBe(0.4);
  });

  it("maps the threshold to 0 and a perfect match to 1", () => {
    expect(normalizeSimilarity(ROMANCE_THRESHOLD, ROMANCE_THRESHOLD)).toBe(0);
    expect(normalizeSimilarity(1, ROMANCE_THRESHOLD)).toBe(1);
    expect(normalizeSimilarity(0.9, ROMANCE_THRESHOLD)).toBeCloseTo(0.5, 10);
  });

  it("clamps below-threshold input to 0 instead of going negative", () => {
    expect(normalizeSimilarity(0.2, ROMANCE_THRESHOLD)).toBe(0);
  });

  it("degrades safely if a threshold ever reached 1", () => {
    expect(normalizeSimilarity(1, 1)).toBe(1);
  });
});

describe("nodeOpacity", () => {
  it("keeps the weakest allowed match clearly visible", () => {
    expect(nodeOpacity(ROMANCE_THRESHOLD, ROMANCE_THRESHOLD)).toBeCloseTo(0.62, 10);
  });

  it("reaches full opacity at similarity 1", () => {
    expect(nodeOpacity(1, ROMANCE_THRESHOLD)).toBeCloseTo(1, 10);
  });

  it("is monotonically non-decreasing in similarity", () => {
    let previous = -1;
    for (let s = ROMANCE_THRESHOLD; s <= 1.0001; s += 0.02) {
      const value = nodeOpacity(Math.min(1, s), ROMANCE_THRESHOLD);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });
});

describe("edge stroke mapping", () => {
  it("scales width and opacity with similarity", () => {
    expect(edgeStrokeWidth(0)).toBeCloseTo(1, 10);
    expect(edgeStrokeWidth(1)).toBeCloseTo(2.6, 10);
    expect(edgeStrokeOpacity(0)).toBeCloseTo(0.18, 10);
    expect(edgeStrokeOpacity(1)).toBeCloseTo(0.72, 10);
  });

  it("never exceeds full opacity, so lines stay under the sprites", () => {
    expect(edgeStrokeOpacity(1)).toBeLessThan(1);
  });

  it("clamps out-of-range similarity", () => {
    expect(edgeStrokeWidth(-3)).toBeCloseTo(1, 10);
    expect(edgeStrokeWidth(9)).toBeCloseTo(2.6, 10);
  });
});

describe("round2 / distance", () => {
  it("rounds to two decimals", () => {
    expect(round2(1.23456)).toBe(1.23);
    expect(round2(-1.236)).toBe(-1.24);
    expect(round2(0)).toBe(0);
  });

  it("computes euclidean distance", () => {
    expect(distance(0, 0, 3, 4)).toBe(5);
    expect(distance(2, 2, 2, 2)).toBe(0);
  });
});

// ─── Copy + formatting ───────────────────────────────────────────────────────

describe("formatAffinityPercent", () => {
  it("turns a raw similarity into an integer percent string", () => {
    expect(formatAffinityPercent(0.873)).toBe("87");
    expect(formatAffinityPercent(1)).toBe("100");
    expect(formatAffinityPercent(0)).toBe("0");
  });

  it("clamps out-of-range values", () => {
    expect(formatAffinityPercent(4)).toBe("100");
    expect(formatAffinityPercent(-4)).toBe("0");
  });
});

describe("trackNoun", () => {
  it("returns the es-MX wording used inside sentences", () => {
    expect(trackNoun("romance")).toBe("romance");
    expect(trackNoun("amistad")).toBe("amistad");
  });
});

describe("matchAriaLabel", () => {
  it("matches the documented accessible-name shape exactly", () => {
    expect(matchAriaLabel("Ajolotito", "azul", 0.87, "romance")).toBe(
      "Ajolotito azul, 87 % de afinidad en romance",
    );
  });

  it("drops an empty colour name without leaving a double space", () => {
    expect(matchAriaLabel("Lobito", "  ", 0.912, "amistad")).toBe(
      "Lobito, 91 % de afinidad en amistad",
    );
  });
});

describe("selfAriaLabel", () => {
  it("names the centred node as the user", () => {
    expect(selfAriaLabel("Ajolotito", "rosa pastel", "Mar")).toBe(
      "Mar, Ajolotito rosa pastel, tú, el centro de tu constelación",
    );
  });

  it("omits a missing alias cleanly", () => {
    expect(selfAriaLabel("Ajolotito", "rosa pastel", "  ")).toBe(
      "Ajolotito rosa pastel, tú, el centro de tu constelación",
    );
  });
});

describe("connectionsLabel", () => {
  it("pluralises in es-MX", () => {
    expect(connectionsLabel(1)).toBe("1 conexión");
    expect(connectionsLabel(0)).toBe("0 conexiones");
    expect(connectionsLabel(7)).toBe("7 conexiones");
  });
});

describe("sliceBadges", () => {
  const badges = [
    makeBadge("d", 0.7),
    makeBadge("a", 0.95),
    makeBadge("c", 0.8),
    makeBadge("b", 0.95),
    makeBadge("e", 0.6),
    makeBadge("f", 0.5),
    makeBadge("g", 0.4),
  ];

  it("caps romance at 5 and amistad at 3", () => {
    expect(sliceBadges(badges, "romance")).toHaveLength(5);
    expect(sliceBadges(badges, "amistad")).toHaveLength(3);
  });

  it("sorts by affinity descending", () => {
    const affinities = sliceBadges(badges, "romance").map((badge) => badge.affinity);
    expect(affinities).toEqual([...affinities].sort((a, b) => b - a));
  });

  it("breaks ties by original order (stable)", () => {
    const top = sliceBadges(badges, "romance").slice(0, 2);
    expect(top.map((badge) => badge.dimension)).toEqual(["a", "b"]);
  });

  it("never mutates the input array", () => {
    const input = [...badges];
    sliceBadges(input, "romance");
    expect(input.map((badge) => badge.dimension)).toEqual(badges.map((badge) => badge.dimension));
  });

  it("returns fewer badges when there are not enough", () => {
    expect(sliceBadges([makeBadge("a", 0.9)], "romance")).toHaveLength(1);
    expect(sliceBadges([], "amistad")).toHaveLength(0);
  });
});

// ─── Graph helpers ───────────────────────────────────────────────────────────

describe("edgeKey", () => {
  it("is order independent", () => {
    expect(edgeKey("a", "b")).toBe(edgeKey("b", "a"));
  });

  it("distinguishes different pairs", () => {
    expect(edgeKey("a", "b")).not.toBe(edgeKey("a", "c"));
  });

  it("uses a printable separator safe for DOM attributes and React keys", () => {
    expect(edgeKey("a", "b")).toBe("a::b");
    for (const character of edgeKey("x", "y")) {
      expect(character.charCodeAt(0)).toBeGreaterThanOrEqual(32);
    }
  });
});

describe("activeNodeIds / pruneInactiveNodes", () => {
  const self = makeNode("me", { isSelf: true, radius: 24 });
  const kept = makeNode("kept", { x: 10, y: 10 });
  const orphan = makeNode("orphan", { x: 20, y: 20 });
  const ghost = makeNode("ghost-1", { isGhost: true });
  const state = makeState([self, kept, orphan, ghost], [makeEdge("me", "kept", 0.9)]);

  it("keeps self, ghosts and every edge endpoint", () => {
    const ids = activeNodeIds(state);
    expect(ids.has("me")).toBe(true);
    expect(ids.has("kept")).toBe(true);
    expect(ids.has("ghost-1")).toBe(true);
    expect(ids.has("orphan")).toBe(false);
  });

  it("removes nodes that lost every edge", () => {
    const pruned = pruneInactiveNodes(state);
    expect(pruned.nodes.map((node) => node.id)).toEqual(["me", "kept", "ghost-1"]);
  });

  it("returns the same object when nothing has to go", () => {
    const alreadyClean = makeState([self, kept], [makeEdge("me", "kept", 0.9)]);
    expect(pruneInactiveNodes(alreadyClean)).toBe(alreadyClean);
  });

  it("never mutates the input state", () => {
    pruneInactiveNodes(state);
    expect(state.nodes).toHaveLength(4);
  });

  it("keeps edges untouched", () => {
    expect(pruneInactiveNodes(state).edges).toEqual(state.edges);
  });
});

describe("capturePositions / applyCachedPositions", () => {
  it("round-trips positions through a cache", () => {
    const original = makeState(
      [makeNode("a", { x: 1, y: 2 }), makeNode("b", { x: 3, y: 4 })],
      [],
    );
    const cache = capturePositions(original);
    const moved = makeState(
      [makeNode("a", { x: 99, y: 99 }), makeNode("b", { x: 99, y: 99 })],
      [],
    );
    const restored = applyCachedPositions(moved, cache);
    expect(restored.nodes.map((node) => [node.x, node.y])).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it("returns the same object for an empty cache", () => {
    const state = makeState([makeNode("a")], []);
    expect(applyCachedPositions(state, new Map())).toBe(state);
  });

  it("returns the same object when nothing actually moved", () => {
    const state = makeState([makeNode("a", { x: 5, y: 6 })], []);
    const cache = capturePositions(state);
    expect(applyCachedPositions(state, cache)).toBe(state);
  });

  it("leaves unknown ids alone (newly re-added matches)", () => {
    const cache = capturePositions(makeState([makeNode("a", { x: 5, y: 6 })], []));
    const state = makeState([makeNode("a", { x: 0, y: 0 }), makeNode("new", { x: 7, y: 8 })], []);
    const restored = applyCachedPositions(state, cache);
    expect(restored.nodes[1]).toEqual(state.nodes[1]);
    expect(restored.nodes[0]?.x).toBe(5);
  });
});

describe("buildAdjacency", () => {
  it("is symmetric and de-duplicated", () => {
    const adjacency = buildAdjacency([
      makeEdge("me", "a", 0.9),
      makeEdge("me", "b", 0.85),
      makeEdge("a", "b", 0.82),
    ]);
    expect(adjacency.get("me")?.sort()).toEqual(["a", "b"]);
    expect(adjacency.get("a")?.sort()).toEqual(["b", "me"]);
    expect(adjacency.get("b")?.sort()).toEqual(["a", "me"]);
  });

  it("returns an empty map for no edges", () => {
    expect(buildAdjacency([]).size).toBe(0);
  });

  it("does not duplicate a repeated edge", () => {
    const adjacency = buildAdjacency([makeEdge("me", "a", 0.9), makeEdge("a", "me", 0.9)]);
    expect(adjacency.get("me")).toEqual(["a"]);
  });
});

describe("selectRenderEdges", () => {
  const spokes = Array.from({ length: 10 }, (_, i) =>
    makeEdge("me", `m${i}`, 0.9 - i * 0.001),
  );
  const pairs: ConstellationEdge[] = [];
  for (let i = 0; i < 10; i++) {
    for (let j = i + 1; j < 10; j++) {
      pairs.push(makeEdge(`m${i}`, `m${j}`, 0.81 + ((i + j) % 5) * 0.01));
    }
  }
  const all = [...spokes, ...pairs];

  it("returns everything (a copy) when under the cap", () => {
    const small = all.slice(0, 5);
    const result = selectRenderEdges(small, "me", MAX_RENDERED_EDGES);
    expect(result).toEqual(small);
    expect(result).not.toBe(small);
  });

  it("caps the result at maxEdges", () => {
    expect(selectRenderEdges(all, "me", 20)).toHaveLength(20);
  });

  it("always keeps every self spoke before any match↔match link", () => {
    const result = selectRenderEdges(all, "me", 20);
    const firstPairIndex = result.findIndex(
      (edge) => edge.source !== "me" && edge.target !== "me",
    );
    expect(firstPairIndex).toBe(spokes.length);
  });

  it("prefers the strongest links within each group", () => {
    const result = selectRenderEdges(all, "me", 14);
    const keptPairs = result.filter((edge) => edge.source !== "me");
    const keptMin = Math.min(...keptPairs.map((edge) => edge.similarity));
    const droppedMax = Math.max(
      ...pairs.filter((edge) => !keptPairs.includes(edge)).map((edge) => edge.similarity),
    );
    expect(keptMin).toBeGreaterThanOrEqual(droppedMax);
  });

  it("is deterministic across repeated calls", () => {
    const a = selectRenderEdges(all, "me", 25).map((edge) => edgeKey(edge.source, edge.target));
    const b = selectRenderEdges(all, "me", 25).map((edge) => edgeKey(edge.source, edge.target));
    expect(a).toEqual(b);
  });

  it("handles a zero cap and an empty list", () => {
    expect(selectRenderEdges(all, "me", 0)).toEqual([]);
    expect(selectRenderEdges([], "me", 10)).toEqual([]);
  });
});

// ─── Join spark geometry ─────────────────────────────────────────────────────

describe("heartRects", () => {
  const rects = heartRects();

  it("is memoised", () => {
    expect(heartRects()).toBe(rects);
  });

  it("covers exactly the filled cells of the 7×6 heart", () => {
    const rows = [".xx.xx.", "xxxxxxx", "xxxxxxx", ".xxxxx.", "..xxx..", "...x..."];
    const expected = rows.reduce((total, row) => total + row.split("").filter((c) => c === "x").length, 0);
    const covered = rects.reduce((total, rect) => total + rect.w, 0);
    expect(covered).toBe(expected);
  });

  it("is centred on the origin", () => {
    const minX = Math.min(...rects.map((rect) => rect.x));
    const maxX = Math.max(...rects.map((rect) => rect.x + rect.w));
    const minY = Math.min(...rects.map((rect) => rect.y));
    const maxY = Math.max(...rects.map((rect) => rect.y + 1));
    expect(minX + maxX).toBeCloseTo(0, 10);
    expect(minY + maxY).toBeCloseTo(0, 10);
  });

  it("uses both node colours", () => {
    const indices = new Set(rects.map((rect) => rect.colorIndex));
    expect(indices.has(0)).toBe(true);
    expect(indices.has(1)).toBe(true);
  });

  it("emits whole-unit rows only", () => {
    for (const rect of rects) expect(rect.w).toBeGreaterThan(0);
  });
});

// ─── Coordinate conversion ───────────────────────────────────────────────────

describe("clientToViewBox", () => {
  const rect = { left: 100, top: 50, width: 450, height: 310 };

  it("is the identity when the viewBox matches the box", () => {
    expect(clientToViewBox(rect, 450, 310, 100, 50)).toEqual({ x: 0, y: 0 });
    expect(clientToViewBox(rect, 450, 310, 325, 205)).toEqual({ x: 225, y: 155 });
  });

  it("scales when the viewBox differs from the box", () => {
    const point = clientToViewBox(rect, 900, 620, 325, 205);
    expect(point.x).toBeCloseTo(450, 10);
    expect(point.y).toBeCloseTo(310, 10);
  });

  it("never divides by zero", () => {
    const zero = { left: 0, top: 0, width: 0, height: 0 };
    expect(clientToViewBox(zero, 900, 620, 10, 20)).toEqual({ x: 10, y: 20 });
  });
});

// ─── Data key + track filtering ──────────────────────────────────────────────

describe("buildDataKey", () => {
  const matches = [makeMatch("a", 0.9, "romance"), makeMatch("b", 0.8, "amistad")];

  it("is stable across fresh object identities", () => {
    const again = [makeMatch("a", 0.9, "romance"), makeMatch("b", 0.8, "amistad")];
    expect(buildDataKey({ ...SELF }, again)).toBe(buildDataKey(SELF, matches));
  });

  it("changes when a similarity changes", () => {
    const changed = [makeMatch("a", 0.91, "romance"), makeMatch("b", 0.8, "amistad")];
    expect(buildDataKey(SELF, changed)).not.toBe(buildDataKey(SELF, matches));
  });

  it("changes when a track changes", () => {
    const changed = [makeMatch("a", 0.9, "amistad"), makeMatch("b", 0.8, "amistad")];
    expect(buildDataKey(SELF, changed)).not.toBe(buildDataKey(SELF, matches));
  });

  it("changes when the order changes", () => {
    expect(buildDataKey(SELF, [matches[1]!, matches[0]!])).not.toBe(buildDataKey(SELF, matches));
  });

  it("changes when the user changes", () => {
    expect(buildDataKey({ ...SELF, id: "other" }, matches)).not.toBe(buildDataKey(SELF, matches));
  });
});

describe("matchesForTrack", () => {
  const matches = [
    makeMatch("low", ROMANCE_THRESHOLD, "romance"),
    makeMatch("mid", 0.87, "romance"),
    makeMatch("high", 0.95, "romance"),
    makeMatch("friend", 0.99, "amistad"),
    makeMatch("dup", 0.9, "romance"),
    { ...makeMatch("dup", 0.9, "romance") },
  ];

  it("keeps only the active track", () => {
    const result = matchesForTrack(matches, "romance", ROMANCE_THRESHOLD);
    expect(result.some((match) => match.id === "friend")).toBe(false);
  });

  it("drops matches at or below the threshold", () => {
    const result = matchesForTrack(matches, "romance", ROMANCE_THRESHOLD);
    expect(result.some((match) => match.id === "low")).toBe(false);
  });

  it("de-duplicates by id, keeping the first occurrence", () => {
    const result = matchesForTrack(matches, "romance", ROMANCE_THRESHOLD);
    expect(result.filter((match) => match.id === "dup")).toHaveLength(1);
  });

  it("sorts by similarity descending, then by id", () => {
    const result = matchesForTrack(matches, "romance", ROMANCE_THRESHOLD);
    expect(result.map((match) => match.id)).toEqual(["high", "dup", "mid"]);
  });

  it("returns an empty list for an empty sky", () => {
    expect(matchesForTrack([], "amistad", 0.75)).toEqual([]);
  });

  it("does not mutate the input", () => {
    const input = [...matches];
    matchesForTrack(input, "romance", ROMANCE_THRESHOLD);
    expect(input).toHaveLength(matches.length);
    expect(input.map((match) => match.id)).toEqual(matches.map((match) => match.id));
  });
});
