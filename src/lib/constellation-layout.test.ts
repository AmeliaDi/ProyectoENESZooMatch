import { describe, expect, it } from "vitest";

import {
  DEFAULT_DISTANCE_CONFIG,
  DEFAULT_SIMULATION_PARAMS,
  buildGraph,
  createSimulationState,
  detectClusters,
  dragNode,
  generateGhostNodes,
  getTrackThreshold,
  hashSeed,
  precomputeLayout,
  releaseNode,
  seededRandom,
  similarityToDistance,
  stepSimulation,
  switchTrack,
} from "@/lib/constellation-layout";
import type {
  ConstellationEdge,
  ConstellationGraph,
  ConstellationNode,
  MatchInput,
  MatchTrack,
  SimulationState,
} from "@/lib/constellation-layout";

// ─── Fixtures (all deterministic — no Math.random, no Date.now) ──────────────

const VIEWPORT_W = 800;
const VIEWPORT_H = 600;

const ME = { id: "me-001", animal: "ajolotito", color: "#ff77aa", alias: "Yo" };

const ROMANCE_THRESHOLD = getTrackThreshold("romance"); // 0.80 from config
const AMISTAD_THRESHOLD = getTrackThreshold("amistad"); // 0.75 from config

function makeMatch(
  id: string,
  similarity: number,
  track: MatchTrack = "amistad",
): MatchInput {
  return { id, animal: `animal-${id}`, color: "#66ccff", alias: `Alias ${id}`, similarity, track };
}

const MATCHES: MatchInput[] = [
  makeMatch("m-high", 0.95),
  makeMatch("m-mid", 0.85),
  makeMatch("m-low", 0.78),
  makeMatch("m-below", 0.70), // below amistad threshold → node, no edge
  makeMatch("m-romance", 0.92, "romance"), // different track → excluded
];

function makeNode(id: string, x: number, y: number, overrides: Partial<ConstellationNode> = {}): ConstellationNode {
  return {
    id,
    x,
    y,
    vx: 0,
    vy: 0,
    radius: 16,
    isSelf: false,
    animal: "test",
    color: "#ffffff",
    alias: id,
    similarity: 0.9,
    track: "amistad",
    isGhost: false,
    ...overrides,
  };
}

function makeEdge(source: string, target: string, similarity: number, targetDistance = 100): ConstellationEdge {
  return { source, target, similarity, targetDistance };
}

function makeGraph(nodes: ConstellationNode[], edges: ConstellationEdge[]): ConstellationGraph {
  const graph: ConstellationGraph = { nodes, edges, clusters: [] };
  graph.clusters = detectClusters(graph);
  return graph;
}

function runSteps(state: SimulationState, steps: number): SimulationState {
  let s = state;
  for (let i = 0; i < steps; i++) s = stepSimulation(s, 1);
  return s;
}

function distanceBetween(state: SimulationState, a: string, b: string): number {
  const na = state.nodes.find((n) => n.id === a)!;
  const nb = state.nodes.find((n) => n.id === b)!;
  return Math.hypot(nb.x - na.x, nb.y - na.y);
}

// ─── getTrackThreshold ────────────────────────────────────────────────────────

describe("getTrackThreshold", () => {
  it("reads romance threshold from matching-config-v2.json", () => {
    expect(ROMANCE_THRESHOLD).toBe(0.8);
  });

  it("reads amistad threshold from matching-config-v2.json", () => {
    expect(AMISTAD_THRESHOLD).toBe(0.75);
  });
});

// ─── similarityToDistance ─────────────────────────────────────────────────────

describe("similarityToDistance", () => {
  it("is monotonically decreasing as similarity grows", () => {
    const sims = [0.76, 0.8, 0.85, 0.9, 0.95, 1.0];
    const distances = sims.map((s) => similarityToDistance(s, 0.75)!);
    distances.forEach((d) => expect(typeof d).toBe("number"));
    for (let i = 1; i < distances.length; i++) {
      expect(distances[i]).toBeLessThan(distances[i - 1]);
    }
  });

  it("returns null below the threshold", () => {
    expect(similarityToDistance(0.74, 0.75)).toBeNull();
  });

  it("returns null exactly at the threshold (STRICTLY greater required)", () => {
    expect(similarityToDistance(0.75, 0.75)).toBeNull();
  });

  it("returns a distance close to maxDist just above the threshold", () => {
    const d = similarityToDistance(0.751, 0.75)!;
    expect(d).not.toBeNull();
    expect(Math.abs(d - DEFAULT_DISTANCE_CONFIG.maxDist)).toBeLessThan(1);
  });

  it("returns exactly minDist at similarity 1.0", () => {
    expect(similarityToDistance(1.0, 0.75)).toBe(DEFAULT_DISTANCE_CONFIG.minDist);
  });

  it("respects custom minDist/maxDist config", () => {
    expect(similarityToDistance(1.0, 0.5, { minDist: 10, maxDist: 100 })).toBe(10);
    const justAbove = similarityToDistance(0.51, 0.5, { minDist: 10, maxDist: 100 })!;
    expect(justAbove).toBeLessThanOrEqual(100);
    expect(justAbove).toBeGreaterThan(90);
  });
});

// ─── hashSeed + seededRandom ──────────────────────────────────────────────────

describe("hashSeed", () => {
  it("is deterministic: same input → same output", () => {
    expect(hashSeed("zoomatch")).toBe(hashSeed("zoomatch"));
  });

  it("produces different hashes for different strings", () => {
    expect(hashSeed("ajolote")).not.toBe(hashSeed("ajolota"));
    expect(hashSeed("a")).not.toBe(hashSeed("b"));
  });

  it("returns unsigned 32-bit integers", () => {
    for (const s of ["", "x", "user-123", "🦎 lagartija"]) {
      const h = hashSeed(s);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(0xffffffff);
    }
  });
});

describe("seededRandom", () => {
  it("is deterministic: same seed → same sequence", () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    for (let i = 0; i < 20; i++) expect(a()).toBe(b());
  });

  it("produces values in [0, 1)", () => {
    const rand = seededRandom(hashSeed("distribution-check"));
    for (let i = 0; i < 1000; i++) {
      const v = rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("produces different sequences for different seeds", () => {
    const a = seededRandom(1);
    const b = seededRandom(2);
    expect(a()).not.toBe(b());
  });
});

// ─── buildGraph ───────────────────────────────────────────────────────────────

describe("buildGraph", () => {
  const graph = buildGraph(ME, MATCHES, "amistad", AMISTAD_THRESHOLD, VIEWPORT_W, VIEWPORT_H, 4);

  it("creates the correct node count: me + filtered matches + ghosts", () => {
    // me (1) + above-threshold amistad matches (3: m-high, m-mid, m-low) + ghosts (4).
    // m-below (0.70) is under the 0.75 threshold so it is not a match → no node.
    expect(graph.nodes.length).toBe(8);
    expect(graph.nodes.filter((n) => !n.isGhost && !n.isSelf).length).toBe(3);
  });

  it("places exactly one self node at the viewport center", () => {
    const selfNodes = graph.nodes.filter((n) => n.isSelf);
    expect(selfNodes.length).toBe(1);
    expect(selfNodes[0].id).toBe(ME.id);
    expect(selfNodes[0].x).toBe(VIEWPORT_W / 2);
    expect(selfNodes[0].y).toBe(VIEWPORT_H / 2);
    expect(selfNodes[0].radius).toBe(24);
  });

  it("only creates edges with similarity strictly above the threshold", () => {
    expect(graph.edges.length).toBeGreaterThan(0);
    for (const e of graph.edges) {
      expect(e.similarity).toBeGreaterThan(AMISTAD_THRESHOLD);
      expect(e.targetDistance).toBeGreaterThan(0);
    }
  });

  it("excludes below-threshold matches as nodes (they are not matches)", () => {
    // m-below (0.70 <= 0.75) is not a match → neither a node nor an edge.
    expect(graph.nodes.some((n) => n.id === "m-below")).toBe(false);
    expect(graph.edges.some((e) => e.source === "m-below" || e.target === "m-below")).toBe(false);
  });

  it("uses the real similarity for self↔match edges (symmetric, consistent)", () => {
    const selfToHigh = graph.edges.find(
      (e) =>
        (e.source === ME.id && e.target === "m-high") ||
        (e.source === "m-high" && e.target === ME.id),
    );
    expect(selfToHigh).toBeDefined();
    expect(selfToHigh!.similarity).toBe(0.95);
    // No duplicate/reversed edge for the same pair.
    const pairEdges = graph.edges.filter(
      (e) =>
        (e.source === ME.id && e.target === "m-high") ||
        (e.source === "m-high" && e.target === ME.id),
    );
    expect(pairEdges.length).toBe(1);
  });

  it("excludes matches from other tracks", () => {
    expect(graph.nodes.some((n) => n.id === "m-romance")).toBe(false);
  });

  it("creates the requested ghost count, all isGhost, none with edges", () => {
    const ghosts = graph.nodes.filter((n) => n.isGhost);
    expect(ghosts.length).toBe(4);
    for (const g of ghosts) {
      expect(g.isGhost).toBe(true);
      expect(g.similarity).toBe(0);
      expect(graph.edges.some((e) => e.source === g.id || e.target === g.id)).toBe(false);
    }
  });

  it("scales match node radius with similarity (base 12, scale 8)", () => {
    const high = graph.nodes.find((n) => n.id === "m-high")!;
    const low = graph.nodes.find((n) => n.id === "m-low")!;
    expect(high.radius).toBeCloseTo(12 + 0.95 * 8, 10);
    expect(low.radius).toBeCloseTo(12 + 0.78 * 8, 10);
  });

  it("is deterministic: same inputs → deep-equal graph", () => {
    const again = buildGraph(ME, MATCHES, "amistad", AMISTAD_THRESHOLD, VIEWPORT_W, VIEWPORT_H, 4);
    expect(again).toEqual(graph);
  });

  it("handles empty matches (self + ghosts only)", () => {
    const g = buildGraph(ME, [], "romance", ROMANCE_THRESHOLD, VIEWPORT_W, VIEWPORT_H, 0);
    expect(g.nodes.length).toBe(1);
    expect(g.edges.length).toBe(0);
    expect(g.clusters.length).toBe(0);
  });
});

// ─── detectClusters ───────────────────────────────────────────────────────────

describe("detectClusters", () => {
  it("detects a triangle of 3 mutually connected nodes as 1 cluster", () => {
    const graph = makeGraph(
      [makeNode("a", 100, 100), makeNode("b", 200, 100), makeNode("c", 150, 200)],
      [makeEdge("a", "b", 0.9), makeEdge("b", "c", 0.85), makeEdge("a", "c", 0.88)],
    );
    const clusters = detectClusters(graph);
    expect(clusters.length).toBe(1);
    expect(clusters[0].nodeIds.sort()).toEqual(["a", "b", "c"]);
  });

  it("returns no cluster for a mere pair (needs 3+)", () => {
    const graph = makeGraph(
      [makeNode("a", 100, 100), makeNode("b", 200, 100)],
      [makeEdge("a", "b", 0.9)],
    );
    expect(detectClusters(graph)).toEqual([]);
  });

  it("detects two separate triangles as 2 clusters", () => {
    const graph = makeGraph(
      [
        makeNode("a", 100, 100),
        makeNode("b", 200, 100),
        makeNode("c", 150, 200),
        makeNode("d", 500, 400),
        makeNode("e", 600, 400),
        makeNode("f", 550, 500),
      ],
      [
        makeEdge("a", "b", 0.9),
        makeEdge("b", "c", 0.9),
        makeEdge("a", "c", 0.9),
        makeEdge("d", "e", 0.8),
        makeEdge("e", "f", 0.8),
        makeEdge("d", "f", 0.8),
      ],
    );
    const clusters = detectClusters(graph);
    expect(clusters.length).toBe(2);
    const signatures = clusters.map((c) => [...c.nodeIds].sort().join("")).sort();
    expect(signatures).toEqual(["abc", "def"]);
  });

  it("expands a K4 into a single 4-node cluster", () => {
    const nodes = [
      makeNode("a", 0, 0),
      makeNode("b", 10, 0),
      makeNode("c", 0, 10),
      makeNode("d", 10, 10),
    ];
    const edges = [
      makeEdge("a", "b", 0.9),
      makeEdge("a", "c", 0.9),
      makeEdge("a", "d", 0.9),
      makeEdge("b", "c", 0.9),
      makeEdge("b", "d", 0.9),
      makeEdge("c", "d", 0.9),
    ];
    const clusters = detectClusters(makeGraph(nodes, edges));
    expect(clusters.length).toBe(1);
    expect(clusters[0].nodeIds.length).toBe(4);
  });

  it("computes the centroid as the average of member positions", () => {
    const graph = makeGraph(
      [makeNode("a", 90, 120), makeNode("b", 210, 120), makeNode("c", 150, 210)],
      [makeEdge("a", "b", 0.9), makeEdge("b", "c", 0.9), makeEdge("a", "c", 0.9)],
    );
    const cluster = detectClusters(graph)[0];
    expect(cluster.centroidX).toBeCloseTo((90 + 210 + 150) / 3, 10);
    expect(cluster.centroidY).toBeCloseTo((120 + 120 + 210) / 3, 10);
  });

  it("computes avgSimilarity as the mean of internal edge weights", () => {
    const graph = makeGraph(
      [makeNode("a", 0, 0), makeNode("b", 10, 0), makeNode("c", 0, 10)],
      [makeEdge("a", "b", 0.8), makeEdge("b", "c", 0.9), makeEdge("a", "c", 1.0)],
    );
    expect(detectClusters(graph)[0].avgSimilarity).toBeCloseTo((0.8 + 0.9 + 1.0) / 3, 10);
  });

  it("returns an empty array for an empty graph", () => {
    expect(detectClusters({ nodes: [], edges: [], clusters: [] })).toEqual([]);
  });
});

// ─── stepSimulation ───────────────────────────────────────────────────────────

describe("stepSimulation", () => {
  it("produces no NaN with an empty (0-node) graph", () => {
    const state = createSimulationState({ nodes: [], edges: [], clusters: [] }, VIEWPORT_W, VIEWPORT_H);
    const next = runSteps(state, 20);
    expect(next.nodes.length).toBe(0);
    expect(Number.isNaN(next.totalKineticEnergy)).toBe(false);
    expect(next.totalKineticEnergy).toBe(0);
  });

  it("produces no NaN with 50 nodes after 100 steps", () => {
    const matches: MatchInput[] = [];
    for (let i = 0; i < 41; i++) {
      matches.push(makeMatch(`bulk-${i}`, 0.76 + ((i * 7) % 24) / 100));
    }
    // me (1) + 41 matches + 8 ghosts = 50 nodes
    const graph = buildGraph(ME, matches, "amistad", AMISTAD_THRESHOLD, VIEWPORT_W, VIEWPORT_H);
    expect(graph.nodes.length).toBe(50);
    const final = runSteps(createSimulationState(graph, VIEWPORT_W, VIEWPORT_H), 100);
    for (const n of final.nodes) {
      expect(Number.isNaN(n.x)).toBe(false);
      expect(Number.isNaN(n.y)).toBe(false);
      expect(Number.isNaN(n.vx)).toBe(false);
      expect(Number.isNaN(n.vy)).toBe(false);
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
    }
    expect(Number.isNaN(final.totalKineticEnergy)).toBe(false);
  });

  it("is deterministic: same initial state + same params → same output", () => {
    const graph = buildGraph(ME, MATCHES, "amistad", AMISTAD_THRESHOLD, VIEWPORT_W, VIEWPORT_H, 4);
    const s1 = runSteps(createSimulationState(graph, VIEWPORT_W, VIEWPORT_H), 50);
    const s2 = runSteps(createSimulationState(graph, VIEWPORT_W, VIEWPORT_H), 50);
    expect(s1).toEqual(s2);
  });

  it("does not mutate the input state", () => {
    const graph = buildGraph(ME, MATCHES, "amistad", AMISTAD_THRESHOLD, VIEWPORT_W, VIEWPORT_H, 4);
    const state = createSimulationState(graph, VIEWPORT_W, VIEWPORT_H);
    const snapshot = JSON.parse(JSON.stringify(state));
    stepSimulation(state, 1);
    expect(state).toEqual(snapshot);
  });

  it("reaches equilibrium within 500 steps for a small 5-node graph", () => {
    const graph = makeGraph(
      [
        makeNode("s", 400, 300, { isSelf: true, radius: 24 }),
        makeNode("n1", 300, 200),
        makeNode("n2", 500, 200),
        makeNode("n3", 300, 400),
        makeNode("n4", 500, 400),
      ],
      [
        makeEdge("s", "n1", 0.9, 100),
        makeEdge("s", "n2", 0.9, 100),
        makeEdge("s", "n3", 0.9, 100),
        makeEdge("s", "n4", 0.9, 100),
      ],
    );
    // Ambient drift keeps a settled constellation gently floating, so with the
    // default params we assert the equilibrium latch (the spec requirement).
    const final = runSteps(createSimulationState(graph, VIEWPORT_W, VIEWPORT_H), 500);
    expect(final.isEquilibrium).toBe(true);
    // With drift disabled, the pure spring/gravity physics fully converges so
    // total kinetic energy drops below the equilibrium threshold.
    const settled = runStepsStepwise(createSimulationState(graph, VIEWPORT_W, VIEWPORT_H), 500, {
      driftStrength: 0,
    });
    expect(settled.isEquilibrium).toBe(true);
    expect(settled.totalKineticEnergy).toBeLessThan(DEFAULT_SIMULATION_PARAMS.equilibriumThreshold);
  });

  it("respects viewport bounds on every node", () => {
    const matches: MatchInput[] = [];
    for (let i = 0; i < 20; i++) matches.push(makeMatch(`bnd-${i}`, 0.76 + (i % 20) / 100));
    const graph = buildGraph(ME, matches, "amistad", AMISTAD_THRESHOLD, VIEWPORT_W, VIEWPORT_H);
    const final = runSteps(createSimulationState(graph, VIEWPORT_W, VIEWPORT_H), 300);
    const pad = DEFAULT_SIMULATION_PARAMS.boundsPadding;
    for (const n of final.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(pad - 1e-9);
      expect(n.x).toBeLessThanOrEqual(VIEWPORT_W - pad + 1e-9);
      expect(n.y).toBeGreaterThanOrEqual(pad - 1e-9);
      expect(n.y).toBeLessThanOrEqual(VIEWPORT_H - pad + 1e-9);
    }
  });

  it("caps velocity at maxVelocity", () => {
    // Two heavily overlapping nodes → huge repulsion → must be capped.
    const graph = makeGraph(
      [makeNode("p", 400, 300, { radius: 20 }), makeNode("q", 402, 300, { radius: 20 })],
      [],
    );
    let state = createSimulationState(graph, VIEWPORT_W, VIEWPORT_H);
    for (let i = 0; i < 30; i++) {
      state = stepSimulation(state, 1);
      for (const n of state.nodes) {
        expect(Math.hypot(n.vx, n.vy)).toBeLessThanOrEqual(DEFAULT_SIMULATION_PARAMS.maxVelocity + 1e-9);
      }
    }
  });

  it("spring behavior: two connected high-similarity nodes move CLOSER over time", () => {
    const graph = makeGraph(
      [makeNode("x", 200, 300), makeNode("y", 600, 300)],
      [makeEdge("x", "y", 0.95, 80)],
    );
    const initial = createSimulationState(graph, VIEWPORT_W, VIEWPORT_H);
    const d0 = distanceBetween(initial, "x", "y");
    // Disable drift for a pure spring-convergence assertion.
    const final = runStepsStepwise(initial, 400, { driftStrength: 0 });
    const d1 = distanceBetween(final, "x", "y");
    expect(d1).toBeLessThan(d0);
    expect(Math.abs(d1 - 80)).toBeLessThan(5);
  });

  it("repulsion behavior: two overlapping unconnected nodes move APART over time", () => {
    const graph = makeGraph(
      [makeNode("o1", 395, 300, { radius: 16 }), makeNode("o2", 405, 300, { radius: 16 })],
      [],
    );
    const initial = createSimulationState(graph, VIEWPORT_W, VIEWPORT_H);
    const d0 = distanceBetween(initial, "o1", "o2");
    expect(d0).toBeLessThan(32); // overlapping (sum of radii)
    const final = runStepsStepwise(initial, 200, { driftStrength: 0 });
    const d1 = distanceBetween(final, "o1", "o2");
    expect(d1).toBeGreaterThan(d0);
    expect(d1).toBeGreaterThanOrEqual(32 - 1e-6);
  });
});

function runStepsStepwise(
  state: SimulationState,
  steps: number,
  params?: Partial<typeof DEFAULT_SIMULATION_PARAMS>,
): SimulationState {
  let s = state;
  for (let i = 0; i < steps; i++) s = stepSimulation(s, 1, params);
  return s;
}

// ─── dragNode + releaseNode ───────────────────────────────────────────────────

describe("dragNode", () => {
  const baseState = createSimulationState(
    buildGraph(ME, MATCHES, "amistad", AMISTAD_THRESHOLD, VIEWPORT_W, VIEWPORT_H, 2),
    VIEWPORT_W,
    VIEWPORT_H,
  );

  it("sets the dragged node's position exactly and zeroes its velocity", () => {
    const dragged = dragNode(runSteps(baseState, 30), "m-high", 123, 456);
    const node = dragged.nodes.find((n) => n.id === "m-high")!;
    expect(node.x).toBe(123);
    expect(node.y).toBe(456);
    expect(node.vx).toBe(0);
    expect(node.vy).toBe(0);
  });

  it("clamps drag positions to the padded viewport bounds", () => {
    const dragged = dragNode(baseState, "m-high", -999, 99999);
    const node = dragged.nodes.find((n) => n.id === "m-high")!;
    expect(node.x).toBe(DEFAULT_SIMULATION_PARAMS.boundsPadding);
    expect(node.y).toBe(VIEWPORT_H - DEFAULT_SIMULATION_PARAMS.boundsPadding);
  });

  it("does not mutate the input state", () => {
    const snapshot = JSON.parse(JSON.stringify(baseState));
    dragNode(baseState, "m-high", 10, 10);
    expect(baseState).toEqual(snapshot);
  });
});

describe("releaseNode", () => {
  it("gives the released node a non-zero velocity impulse", () => {
    const state = createSimulationState(
      buildGraph(ME, MATCHES, "amistad", AMISTAD_THRESHOLD, VIEWPORT_W, VIEWPORT_H, 2),
      VIEWPORT_W,
      VIEWPORT_H,
    );
    const dragged = dragNode(state, "m-mid", 300, 200);
    const released = releaseNode(dragged, "m-mid");
    const node = released.nodes.find((n) => n.id === "m-mid")!;
    expect(Math.hypot(node.vx, node.vy)).toBeGreaterThan(0);
    expect(Math.hypot(node.vx, node.vy)).toBeLessThanOrEqual(DEFAULT_SIMULATION_PARAMS.maxVelocity);
  });

  it("is deterministic for the same state", () => {
    const state = createSimulationState(
      buildGraph(ME, MATCHES, "amistad", AMISTAD_THRESHOLD, VIEWPORT_W, VIEWPORT_H, 2),
      VIEWPORT_W,
      VIEWPORT_H,
    );
    const a = releaseNode(state, "m-mid");
    const b = releaseNode(state, "m-mid");
    expect(a.nodes).toEqual(b.nodes);
  });
});

// ─── switchTrack ──────────────────────────────────────────────────────────────

describe("switchTrack", () => {
  const dualMatches: MatchInput[] = [
    makeMatch("d1", 0.92, "romance"),
    makeMatch("d1", 0.77, "amistad"),
    makeMatch("d2", 0.86, "romance"),
    makeMatch("d2", 0.71, "amistad"), // below amistad threshold → no edge after switch
  ];

  const romanceState = createSimulationState(
    buildGraph(ME, dualMatches, "romance", ROMANCE_THRESHOLD, VIEWPORT_W, VIEWPORT_H, 2),
    VIEWPORT_W,
    VIEWPORT_H,
  );
  const settled = runSteps(romanceState, 20);

  it("recalculates edges for the new track's threshold", () => {
    const switched = switchTrack(settled, dualMatches, "amistad", AMISTAD_THRESHOLD);
    expect(switched.edges.length).not.toBe(settled.edges.length);
    const selfEdges = switched.edges.filter((e) => e.source === ME.id || e.target === ME.id);
    // d1 (0.77 > 0.75) connected; d2 (0.71 <= 0.75) not.
    expect(selfEdges.some((e) => e.source === "d1" || e.target === "d1")).toBe(true);
    expect(selfEdges.some((e) => e.source === "d2" || e.target === "d2")).toBe(false);
    for (const e of switched.edges) expect(e.similarity).toBeGreaterThan(AMISTAD_THRESHOLD);
  });

  it("preserves node positions across the switch", () => {
    const switched = switchTrack(settled, dualMatches, "amistad", AMISTAD_THRESHOLD);
    for (const before of settled.nodes) {
      const after = switched.nodes.find((n) => n.id === before.id)!;
      expect(after).toBeDefined();
      expect(after.x).toBe(before.x);
      expect(after.y).toBe(before.y);
    }
  });

  it("updates similarity metadata to the new track's values", () => {
    const switched = switchTrack(settled, dualMatches, "amistad", AMISTAD_THRESHOLD);
    const d1 = switched.nodes.find((n) => n.id === "d1")!;
    expect(d1.similarity).toBe(0.77);
    expect(d1.track).toBe("amistad");
  });
});

// ─── precomputeLayout ─────────────────────────────────────────────────────────

describe("precomputeLayout", () => {
  const graph = buildGraph(ME, MATCHES, "amistad", AMISTAD_THRESHOLD, VIEWPORT_W, VIEWPORT_H, 4);

  it("converges to equilibrium with default ticks", () => {
    const final = precomputeLayout(graph, VIEWPORT_W, VIEWPORT_H);
    expect(final.isEquilibrium).toBe(true);
    // Pure-physics convergence (drift disabled) drops KE below the threshold.
    const settled = precomputeLayout(graph, VIEWPORT_W, VIEWPORT_H, undefined, { driftStrength: 0 });
    expect(settled.isEquilibrium).toBe(true);
    expect(settled.totalKineticEnergy).toBeLessThan(DEFAULT_SIMULATION_PARAMS.equilibriumThreshold);
  });

  it("matches N manual stepSimulation calls exactly", () => {
    const ticks = 100;
    const precomputed = precomputeLayout(graph, VIEWPORT_W, VIEWPORT_H, ticks);
    const manual = runSteps(createSimulationState(graph, VIEWPORT_W, VIEWPORT_H), ticks);
    expect(precomputed).toEqual(manual);
  });

  it("is deterministic across calls", () => {
    const a = precomputeLayout(graph, VIEWPORT_W, VIEWPORT_H, 200);
    const b = precomputeLayout(graph, VIEWPORT_W, VIEWPORT_H, 200);
    expect(a).toEqual(b);
  });
});

// ─── generateGhostNodes ───────────────────────────────────────────────────────

describe("generateGhostNodes", () => {
  it("returns exactly the requested count", () => {
    expect(generateGhostNodes(5, VIEWPORT_W, VIEWPORT_H, "seed-a").length).toBe(5);
    expect(generateGhostNodes(0, VIEWPORT_W, VIEWPORT_H, "seed-a").length).toBe(0);
  });

  it("caps the count at 12", () => {
    expect(generateGhostNodes(30, VIEWPORT_W, VIEWPORT_H, "seed-a").length).toBe(12);
  });

  it("marks every node as a ghost with zero similarity", () => {
    for (const g of generateGhostNodes(8, VIEWPORT_W, VIEWPORT_H, "seed-b")) {
      expect(g.isGhost).toBe(true);
      expect(g.isSelf).toBe(false);
      expect(g.similarity).toBe(0);
    }
  });

  it("places all ghosts within the viewport", () => {
    for (const g of generateGhostNodes(12, VIEWPORT_W, VIEWPORT_H, "seed-c")) {
      expect(g.x).toBeGreaterThanOrEqual(0);
      expect(g.x).toBeLessThanOrEqual(VIEWPORT_W);
      expect(g.y).toBeGreaterThanOrEqual(0);
      expect(g.y).toBeLessThanOrEqual(VIEWPORT_H);
    }
  });

  it("is deterministic: same seed → same positions", () => {
    const a = generateGhostNodes(8, VIEWPORT_W, VIEWPORT_H, "constellation");
    const b = generateGhostNodes(8, VIEWPORT_W, VIEWPORT_H, "constellation");
    expect(a).toEqual(b);
  });

  it("produces different layouts for different seeds", () => {
    const a = generateGhostNodes(8, VIEWPORT_W, VIEWPORT_H, "seed-x");
    const b = generateGhostNodes(8, VIEWPORT_W, VIEWPORT_H, "seed-y");
    expect(a).not.toEqual(b);
  });
});
