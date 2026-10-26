import { describe, expect, it } from "vitest";

import {
  MIN_CENTER_DISTANCE,
  minimumCenterDistance,
  precomputeLayout,
} from "@/lib/constellation-layout";
import type { ConstellationNode } from "@/lib/constellation-layout";

function packedNodes(count: number): ConstellationNode[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `packed-${index}`,
    x: 600,
    y: 450,
    vx: 0,
    vy: 0,
    radius: 28,
    isSelf: false,
    animal: "ajolotito",
    color: "#c7e879",
    alias: `nodo ${index}`,
    similarity: 0.9,
    track: "amistad" as const,
    isGhost: false,
  }));
}

describe("rigid circle packing", () => {
  it("separates 30 identical-radius nodes to at least 56 px", () => {
    const nodes = packedNodes(30);
    const final = precomputeLayout({ nodes, edges: [], clusters: [] }, 1200, 900);

    for (let first = 0; first < final.nodes.length; first += 1) {
      for (let second = first + 1; second < final.nodes.length; second += 1) {
        const a = final.nodes[first]!;
        const b = final.nodes[second]!;
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        expect(
          distance,
          `${a.id} vs ${b.id}: ${distance.toFixed(4)} < ${minimumCenterDistance(a, b).toFixed(4)}`,
        ).toBeGreaterThanOrEqual(minimumCenterDistance(a, b) - 1e-6);
      }
    }

    for (const node of final.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(40);
      expect(node.x).toBeLessThanOrEqual(1160);
      expect(node.y).toBeGreaterThanOrEqual(40);
      expect(node.y).toBeLessThanOrEqual(860);
    }
    expect(MIN_CENTER_DISTANCE).toBeGreaterThanOrEqual(56);
  });
});
