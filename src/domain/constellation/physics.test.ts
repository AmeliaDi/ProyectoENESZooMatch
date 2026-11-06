import { describe, expect, it } from "vitest";

import { PHYSICS, physicsSchema, type PhysicsConfig } from "@/config";
import { loadConfig } from "@/config/load";
import { mulberry32 } from "@/domain/shared";

import {
  advance,
  buildFrame,
  buildScene,
  contactDistance,
  createCamera,
  createTrail,
  createWorld,
  detectGroups,
  easeCamera,
  estimatePairSimilarity,
  estimateVelocity,
  getTrackCeiling,
  getTrackThreshold,
  gradientNoise1D,
  grab,
  kick,
  linkKey,
  mechanicalEnergy,
  moveAnchor,
  pushSample,
  recenter,
  release,
  screenToWorld,
  settle,
  similarityToDistance,
  step,
  transitionWorld,
  zoomAt,
  type SceneInput,
  type SceneMatch,
  type World,
} from "./index";

const ROMANCE = getTrackThreshold("romance");
const AMISTAD = getTrackThreshold("amistad");

/** Similarities spread between the threshold and the calibrated ceiling, like real scores. */
function randomMatches(count: number, seed: number, track: "romance" | "amistad" = "amistad"): SceneMatch[] {
  const rand = mulberry32(seed);
  const threshold = track === "romance" ? ROMANCE : AMISTAD;
  const span = getTrackCeiling(track) - threshold;
  return Array.from({ length: count }, (_, i) => ({
    id: `m${String(i).padStart(3, "0")}`,
    similarity: threshold + span * (0.01 + 0.98 * rand()),
    track,
  }));
}

function input(matches: readonly SceneMatch[], overrides: Partial<SceneInput> = {}): SceneInput {
  return {
    selfId: "me",
    matches,
    track: "amistad",
    threshold: AMISTAD,
    width: 390,
    height: 700,
    ghostCount: 8,
    ...overrides,
  };
}

/** Smallest gap between two sprite supports (`withCushion` adds δ). */
function minClearance(world: World, withCushion = true): number {
  let min = Infinity;
  for (let i = 0; i < world.bodies.length; i++) {
    for (let j = i + 1; j < world.bodies.length; j++) {
      const a = world.bodies[i]!;
      const b = world.bodies[j]!;
      if (a.leaving || b.leaving) continue;
      const reach = withCushion ? contactDistance(a, b, PHYSICS) : a.radius + b.radius;
      min = Math.min(min, Math.hypot(a.x - b.x, a.y - b.y) - reach);
    }
  }
  return min;
}

function allFinite(world: World): boolean {
  return world.bodies.every((b) => [b.x, b.y, b.vx, b.vy].every(Number.isFinite));
}

function insideViewport(world: World): boolean {
  return world.bodies.every(
    (b) => b.x - b.radius >= 0 && b.x + b.radius <= world.width && b.y - b.radius >= 0 && b.y + b.radius <= world.height,
  );
}

function runFor(world: World, seconds: number, hz: number): void {
  for (let i = 0; i < Math.round(seconds * hz); i++) advance(world, 1 / hz, PHYSICS);
}

describe("physics config", () => {
  it("loads, is frozen and keeps explicit integration stable", () => {
    expect(Object.isFrozen(PHYSICS)).toBe(true);
    const stiffest = Math.max(2 * PHYSICS.collision.stiffness, PHYSICS.interaction.anchorStiffness, PHYSICS.bounds.stiffness);
    expect(Math.sqrt(stiffest) / PHYSICS.integration.stepHz).toBeLessThan(1);
  });

  it("rejects render offsets that could make sprites touch", () => {
    const bad = structuredClone(PHYSICS) as PhysicsConfig;
    bad.ambient.driftAmplitude = PHYSICS.bodies.clearance;
    expect(() => loadConfig("physics-config", physicsSchema, bad)).toThrow(/clearance/);
  });

  it("rejects a spring too stiff for the step rate", () => {
    const bad = structuredClone(PHYSICS) as PhysicsConfig;
    bad.collision.stiffness = 50_000;
    expect(() => loadConfig("physics-config", physicsSchema, bad)).toThrow(/unstable/);
  });
});

describe("similarityToDistance", () => {
  it("is strictly decreasing above the threshold and null at or below it", () => {
    expect(similarityToDistance(AMISTAD, AMISTAD, 800, 600, PHYSICS)).toBeNull();
    expect(similarityToDistance(AMISTAD - 0.1, AMISTAD, 800, 600, PHYSICS)).toBeNull();
    let previous = Infinity;
    for (let s = AMISTAD + 0.01; s <= 1; s += 0.01) {
      const d = similarityToDistance(s, AMISTAD, 800, 600, PHYSICS)!;
      expect(d).toBeLessThan(previous);
      previous = d;
    }
  });

  it("reads thresholds and ceilings from the matching config", () => {
    // Romance is calibrated at a stricter null quantile (α = 0.05 vs 0.15).
    expect(ROMANCE).toBeGreaterThan(AMISTAD);
    for (const track of ["romance", "amistad"] as const) {
      expect(getTrackCeiling(track)).toBeGreaterThan(getTrackThreshold(track));
    }
  });

  it("uses the whole orbit range between the threshold and the calibrated ceiling", () => {
    const ceiling = getTrackCeiling("amistad");
    const near = similarityToDistance(ceiling, AMISTAD, 800, 600, PHYSICS, ceiling)!;
    const far = similarityToDistance(AMISTAD + 1e-6, AMISTAD, 800, 600, PHYSICS, ceiling)!;
    expect(near).toBeCloseTo(PHYSICS.orbit.minRadius, 6);
    expect(far).toBeGreaterThan(near);
  });
});

describe("scene", () => {
  it("keeps only real matches of the active track, capped by affinity", () => {
    const matches = [
      ...randomMatches(30, 1),
      { id: "below", similarity: AMISTAD, track: "amistad" as const },
      { id: "other", similarity: 0.99, track: "romance" as const },
    ];
    const scene = buildScene(input(matches), PHYSICS);
    const real = scene.bodies.filter((b) => b.kind === "match");
    expect(real).toHaveLength(PHYSICS.scene.maxRealMatches);
    expect(real.some((b) => b.id === "below" || b.id === "other")).toBe(false);
  });

  it("places homes without overlaps on phone, tablet and desktop", () => {
    for (const [width, height] of [[320, 568], [390, 700], [768, 1024], [1440, 900]] as const) {
      const scene = buildScene(input(randomMatches(24, 2), { width, height }), PHYSICS);
      for (let i = 0; i < scene.bodies.length; i++) {
        for (let j = i + 1; j < scene.bodies.length; j++) {
          const a = scene.bodies[i]!;
          const b = scene.bodies[j]!;
          expect(Math.hypot(a.homeX - b.homeX, a.homeY - b.homeY)).toBeGreaterThanOrEqual(contactDistance(a, b, PHYSICS) - 1e-6);
        }
      }
    }
  });

  it("gives every link a rest length equal to the distance between homes", () => {
    const scene = buildScene(input(randomMatches(12, 3)), PHYSICS);
    const byId = new Map(scene.bodies.map((b) => [b.id, b]));
    for (const link of scene.links) {
      const a = byId.get(link.a)!;
      const b = byId.get(link.b)!;
      expect(link.rest).toBeCloseTo(Math.hypot(a.homeX - b.homeX, a.homeY - b.homeY), 9);
      expect(link.key).toBe(linkKey(link.b, link.a));
    }
  });

  it("is deterministic", () => {
    const a = buildScene(input(randomMatches(16, 4)), PHYSICS);
    const b = buildScene(input(randomMatches(16, 4)), PHYSICS);
    expect(a).toEqual(b);
  });

  it("never links ghosts", () => {
    const scene = buildScene(input(randomMatches(8, 5)), PHYSICS);
    const ghosts = new Set(scene.bodies.filter((b) => b.kind === "ghost").map((b) => b.id));
    expect(ghosts.size).toBeGreaterThan(0);
    for (const link of scene.links) expect(ghosts.has(link.a) || ghosts.has(link.b)).toBe(false);
  });
});

describe("groups", () => {
  const cfg = PHYSICS.group;

  it("finds a mutually compatible clique and scores it by its weakest pair", () => {
    const matches = ["a", "b", "c", "d"].map((id) => ({ id, similarity: 0.9, track: "amistad" as const }));
    // d pairs sit below the threshold, so d never joins the clique.
    const below = AMISTAD - 0.1;
    const table: Record<string, number> = { "a|b": 0.9, "a|c": 0.85, "b|c": 0.8, "a|d": below, "b|d": below, "c|d": below };
    const pair = (x: SceneMatch, y: SceneMatch): number => table[[x.id, y.id].sort().join("|")] ?? 0;
    const groups = detectGroups(matches, AMISTAD, pair, cfg);
    expect(groups).toEqual([{ ids: ["a", "b", "c"], score: 0.8 }]);
  });

  it("needs three members", () => {
    const matches = ["a", "b"].map((id) => ({ id, similarity: 0.95, track: "amistad" as const }));
    expect(detectGroups(matches, AMISTAD, estimatePairSimilarity, cfg)).toEqual([]);
  });

  it("caps group size and count and returns disjoint groups", () => {
    const matches = randomMatches(40, 6).map((m) => ({ ...m, similarity: 0.97 }));
    const groups = detectGroups(matches, AMISTAD, estimatePairSimilarity, cfg);
    expect(groups.length).toBeLessThanOrEqual(cfg.maxGroups);
    const seen = new Set<string>();
    for (const group of groups) {
      expect(group.ids.length).toBeGreaterThanOrEqual(3);
      expect(group.ids.length).toBeLessThanOrEqual(cfg.maxSize);
      for (const id of group.ids) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
    }
  });
});

describe("integration", () => {
  it("never produces NaN or Infinity with 0, 1 and 100 stars", () => {
    for (const count of [0, 1, 100]) {
      const scene = buildScene(input(randomMatches(count, 7), { width: 1200, height: 800, maxMatches: 100 }), PHYSICS);
      const world = createWorld(scene, PHYSICS, "from-edge");
      runFor(world, 3, 60);
      expect(allFinite(world)).toBe(true);
      expect(Number.isFinite(world.kinetic)).toBe(true);
    }
  });

  it("produces the same trajectory at 30, 60, 90 and 120 Hz displays", () => {
    const positions = [30, 60, 90, 120].map((hz) => {
      const world = createWorld(buildScene(input(randomMatches(12, 8)), PHYSICS), PHYSICS, "from-edge");
      runFor(world, 1.5, hz);
      return world.bodies.map((b) => [b.x, b.y]);
    });
    for (const other of positions.slice(1)) {
      other.forEach(([x, y], i) => {
        expect(x).toBeCloseTo(positions[0]![i]![0]!, 6);
        expect(y).toBeCloseTo(positions[0]![i]![1]!, 6);
      });
    }
  });

  it("is deterministic: same seed, same trajectory", () => {
    const run = (): number[] => {
      const world = createWorld(buildScene(input(randomMatches(20, 9)), PHYSICS), PHYSICS, "from-edge");
      runFor(world, 2, 60);
      return world.bodies.flatMap((b) => [b.x, b.y, b.vx, b.vy]);
    };
    expect(run()).toEqual(run());
  });

  it("never gains mechanical energy without external input", () => {
    for (const seed of [10, 11, 12]) {
      const world = createWorld(buildScene(input(randomMatches(12, seed), { width: 1200, height: 800 }), PHYSICS), PHYSICS, "from-edge");
      let previous = mechanicalEnergy(world, PHYSICS);
      for (let i = 0; i < 600; i++) {
        step(world, PHYSICS);
        const energy = mechanicalEnergy(world, PHYSICS);
        // Semi-implicit Euler conserves a shadow Hamiltonian: tiny O(dt²)
        // wobbles are allowed, growth is not.
        expect(energy).toBeLessThanOrEqual(previous * (1 + 1e-3) + 1e-6);
        previous = energy;
      }
    }
  });

  it("converges and falls asleep for typical skies", () => {
    for (const [count, width, height] of [[5, 390, 700], [12, 390, 700], [24, 390, 700], [24, 1440, 900]] as const) {
      const world = settle(createWorld(buildScene(input(randomMatches(count, 13), { width, height }), PHYSICS), PHYSICS, "from-edge"), PHYSICS);
      expect(world.asleep, `${count} @ ${width}x${height}`).toBe(true);
      for (const body of world.bodies.filter((b) => b.kind === "match")) {
        expect(Math.hypot(body.x - body.hx, body.y - body.hy)).toBeLessThan(2);
      }
    }
  });

  it("keeps every sprite inside the viewport and no two sprites ever touch", () => {
    for (const [count, width, height] of [[24, 320, 568], [24, 390, 700], [100, 1200, 800]] as const) {
      const world = createWorld(
        buildScene(input(randomMatches(count, 14), { width, height, maxMatches: 100 }), PHYSICS),
        PHYSICS,
        "from-edge",
      );
      for (let frame = 0; frame < 240; frame++) {
        advance(world, 1 / 60, PHYSICS);
        expect(insideViewport(world)).toBe(true);
        // Mid-flight the projection may leave a sub-pixel residue inside the
        // δ cushion, but the sprite supports themselves never intersect.
        expect(minClearance(world, false)).toBeGreaterThan(0);
      }
      settle(world, PHYSICS);
      expect(minClearance(world)).toBeGreaterThanOrEqual(-1e-6);
    }
  });

  it("keeps the observer pinned at the centre", () => {
    const world = createWorld(buildScene(input(randomMatches(12, 15)), PHYSICS), PHYSICS, "from-edge");
    kick(world, PHYSICS.interaction.kickSpeed, mulberry32(1));
    runFor(world, 2, 60);
    const self = world.bodies.find((b) => b.kind === "self")!;
    expect(self.x).toBe(world.width / 2);
    expect(self.y).toBe(world.height / 2);
  });

  it("drops backlog instead of spiralling after a long frame", () => {
    const world = createWorld(buildScene(input(randomMatches(12, 16)), PHYSICS), PHYSICS, "from-edge");
    const result = advance(world, 5, PHYSICS);
    expect(result.steps).toBeLessThanOrEqual(PHYSICS.integration.maxStepsPerFrame);
    expect(world.accumulator).toBeLessThanOrEqual(1 / PHYSICS.integration.stepHz + 1e-9);
  });
});

describe("sleep and wake", () => {
  it("stops integrating while asleep and wakes on interaction", () => {
    const world = settle(createWorld(buildScene(input(randomMatches(8, 17)), PHYSICS), PHYSICS, "settled"), PHYSICS);
    expect(world.asleep).toBe(true);
    const steps = world.steps;
    expect(advance(world, 1 / 60, PHYSICS).steps).toBe(0);
    expect(world.steps).toBe(steps);
    const id = world.bodies.find((b) => b.kind === "match")!.id;
    expect(grab(world, id, 100, 100)).toBe(true);
    expect(world.asleep).toBe(false);
    expect(advance(world, 1 / 60, PHYSICS).steps).toBeGreaterThan(0);
  });
});

describe("drag", () => {
  it("pulls the grabbed star towards the anchor with a stiff spring (no teleport)", () => {
    const world = settle(
      createWorld(buildScene(input(randomMatches(6, 18), { width: 800, height: 800 }), PHYSICS), PHYSICS, "settled"),
      PHYSICS,
    );
    const index = world.bodies.findIndex((b) => b.kind === "match");
    const body = world.bodies[index]!;
    const start = { x: body.x, y: body.y };
    const target = { x: 120, y: 120 };
    grab(world, body.id, target.x, target.y);
    step(world, PHYSICS);
    const firstJump = Math.hypot(body.x - start.x, body.y - start.y);
    expect(firstJump).toBeLessThan(Math.hypot(target.x - start.x, target.y - start.y) / 4);
    runFor(world, 1, 60);
    moveAnchor(world, target.x, target.y);
    runFor(world, 0.5, 60);
    expect(Math.hypot(body.x - target.x, body.y - target.y)).toBeLessThan(contactDistance(body, body, PHYSICS));
  });

  it("refuses to grab the observer, ghosts and unknown ids", () => {
    const world = createWorld(buildScene(input(randomMatches(3, 19)), PHYSICS), PHYSICS, "settled");
    expect(grab(world, "me", 0, 0)).toBe(false);
    expect(grab(world, world.bodies.find((b) => b.kind === "ghost")!.id, 0, 0)).toBe(false);
    expect(grab(world, "nobody", 0, 0)).toBe(false);
  });

  it("throws with the estimated release velocity", () => {
    const world = createWorld(buildScene(input(randomMatches(3, 20), { width: 800, height: 800 }), PHYSICS), PHYSICS, "settled");
    const body = world.bodies.find((b) => b.kind === "match")!;
    grab(world, body.id, body.x, body.y);
    release(world, { x: 300, y: -200 });
    expect(world.anchor).toBeNull();
    expect(body.vx).toBe(300);
    expect(body.vy).toBe(-200);
  });

  it("estimates a steady throw from noisy samples and clamps it", () => {
    const trail = createTrail();
    for (let t = 0; t <= 80; t += 8) pushSample(trail, { t, x: t * 0.5 + (t % 16 === 0 ? 0.4 : -0.4), y: 0 });
    const v = estimateVelocity(trail, 80, 90, 10_000);
    expect(v.x).toBeCloseTo(500, -1);
    expect(estimateVelocity(trail, 80, 90, 100).x).toBeCloseTo(100, 6);
    expect(estimateVelocity(createTrail(), 0, 90, 100)).toEqual({ x: 0, y: 0 });
  });
});

describe("track switch", () => {
  const dual: SceneMatch[] = [
    ...randomMatches(10, 21, "romance"),
    ...randomMatches(10, 21, "amistad").map((m, i) => ({ ...m, id: i < 5 ? `m${String(i).padStart(3, "0")}` : `f${i}` })),
  ];

  it("keeps survivors in place, adds newcomers at the rim and fades leavers", () => {
    const romance = settle(
      createWorld(buildScene(input(dual, { track: "romance", threshold: ROMANCE }), PHYSICS), PHYSICS, "settled"),
      PHYSICS,
    );
    const before = new Map(romance.bodies.map((b) => [b.id, { x: b.x, y: b.y }]));
    const scene = buildScene(input(dual, { track: "amistad", threshold: AMISTAD }), PHYSICS, before);
    const switched = transitionWorld(romance, scene, PHYSICS);

    for (const body of switched.bodies) {
      const old = before.get(body.id);
      if (old && body.kind === "match" && !body.leaving) {
        expect(body.x).toBe(old.x);
        expect(body.y).toBe(old.y);
      }
    }
    const leavers = switched.bodies.filter((b) => b.leaving);
    expect(leavers.length).toBeGreaterThan(0);
    for (const leaver of leavers) expect(leaver.alphaTarget).toBe(0);
    const newcomers = switched.bodies.filter((b) => b.kind === "match" && !b.leaving && !before.has(b.id));
    for (const body of newcomers) expect(body.alpha).toBe(0);

    settle(switched, PHYSICS);
    expect(switched.bodies.some((b) => b.leaving)).toBe(false);
    expect(switched.asleep).toBe(true);
  });

  it("preserves the cyclic order of surviving stars (no crossings)", () => {
    const romance = settle(
      createWorld(buildScene(input(dual, { track: "romance", threshold: ROMANCE }), PHYSICS), PHYSICS, "settled"),
      PHYSICS,
    );
    const centre = { x: romance.cx, y: romance.cy };
    const before = new Map(romance.bodies.map((b) => [b.id, { x: b.x, y: b.y }]));
    const scene = buildScene(input(dual, { track: "amistad", threshold: AMISTAD }), PHYSICS, before);
    const survivors = scene.bodies.filter((b) => b.kind === "match" && before.has(b.id));
    const order = (points: { id: string; x: number; y: number }[]): string[] =>
      [...points].sort((a, b) => Math.atan2(a.y - centre.y, a.x - centre.x) - Math.atan2(b.y - centre.y, b.x - centre.x)).map((p) => p.id);
    const rotate = (list: string[]): string => {
      const start = list.indexOf([...list].sort()[0]!);
      return [...list.slice(start), ...list.slice(0, start)].join(",");
    };
    const oldOrder = order(survivors.map((b) => ({ id: b.id, ...before.get(b.id)! })));
    const newOrder = order(survivors.map((b) => ({ id: b.id, x: b.homeX, y: b.homeY })));
    expect(rotate(newOrder)).toBe(rotate(oldOrder));
  });

  it("deduplicates repeated match ids by highest similarity and never creates duplicate body ids across rapid transitions", () => {
    const dupMatches: SceneMatch[] = [
      { id: "dup-star", similarity: 0.55, track: "romance" },
      { id: "dup-star", similarity: 0.88, track: "romance" },
      { id: "leaving-star", similarity: 0.72, track: "romance" },
    ];
    const scene1 = buildScene(input(dupMatches, { track: "romance", threshold: ROMANCE, ghostCount: 0 }), PHYSICS);
    const matchBodies = scene1.bodies.filter((b) => b.kind === "match");
    expect(matchBodies.map((b) => b.id)).toEqual(["dup-star", "leaving-star"]);
    expect(matchBodies.find((b) => b.id === "dup-star")?.similarity).toBeCloseTo(0.88, 6);

    const world1 = createWorld(scene1, PHYSICS, "settled");
    const scene2 = buildScene(input([], { track: "amistad", threshold: AMISTAD, ghostCount: 0 }), PHYSICS);
    const world2 = transitionWorld(world1, scene2, PHYSICS);
    // Simulate a body that already faded out to alpha 0 plus an accidental duplicate in previous.bodies
    const faded = world2.bodies.find((b) => b.id === "leaving-star")!;
    faded.alpha = 0;
    world2.bodies.push({ ...faded, id: "dup-star", alpha: 0.4 });

    const scene3 = buildScene(input([], { track: "romance", threshold: ROMANCE, ghostCount: 0 }), PHYSICS);
    const world3 = transitionWorld(world2, scene3, PHYSICS);
    const ids = world3.bodies.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain("leaving-star");
  });
});

describe("render frame", () => {
  it("interpolates between the last two steps", () => {
    const world = createWorld(buildScene(input(randomMatches(4, 22)), PHYSICS), PHYSICS, "from-edge");
    step(world, PHYSICS);
    const i = world.bodies.findIndex((b) => b.kind === "match");
    const body = world.bodies[i]!;
    const half = buildFrame(world, PHYSICS, { alpha: 0.5, still: true });
    expect(half.stars[i]!.x).toBeCloseTo((body.px + body.x) / 2, 9);
  });

  it("traces a new bond, flashes once and then marks both stars happy", () => {
    const world = createWorld(buildScene(input(randomMatches(3, 23)), PHYSICS), PHYSICS, "from-edge");
    let sawTracing = false;
    let sawFlash = false;
    let sawHappy = false;
    for (let frame = 0; frame < 600 && !world.asleep; frame++) {
      advance(world, 1 / 60, PHYSICS);
      const f = buildFrame(world, PHYSICS, { alpha: 0, still: false });
      sawTracing ||= f.lines.some((l) => l.phase === "tracing" && l.progress > 0 && l.progress < 1);
      sawFlash ||= f.flashes.some((fl) => fl.intensity > 0);
      sawHappy ||= f.stars.some((s) => s.happy);
    }
    expect(sawTracing).toBe(true);
    expect(sawFlash).toBe(true);
    expect(sawHappy).toBe(true);
  });

  it("is static under reduced motion: no drift, no breathing, every bond drawn", () => {
    const world = settle(createWorld(buildScene(input(randomMatches(6, 24)), PHYSICS), PHYSICS, "settled"), PHYSICS);
    const a = buildFrame(world, PHYSICS, { alpha: 0, still: true });
    world.time += 3;
    const b = buildFrame(world, PHYSICS, { alpha: 0, still: true });
    expect(b.stars).toEqual(a.stars);
    expect(a.breathe).toBe(1);
    expect(a.lines.every((l) => l.progress === 1)).toBe(true);
    expect(a.flashes).toEqual([]);
  });

  it("keeps drift bounded by its amplitude", () => {
    for (let t = 0; t < 200; t += 0.37) {
      expect(Math.abs(gradientNoise1D(42, t))).toBeLessThanOrEqual(1);
    }
  });
});

describe("camera", () => {
  const cfg = PHYSICS.camera;

  it("zooms around the pointer, within limits", () => {
    const camera = createCamera(400, 300, cfg);
    const before = screenToWorld(camera, 400, 300, 100, 80);
    zoomAt(camera, 2, 100, 80, 400, 300, cfg);
    for (let i = 0; i < 400; i++) easeCamera(camera, 1 / 60);
    const after = screenToWorld(camera, 400, 300, 100, 80);
    expect(after.x).toBeCloseTo(before.x, 3);
    expect(after.y).toBeCloseTo(before.y, 3);
    zoomAt(camera, 1000, 200, 150, 400, 300, cfg);
    expect(camera.tzoom).toBe(cfg.maxZoom);
    zoomAt(camera, 1e-6, 200, 150, 400, 300, cfg);
    expect(camera.tzoom).toBe(cfg.minZoom);
  });

  it("eases the same at any frame rate and recentres smoothly", () => {
    const run = (hz: number): number => {
      const camera = createCamera(400, 300, cfg);
      zoomAt(camera, 2, 200, 150, 400, 300, cfg);
      for (let i = 0; i < hz / 2; i++) easeCamera(camera, 1 / hz);
      return camera.zoom;
    };
    expect(run(30)).toBeCloseTo(run(120), 6);
    const camera = createCamera(400, 300, cfg);
    zoomAt(camera, 2, 50, 50, 400, 300, cfg);
    for (let i = 0; i < 400; i++) easeCamera(camera, 1 / 60);
    recenter(camera, 400, 300, cfg);
    easeCamera(camera, 1 / 60);
    expect(camera.zoom).toBeGreaterThan(1);
    for (let i = 0; i < 600; i++) easeCamera(camera, 1 / 60);
    expect(camera).toMatchObject({ x: 200, y: 150, zoom: 1 });
  });
});
