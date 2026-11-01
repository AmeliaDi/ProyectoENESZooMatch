/**
 * Integration tests for the constellation render structure and the sprite
 * sheet. They drive the real physics (`@/domain/constellation`) and sprite
 * engines and assert on what the render layer makes of their output.
 */

import { describe, expect, it } from "vitest";

import { PHYSICS } from "@/config";
import { GRID_SIZE, getAllAnimalIds, getAllColorIds } from "@/domain/avatars/pixel-sprites";
import { buildScene, createWorld, getTrackThreshold, settle, type World } from "@/domain/constellation";

import {
  EDGE_NEUTRAL_COLOR,
  GHOST_META,
  buildNodeMeta,
  structureFromWorld,
  toSceneMatches,
} from "./build-structure";
import {
  GHOST_ANIMAL_ID,
  GHOST_COLOR_ID,
  GHOST_OPACITY,
  SPRITE_SIZE_FACTOR,
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
    chemistry: null,
    explanation: null,
  };
}

const ROMANCE_MATCHES = Array.from({ length: 12 }, (_, i) => makeMatch(`r${i}`, 0.84 + i * 0.012, "romance"));
const FRIEND_MATCHES = Array.from({ length: 6 }, (_, i) => makeMatch(`f${i}`, 0.8 + i * 0.02, "amistad"));
const ALL_MATCHES = [...ROMANCE_MATCHES, ...FRIEND_MATCHES];

function settledWorld(
  matches: readonly ConstellationMatchInput[],
  track: "romance" | "amistad",
  ghostCount = 8,
): World {
  const scene = buildScene(
    {
      selfId: SELF.id,
      matches: toSceneMatches(matches),
      track,
      threshold: getTrackThreshold(track),
      width: WIDTH,
      height: HEIGHT,
      ghostCount,
    },
    PHYSICS,
  );
  return settle(createWorld(scene, PHYSICS, "settled"), PHYSICS);
}

describe("toSceneMatches", () => {
  it("passes only id, similarity and track to the physics (no names, no PII)", () => {
    const [first] = toSceneMatches(ALL_MATCHES);
    expect(first).toEqual({ id: "r0", similarity: 0.84, track: "romance" });
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
    expect(getAllAnimalIds()).toContain(GHOST_ANIMAL_ID);
    expect(getAllColorIds()).toContain(GHOST_COLOR_ID);
  });
});

describe("structureFromWorld", () => {
  const world = settledWorld(ROMANCE_MATCHES, "romance");
  const meta = buildNodeMeta(SELF, ALL_MATCHES);
  const structure = structureFromWorld(world, meta, "romance");

  it("echoes the viewport, threshold and self id", () => {
    expect(structure.width).toBe(WIDTH);
    expect(structure.height).toBe(HEIGHT);
    expect(structure.threshold).toBe(ROMANCE);
    expect(structure.selfId).toBe("me");
  });

  it("renders exactly one node per body, seeded at its position", () => {
    expect(structure.nodes.map((n) => n.id)).toEqual(world.bodies.map((b) => b.id));
    structure.nodes.forEach((node, i) => {
      expect(node.initialX).toBe(world.bodies[i]!.x);
      expect(node.initialY).toBe(world.bodies[i]!.y);
    });
  });

  it("marks the self node with full opacity and its accessible name", () => {
    const self = structure.nodes.find((n) => n.isSelf);
    expect(self?.opacity).toBe(1);
    expect(self?.ariaLabel).toBe("Mar, Ajolotito rosa pastel, tú, el centro de tu constelación");
  });

  it("sizes every sprite from its display radius", () => {
    for (const node of structure.nodes) expect(node.displaySize).toBeCloseTo(node.radius * SPRITE_SIZE_FACTOR, 10);
  });

  it("names real matches as an estimated affinity", () => {
    const match = structure.nodes.find((n) => n.id === "r3");
    expect(match?.ariaLabel).toMatch(/^Lobito azul zafiro, \d{2} % de afinidad estimada en romance$/);
  });

  it("scales match brightness with similarity", () => {
    for (const node of structure.nodes) {
      if (node.isSelf || node.isGhost) continue;
      const similarity = meta.get(node.id)!.similarity;
      expect(node.opacity).toBeCloseTo(nodeOpacity(similarity, ROMANCE), 10);
    }
  });

  it("makes ghosts dim and decorative", () => {
    const ghosts = structure.nodes.filter((n) => n.isGhost);
    expect(ghosts.length).toBeGreaterThan(0);
    for (const ghost of ghosts) {
      expect(ghost.opacity).toBe(GHOST_OPACITY);
      expect(ghost.animalId).toBe(GHOST_ANIMAL_ID);
      expect(ghost.alias).toBe("");
    }
  });

  it("gives every line a unique key and tints spokes with the match colour", () => {
    expect(new Set(structure.edges.map((e) => e.key)).size).toBe(structure.edges.length);
    for (const edge of structure.edges) {
      if (edge.kind === "spoke") {
        const other = edge.source === "me" ? edge.target : edge.source;
        expect(edge.color).toBe(meta.get(other)?.colorHex);
      } else {
        expect(edge.color).toBe(EDGE_NEUTRAL_COLOR);
      }
    }
  });

  it("builds a symmetric adjacency that never touches ghosts", () => {
    for (const edge of structure.edges) {
      expect(structure.adjacency.get(edge.source)).toContain(edge.target);
      expect(structure.adjacency.get(edge.target)).toContain(edge.source);
    }
    for (const ghost of structure.nodes.filter((n) => n.isGhost)) {
      expect(structure.adjacency.get(ghost.id)).toBeUndefined();
    }
  });

  it("exposes the detected groups", () => {
    expect(structure.groups).toEqual(world.groups.map((g) => g.ids));
  });

  it("is deterministic for identical input", () => {
    const again = structureFromWorld(settledWorld(ROMANCE_MATCHES, "romance"), buildNodeMeta(SELF, ALL_MATCHES), "romance");
    expect(again.nodes).toEqual(structure.nodes);
    expect(again.edges).toEqual(structure.edges);
  });

  it("produces a lonely sky when nobody clears the bar", () => {
    const below = [makeMatch("x", ROMANCE - 0.01, "romance")];
    const empty = structureFromWorld(settledWorld(below, "romance", 0), buildNodeMeta(SELF, below), "romance");
    expect(empty.nodes).toHaveLength(1);
    expect(empty.nodes[0]?.isSelf).toBe(true);
    expect(empty.edges).toEqual([]);
  });

  it("builds the amistad sky with its own threshold and wording", () => {
    const amistad = structureFromWorld(settledWorld(FRIEND_MATCHES, "amistad", 4), buildNodeMeta(SELF, ALL_MATCHES), "amistad");
    expect(amistad.threshold).toBe(AMISTAD);
    expect(amistad.nodes.find((n) => n.id === "f0")?.ariaLabel).toMatch(/de afinidad estimada en amistad$/);
    expect(amistad.nodes.some((n) => n.id === "r0")).toBe(false);
  });
});

// ─── Sprite sheet ────────────────────────────────────────────────────────────

describe("sprite sheet", () => {
  it("lays four frames side by side", () => {
    expect(SHEET_FRAMES).toEqual(["idle_1", "idle_2", "happy", "romance_pulse"]);
    expect(SHEET_WIDTH).toBe(GRID_SIZE * 4);
    expect(frameIndex("idle_1")).toBe(0);
    expect(frameIndex("idle_2")).toBe(1);
    expect(frameIndex("happy")).toBe(2);
    expect(frameIndex("romance_pulse")).toBe(3);
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
    for (let column = 0; column < SHEET_FRAMES.length; column++) {
      expect(svg).toContain(`x="${column * GRID_SIZE}"`);
    }
  });

  it("stays small enough to inline as a data URL", () => {
    const svg = buildSpriteSheetSvg("ajolotito", "rosa-pastel");
    // The original 12×12 budget (12 000 chars) scaled by grid area.
    expect(svg.length).toBeLessThan((12_000 * GRID_SIZE * GRID_SIZE) / (12 * 12));
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
