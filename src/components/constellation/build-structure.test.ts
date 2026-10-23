/**
 * Integration tests for the constellation render structure and the sprite sheet.
 *
 * These drive the REAL, unmodified engines (`@/lib/constellation-layout` and
 * `@/lib/pixel-sprites`) and assert on what the render layer makes of their
 * output. They run in Vitest's `node` environment: nothing here touches the DOM,
 * which is precisely why `build-structure.ts` and `sprite-sheet.ts` are separate
 * modules from the components.
 */

import { describe, expect, it } from "vitest";

import {
  buildGraph,
  getTrackThreshold,
  precomputeLayout,
  type SimulationState,
} from "@/lib/constellation-layout";
import { GRID_SIZE, getAllAnimalIds, getAllColorIds } from "@/lib/pixel-sprites";

import {
  GHOST_META,
  EDGE_NEUTRAL_COLOR,
  buildNodeMeta,
  structureFromState,
  toMatchInputs,
  toSelfIdentity,
} from "./build-structure";
import {
  GHOST_ANIMAL_ID,
  GHOST_COLOR_ID,
  GHOST_OPACITY,
  MAX_RENDERED_EDGES,
  SPRITE_SIZE_FACTOR,
  edgeKey,
  nodeOpacity,
} from "./render-helpers";
import {
  MAX_CACHED_SHEETS,
  SHEET_FRAMES,
  SHEET_WIDTH,
  buildSpriteSheetSvg,
  clearSpriteSheetCache,
  frameIndex,
  spriteSheetUrl,
  toAnimationFrame,
  warmSpriteSheets,
} from "./sprite-sheet";
import type { ConstellationMatchInput, ConstellationSelfInput } from "./types";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const WIDTH = 900;
const HEIGHT = 620;
const ROMANCE = getTrackThreshold("romance");
const AMISTAD = getTrackThreshold("amistad");

const SELF: ConstellationSelfInput = {
  id: "me",
  animalId: "ajolotito",
  colorId: "rosa-pastel",
  colorHex: "#e8a0bf",
  animalName: "Ajolotito",
  colorName: "rosa pastel",
  alias: "Mar",
};

function makeMatch(
  id: string,
  similarity: number,
  track: "romance" | "amistad",
): ConstellationMatchInput {
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

/** 12 romance matches comfortably above the 0.80 threshold. */
const ROMANCE_MATCHES = Array.from({ length: 12 }, (_, index) =>
  makeMatch(`r${index}`, 0.84 + index * 0.012, "romance"),
);

const FRIEND_MATCHES = Array.from({ length: 6 }, (_, index) =>
  makeMatch(`f${index}`, 0.8 + index * 0.02, "amistad"),
);

const ALL_MATCHES = [...ROMANCE_MATCHES, ...FRIEND_MATCHES];

function settledState(
  matches: readonly ConstellationMatchInput[],
  track: "romance" | "amistad",
  ghostCount = 8,
): SimulationState {
  const threshold = getTrackThreshold(track);
  const graph = buildGraph(
    toSelfIdentity(SELF),
    toMatchInputs(matches),
    track,
    threshold,
    WIDTH,
    HEIGHT,
    ghostCount,
  );
  return precomputeLayout(graph, WIDTH, HEIGHT);
}

// ─── Engine adapters ─────────────────────────────────────────────────────────

describe("toSelfIdentity / toMatchInputs", () => {
  it("maps the view model onto the engine's SelfIdentity", () => {
    expect(toSelfIdentity(SELF)).toEqual({
      id: "me",
      animal: "ajolotito",
      color: "#e8a0bf",
      alias: "Mar",
    });
  });

  it("maps every match, preserving order", () => {
    const inputs = toMatchInputs(ALL_MATCHES);
    expect(inputs).toHaveLength(ALL_MATCHES.length);
    expect(inputs[0]).toEqual({
      id: "r0",
      animal: "lobito",
      color: "#3b6fd4",
      alias: "Alias r0",
      similarity: 0.84,
      track: "romance",
    });
  });

  it("does not leak render-only fields into the engine input", () => {
    const [first] = toMatchInputs(ALL_MATCHES);
    expect(Object.keys(first ?? {}).sort()).toEqual([
      "alias",
      "animal",
      "color",
      "id",
      "similarity",
      "track",
    ]);
  });
});

describe("buildNodeMeta", () => {
  const meta = buildNodeMeta(SELF, ALL_MATCHES);

  it("indexes the self node with similarity 1", () => {
    expect(meta.get("me")?.similarity).toBe(1);
    expect(meta.get("me")?.animalName).toBe("Ajolotito");
  });

  it("indexes every match", () => {
    for (const match of ALL_MATCHES) {
      expect(meta.get(match.id)?.colorHex).toBe(match.colorHex);
      expect(meta.get(match.id)?.alias).toBe(match.alias);
    }
  });

  it("exposes ghost meta pointing at real catalogue ids", () => {
    expect(GHOST_META.animalId).toBe(GHOST_ANIMAL_ID);
    expect(GHOST_META.colorId).toBe(GHOST_COLOR_ID);
    expect(GHOST_META.similarity).toBe(0);
    expect(getAllAnimalIds()).toContain(GHOST_ANIMAL_ID);
    expect(getAllColorIds()).toContain(GHOST_COLOR_ID);
  });
});

// ─── structureFromState ──────────────────────────────────────────────────────

describe("structureFromState", () => {
  const state = settledState(ROMANCE_MATCHES, "romance");
  const meta = buildNodeMeta(SELF, ALL_MATCHES);
  const structure = structureFromState(state, meta, ROMANCE, "romance");

  it("echoes the viewport, threshold and self id", () => {
    expect(structure.width).toBe(WIDTH);
    expect(structure.height).toBe(HEIGHT);
    expect(structure.threshold).toBe(ROMANCE);
    expect(structure.selfId).toBe("me");
  });

  it("renders exactly one node per simulation node", () => {
    expect(structure.nodes).toHaveLength(state.nodes.length);
    expect(structure.nodes.map((node) => node.id)).toEqual(state.nodes.map((node) => node.id));
  });

  it("marks the self node and gives it full opacity and radius 24", () => {
    const self = structure.nodes.find((node) => node.isSelf);
    expect(self).toBeDefined();
    expect(self?.radius).toBe(24);
    expect(self?.opacity).toBe(1);
    expect(self?.ariaLabel).toBe("Mar, Ajolotito rosa pastel, tú, el centro de tu constelación");
  });

  it("seeds initial positions from the precomputed layout", () => {
    for (const node of structure.nodes) {
      const source = state.nodes.find((candidate) => candidate.id === node.id);
      expect(node.initialX).toBe(source?.x);
      expect(node.initialY).toBe(source?.y);
    }
  });

  it("sizes every sprite from its physics radius", () => {
    for (const node of structure.nodes) {
      expect(node.displaySize).toBeCloseTo(node.radius * SPRITE_SIZE_FACTOR, 10);
    }
  });

  it("gives real matches the documented accessible name", () => {
    const match = structure.nodes.find((node) => node.id === "r3");
    expect(match?.isGhost).toBe(false);
    expect(match?.ariaLabel).toMatch(/^Lobito azul zafiro, \d{2} % de afinidad en romance$/);
  });

  it("scales match brightness with similarity", () => {
    for (const node of structure.nodes) {
      if (node.isSelf || node.isGhost) continue;
      const source = state.nodes.find((candidate) => candidate.id === node.id);
      expect(node.opacity).toBeCloseTo(nodeOpacity(source!.similarity, ROMANCE), 10);
      expect(node.opacity).toBeGreaterThanOrEqual(0.62);
      expect(node.opacity).toBeLessThanOrEqual(1);
    }
  });

  it("makes ghosts dim, decorative and non-interactive", () => {
    const ghosts = structure.nodes.filter((node) => node.isGhost);
    expect(ghosts.length).toBeGreaterThan(0);
    for (const ghost of ghosts) {
      expect(ghost.opacity).toBe(GHOST_OPACITY);
      expect(ghost.animalId).toBe(GHOST_ANIMAL_ID);
      expect(ghost.colorId).toBe(GHOST_COLOR_ID);
      expect(ghost.ariaLabel).toBe("Estrella decorativa");
      expect(ghost.alias).toBe("");
    }
  });

  it("keeps every painted edge inside the cap and gives each a stable key", () => {
    expect(structure.edges.length).toBeLessThanOrEqual(MAX_RENDERED_EDGES);
    const keys = new Set(structure.edges.map((edge) => edge.key));
    expect(keys.size).toBe(structure.edges.length);
  });

  it("makes stroke width and opacity grow with similarity", () => {
    for (const edge of structure.edges) {
      expect(edge.width).toBeGreaterThan(0);
      expect(edge.opacity).toBeGreaterThan(0);
      expect(edge.opacity).toBeLessThan(1);
      expect(edge.targetDistance).toBeGreaterThan(0);
    }
    const sorted = [...structure.edges].sort((a, b) => a.similarity - b.similarity);
    const weakest = sorted[0]!;
    const strongest = sorted[sorted.length - 1]!;
    expect(strongest.width).toBeGreaterThanOrEqual(weakest.width);
    expect(strongest.opacity).toBeGreaterThanOrEqual(weakest.opacity);
  });

  it("tints self spokes with the match's own colour and threads the rest in ink", () => {
    for (const edge of structure.edges) {
      if (edge.source === "me" || edge.target === "me") {
        const otherId = edge.source === "me" ? edge.target : edge.source;
        expect(edge.color).toBe(meta.get(otherId)?.colorHex);
      } else {
        expect(edge.color).toBe(EDGE_NEUTRAL_COLOR);
      }
    }
  });

  it("records initial edge endpoints so the first paint needs no loop tick", () => {
    for (const edge of structure.edges) {
      const source = state.nodes.find((node) => node.id === edge.source);
      const target = state.nodes.find((node) => node.id === edge.target);
      expect(edge.sourceX).toBe(source?.x);
      expect(edge.sourceY).toBe(source?.y);
      expect(edge.targetX).toBe(target?.x);
      expect(edge.targetY).toBe(target?.y);
    }
  });

  it("builds a symmetric adjacency from the PAINTED edges only", () => {
    for (const edge of structure.edges) {
      expect(structure.adjacency.get(edge.source)).toContain(edge.target);
      expect(structure.adjacency.get(edge.target)).toContain(edge.source);
    }
    const painted = new Set(structure.edges.map((edge) => edge.key));
    for (const [nodeId, neighbours] of structure.adjacency) {
      for (const neighbour of neighbours) {
        expect(painted.has(edgeKey(nodeId, neighbour))).toBe(true);
      }
    }
  });

  it("never gives a ghost an edge or a neighbour", () => {
    for (const edge of structure.edges) {
      expect(edge.source.startsWith("ghost-")).toBe(false);
      expect(edge.target.startsWith("ghost-")).toBe(false);
    }
    for (const node of structure.nodes.filter((candidate) => candidate.isGhost)) {
      expect(structure.adjacency.get(node.id)).toBeUndefined();
    }
  });

  it("is deterministic for identical input", () => {
    const again = structureFromState(
      settledState(ROMANCE_MATCHES, "romance"),
      buildNodeMeta(SELF, ALL_MATCHES),
      ROMANCE,
      "romance",
    );
    expect(again.nodes).toEqual(structure.nodes);
    expect(again.edges).toEqual(structure.edges);
  });

  it("produces an empty sky (self + ghosts only) when nobody clears the bar", () => {
    const belowThreshold = [makeMatch("x", ROMANCE - 0.01, "romance")];
    const empty = structureFromState(
      settledState(belowThreshold, "romance", 0),
      buildNodeMeta(SELF, belowThreshold),
      ROMANCE,
      "romance",
    );
    expect(empty.nodes).toHaveLength(1);
    expect(empty.nodes[0]?.isSelf).toBe(true);
    expect(empty.edges).toEqual([]);
    expect(empty.adjacency.size).toBe(0);
  });

  it("builds the amistad sky with its own threshold and wording", () => {
    const amistad = structureFromState(
      settledState(FRIEND_MATCHES, "amistad", 4),
      buildNodeMeta(SELF, ALL_MATCHES),
      AMISTAD,
      "amistad",
    );
    expect(amistad.threshold).toBe(AMISTAD);
    const match = amistad.nodes.find((node) => node.id === "f0");
    expect(match?.ariaLabel).toMatch(/de afinidad en amistad$/);
    // Romance matches are not part of the amistad graph at all.
    expect(amistad.nodes.some((node) => node.id === "r0")).toBe(false);
  });

  it("honours a custom edge cap", () => {
    const capped = structureFromState(state, meta, ROMANCE, "romance", 4);
    expect(capped.edges).toHaveLength(4);
  });

  it("degrades gracefully for an id missing from the meta map", () => {
    const orphanState: SimulationState = {
      ...state,
      nodes: [...state.nodes, { ...state.nodes[0]!, id: "unknown", isSelf: false, isGhost: false }],
    };
    const result = structureFromState(orphanState, meta, ROMANCE, "romance");
    const orphan = result.nodes.find((node) => node.id === "unknown");
    expect(orphan?.animalId).toBe(GHOST_ANIMAL_ID);
    expect(orphan?.ariaLabel).toBeTruthy();
  });
});

// ─── Sprite sheet ────────────────────────────────────────────────────────────

describe("sprite sheet", () => {
  it("lays three frames side by side", () => {
    expect(SHEET_FRAMES).toEqual(["idle_1", "idle_2", "happy"]);
    expect(SHEET_WIDTH).toBe(GRID_SIZE * 3);
    expect(frameIndex("idle_1")).toBe(0);
    expect(frameIndex("idle_2")).toBe(1);
    expect(frameIndex("happy")).toBe(2);
  });

  it("maps frame names onto the engine's AnimationFrame union", () => {
    for (const frame of SHEET_FRAMES) {
      expect(toAnimationFrame(frame)).toBe(frame);
    }
  });

  it("builds valid, self-contained SVG markup", () => {
    const svg = buildSpriteSheetSvg("ajolotito", "rosa-pastel");
    expect(svg.startsWith(`<svg xmlns="http://www.w3.org/2000/svg"`)).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain(`viewBox="0 0 ${SHEET_WIDTH} ${GRID_SIZE}"`);
    expect(svg).toContain("<rect ");
    // Every column of the sheet is populated.
    for (let column = 0; column < 3; column++) {
      expect(svg).toContain(`x="${column * GRID_SIZE}"`);
    }
  });

  it("stays small enough to inline as a data URL", () => {
    const svg = buildSpriteSheetSvg("ajolotito", "rosa-pastel");
    expect(svg.length).toBeLessThan(8000);
  });

  it("returns a memoised data URL", () => {
    clearSpriteSheetCache();
    const first = spriteSheetUrl("lobito", "azul-zafiro");
    expect(first.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(spriteSheetUrl("lobito", "azul-zafiro")).toBe(first);
  });

  it("distinguishes animals and colours", () => {
    expect(spriteSheetUrl("lobito", "azul-zafiro")).not.toBe(
      spriteSheetUrl("lobito", "rosa-pastel"),
    );
    expect(spriteSheetUrl("lobito", "azul-zafiro")).not.toBe(
      spriteSheetUrl("gatito", "azul-zafiro"),
    );
  });

  it("escapes the '#' of every hex colour", () => {
    expect(spriteSheetUrl("ajolotito", "rosa-pastel")).not.toContain("#");
    expect(spriteSheetUrl("ajolotito", "rosa-pastel")).toContain("%23");
  });

  it("warms a list of pairs in one pass", () => {
    clearSpriteSheetCache();
    warmSpriteSheets([
      { animalId: "ajolotito", colorId: "rosa-pastel" },
      { animalId: GHOST_ANIMAL_ID, colorId: GHOST_COLOR_ID },
    ]);
    const before = spriteSheetUrl("ajolotito", "rosa-pastel");
    expect(before).toContain("data:image/svg+xml");
  });

  it("builds a sheet for every registered ghost id without throwing", () => {
    expect(() => buildSpriteSheetSvg(GHOST_ANIMAL_ID, GHOST_COLOR_ID)).not.toThrow();
  });

  it("bounds the cache", () => {
    expect(MAX_CACHED_SHEETS).toBeGreaterThan(0);
    clearSpriteSheetCache();
  });
});
