"use client";

/**
 * ConstellationCanvas — the interactive sky.
 *
 * Rendering: SVG, because every real star must be a focusable button with an
 * es-MX `aria-label`, and pixel sprites stay sharp through a nested 16×16
 * viewBox with `image-rendering: pixelated`.
 *
 * Per-frame work never touches React state. React renders the static structure
 * once per data / size / track change; the `requestAnimationFrame` loop then
 * writes transforms, line endpoints, opacities and the camera viewBox
 * directly. The physics (`@/domain/constellation`) runs at a fixed rate with
 * an accumulator, and the loop paints positions interpolated between the last
 * two steps, so 30/60/90/120 Hz screens show the same motion.
 *
 * Loop lifecycle: awake → full physics; asleep → only the ambient drift is
 * painted (every `idleFrameDivider`-th frame); hidden tab or reduced motion →
 * no loop at all. Dragging, zooming, a track switch or new data wake it.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { PHYSICS } from "@/config";
import {
  advance,
  buildFrame,
  buildScene,
  createCamera,
  createTrail,
  createWorld,
  easeCamera,
  estimateVelocity,
  getTrackThreshold,
  grab,
  isCentred,
  kick,
  moveAnchor,
  panBy,
  placeAt,
  pushSample,
  recenter,
  release,
  screenToWorld,
  settle,
  transitionWorld,
  viewBox,
  wake,
  zoomAt,
  type Camera,
  type Frame,
  type PointerTrail,
  type World,
} from "@/domain/constellation";
import { mulberry32 } from "@/domain/shared";

import { emitFeedback } from "@/ui/feedback/feedback";
import { Button, IconButton } from "@/ui/kit/button";

import { buildNodeMeta, structureFromWorld, toSceneMatches } from "./build-structure";
import { GlowDefs } from "./GlowDefs";
import { useElementSize } from "./hooks";
import {
  GHOST_ANIMAL_ID,
  GHOST_COLOR_ID,
  EDGE_LIT_BOOST,
  LINE_DASH,
  ROMANCE_SPRITE_THRESHOLD,
  SIZE_DEBOUNCE_MS,
  buildDataKey,
  matchAriaLabel,
  matchesForTrack,
  round2,
  selfAriaLabel,
} from "./render-helpers";
import { warmSpriteSheets } from "./sprite-sheet";
import { StarNode, type StarHandlers } from "./StarNode";
import { CONSTELLATION_COPY } from "./types";
import type { CanvasMetrics, ConstellationCanvasProps, ConstellationStructure } from "./types";

const ZOOM_STEP = 1.25;
const METRICS_WINDOW_MS = 500;
/** Lit / hovered lines get one unit thicker. */
const LIT_STROKE_EXTRA = 1;

interface DragState {
  kind: "node";
  id: string;
  pointerId: number;
  /** Star-to-pointer offset in world units, so the star never jumps on grab. */
  dx: number;
  dy: number;
  originX: number;
  originY: number;
  moved: boolean;
  trail: PointerTrail;
}

interface Gesture {
  pointers: Map<number, { x: number; y: number }>;
  distance: number;
  midX: number;
  midY: number;
}

interface PaintTargets {
  nodes: Map<string, SVGGElement>;
  bodies: Map<string, SVGGElement>;
  lines: Map<string, SVGLineElement>;
  flashes: Map<string, SVGRectElement>;
  groups: SVGPolygonElement[];
  happy: Set<string>;
  /** Last value written per element+attribute: unchanged writes are skipped. */
  written: WeakMap<Element, Map<string, string>>;
}

function emptyTargets(): PaintTargets {
  return {
    nodes: new Map(),
    bodies: new Map(),
    lines: new Map(),
    flashes: new Map(),
    groups: [],
    happy: new Set(),
    written: new WeakMap(),
  };
}

/** setAttribute that skips identical values (each write invalidates style). */
function write(t: PaintTargets, el: Element, name: string, value: string): void {
  let cache = t.written.get(el);
  if (!cache) {
    cache = new Map();
    t.written.set(el, cache);
  }
  if (cache.get(name) === value) return;
  cache.set(name, value);
  el.setAttribute(name, value);
}

function polylineLength(points: { x: number; y: number }[]): number {
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

function ConstellationCanvasImpl({
  me,
  matches,
  track,
  ghostCount = PHYSICS.scene.defaultGhosts,
  reducedMotion,
  selectedNodeId,
  onSelectNode,
  className,
  style,
  emptyMessage,
  pairSimilarity,
  onMetrics,
  physics = PHYSICS,
  maxMatches,
  controlRef,
  thresholdOverride,
}: ConstellationCanvasProps) {
  const cfg = physics;
  const { ref: surfaceRef, width: measuredWidth, height: measuredHeight } = useElementSize<HTMLDivElement>();

  const [size, setSize] = useState({ width: 0, height: 0 });
  const hasSizeRef = useRef(false);
  useEffect(() => {
    if (measuredWidth <= 0 || measuredHeight <= 0) return;
    if (!hasSizeRef.current) {
      hasSizeRef.current = true;
      setSize({ width: measuredWidth, height: measuredHeight });
      return;
    }
    const id = window.setTimeout(() => setSize({ width: measuredWidth, height: measuredHeight }), SIZE_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [measuredWidth, measuredHeight]);
  const { width, height } = size;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const skyRef = useRef<SVGGElement | null>(null);
  const targets = useRef<PaintTargets>(emptyTargets());
  const worldRef = useRef<World | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const frameRef = useRef<Frame | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const gestureRef = useRef<Gesture>({ pointers: new Map(), distance: 0, midX: 0, midY: 0 });
  const builtKeyRef = useRef<string | null>(null);
  const wakeLoopRef = useRef<() => void>(() => undefined);
  /** Armed by a node grab, disarmed when the sky falls asleep again. */
  const joinArmedRef = useRef(false);
  const onMetricsRef = useRef(onMetrics);

  const [structure, setStructure] = useState<ConstellationStructure | null>(null);
  const [happyIds, setHappyIds] = useState<ReadonlySet<string>>(new Set());
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [centred, setCentred] = useState(true);

  const dataKey = useMemo(() => buildDataKey(me, matches), [me, matches]);
  const meta = useMemo(() => buildNodeMeta(me, matches), [me, matches]);
  const threshold = useMemo(() => thresholdOverride ?? getTrackThreshold(track), [track, thresholdOverride]);
  const activeMatches = useMemo(() => matchesForTrack(matches, track, threshold), [matches, track, threshold]);

  useEffect(() => {
    onMetricsRef.current = onMetrics;
  }, [onMetrics]);

  // ─── Scene (re)build: boot, new data, resize, track switch ────────────────
  const sceneKey = width > 0 && height > 0 ? `${dataKey}|${width}x${height}|${ghostCount}|${maxMatches ?? ""}` : null;
  useEffect(() => {
    if (sceneKey === null) return;
    const scene = buildScene(
      {
        selfId: me.id,
        matches: toSceneMatches(matches),
        track,
        threshold,
        width,
        height,
        ghostCount,
        ...(pairSimilarity ? { pairSimilarity } : {}),
        ...(maxMatches !== undefined ? { maxMatches } : {}),
      },
      cfg,
      worldRef.current ? new Map(worldRef.current.bodies.map((b) => [b.id, { x: b.x, y: b.y }])) : undefined,
    );
    const previous = worldRef.current;
    let world: World;
    if (reducedMotion) {
      // Offline settle: the same simulation, run to rest before painting.
      world = settle(createWorld(scene, cfg, "settled"), cfg);
    } else if (previous && previous.width === width && previous.height === height) {
      world = transitionWorld(previous, scene, cfg);
    } else {
      // First paint flies in from the rim; a resize just re-seats the sky.
      world = createWorld(scene, cfg, previous ? "settled" : "from-edge");
    }
    builtKeyRef.current = sceneKey;
    worldRef.current = world;
    if (!cameraRef.current || cameraRef.current.tx > width || cameraRef.current.ty > height) {
      cameraRef.current = createCamera(width, height, cfg.camera);
    }
    warmSpriteSheets([
      { animalId: me.animalId, colorId: me.colorId, mark: me.mark ?? null },
      { animalId: GHOST_ANIMAL_ID, colorId: GHOST_COLOR_ID },
      ...matches.map((m) => ({ animalId: m.animalId, colorId: m.colorId, mark: m.mark ?? null })),
    ]);
    setStructure(structureFromWorld(world, meta, track));
    wakeLoopRef.current();
      // `meta`, `matches`, `me` and the sizes are all covered by `sceneKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneKey, track, threshold, reducedMotion, cfg]);

  // ─── Painting ─────────────────────────────────────────────────────────────
  const collectTargets = useCallback((): void => {
    const root = svgRef.current;
    const next = emptyTargets();
    if (root) {
      for (const el of root.querySelectorAll<SVGGElement>("[data-node-id]")) next.nodes.set(el.dataset.nodeId ?? "", el);
      for (const el of root.querySelectorAll<SVGGElement>("[data-body-id]")) next.bodies.set(el.dataset.bodyId ?? "", el);
      for (const el of root.querySelectorAll<SVGLineElement>("[data-line-key]")) next.lines.set(el.dataset.lineKey ?? "", el);
      for (const el of root.querySelectorAll<SVGRectElement>("[data-flash-key]")) next.flashes.set(el.dataset.flashKey ?? "", el);
      next.groups = [...root.querySelectorAll<SVGPolygonElement>("[data-group]")];
    }
    targets.current = next;
  }, []);

  const paint = useCallback(
    (frame: Frame): void => {
      const t = targets.current;
      const camera = cameraRef.current;
      const svg = svgRef.current;
      const world = worldRef.current;
      if (!svg || !camera || !world) return;
      const vb = viewBox(camera, world.width, world.height);
      write(t, svg, "viewBox", `${round2(vb.x)} ${round2(vb.y)} ${round2(vb.w)} ${round2(vb.h)}`);
      if (skyRef.current) {
        write(
          t,
          skyRef.current,
          "transform",
          `translate(${round2(world.cx)} ${round2(world.cy)}) scale(${frame.breathe.toFixed(4)}) translate(${round2(-world.cx)} ${round2(-world.cy)})`,
        );
      }
      for (const star of frame.stars) {
        const el = t.nodes.get(star.id);
        if (!el) continue;
        write(t, el, "transform", `translate(${round2(star.x)} ${round2(star.y)})`);
        const body = t.bodies.get(star.id);
        if (body) write(t, body, "opacity", star.alpha.toFixed(2));
      }
      for (const line of frame.lines) {
        const el = t.lines.get(line.key);
        if (!el) continue;
        const ex = line.ax + (line.bx - line.ax) * line.progress;
        const ey = line.ay + (line.by - line.ay) * line.progress;
        write(t, el, "x1", String(round2(line.ax)));
        write(t, el, "y1", String(round2(line.ay)));
        write(t, el, "x2", String(round2(ex)));
        write(t, el, "y2", String(round2(ey)));
        write(t, el, "opacity", line.visibility.toFixed(2));
      }
      const live = new Set(frame.flashes.map((f) => f.key));
      for (const [key, el] of t.flashes) {
        if (!live.has(key)) write(t, el, "opacity", "0");
      }
      for (const flash of frame.flashes) {
        const el = t.flashes.get(flash.key);
        if (!el) continue;
        write(t, el, "x", String(Math.round(flash.x) - 1));
        write(t, el, "y", String(Math.round(flash.y) - 1));
        write(t, el, "opacity", flash.intensity.toFixed(2));
      }
      frame.groups.forEach((group, index) => {
        const el = t.groups[index];
        if (!el) return;
        write(t, el, "points", group.points.map((p) => `${round2(p.x)},${round2(p.y)}`).join(" "));
        const length = polylineLength(group.points);
        write(
          t,
          el,
          "stroke-dasharray",
          group.progress >= 1 ? `${LINE_DASH[0]} ${LINE_DASH[1]}` : `${round2(length * group.progress)} ${round2(length)}`,
        );
        write(t, el, "opacity", group.progress > 0 ? "1" : "0");
      });
    },
    [],
  );

  const syncHappy = useCallback((frame: Frame): void => {
    const next = new Set(frame.stars.filter((s) => s.happy).map((s) => s.id));
    const current = targets.current.happy;
    if (next.size === current.size && [...next].every((id) => current.has(id))) return;
    // A star turning happy = a bond that just joined. Only chime for unions the
    // person caused (drag/throw), never for the sky settling on its own.
    if (joinArmedRef.current && [...next].some((id) => !current.has(id))) emitFeedback("join");
    targets.current.happy = next;
    setHappyIds(next);
  }, []);

  useEffect(() => {
    if (!structure) return;
    collectTargets();
    const world = worldRef.current;
    if (!world) return;
    const frame = buildFrame(world, cfg, { alpha: 1, still: reducedMotion });
    frameRef.current = frame;
    paint(frame);
    syncHappy(frame);
  }, [structure, reducedMotion, cfg, collectTargets, paint, syncHappy]);

  // ─── The loop ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!structure || reducedMotion) {
      wakeLoopRef.current = () => {
        const world = worldRef.current;
        if (!world) return;
        const frame = buildFrame(world, cfg, { alpha: 1, still: true });
        paint(frame);
      };
      return;
    }
    let raf = 0;
    let last = 0;
    let frameCount = 0;
    let fpsFrames = 0;
    let fpsSince = 0;
    let fps = 0;
    let lastMetrics = 0;

    const tick = (now: number): void => {
      raf = window.requestAnimationFrame(tick);
      const world = worldRef.current;
      const camera = cameraRef.current;
      if (!world || !camera) return;
      const seconds = last === 0 ? 1 / 60 : (now - last) / 1000;
      last = now;
      frameCount++;
      fpsFrames++;
      if (fpsSince === 0) fpsSince = now;
      if (now - fpsSince >= METRICS_WINDOW_MS) {
        fps = Math.round((fpsFrames * 1000) / (now - fpsSince));
        fpsFrames = 0;
        fpsSince = now;
      }

      const cameraMoving = easeCamera(camera, seconds);
      const wasAsleep = world.asleep;
      const started = performance.now();
      const result = advance(world, seconds, cfg);
      const spent = performance.now() - started;
      if (world.asleep && !dragRef.current) joinArmedRef.current = false;
      if (wasAsleep && !cameraMoving && frameCount % cfg.ambient.idleFrameDivider !== 0) return;

      const frame = buildFrame(world, cfg, { alpha: result.alpha, still: false });
      frameRef.current = frame;
      paint(frame);
      syncHappy(frame);
      if (cameraMoving) setCentred(isCentred(camera, world.width, world.height));

      const report = onMetricsRef.current;
      if (report && now - lastMetrics >= METRICS_WINDOW_MS / 2) {
        lastMetrics = now;
        const metrics: CanvasMetrics = {
          fps,
          msPerStep: result.steps > 0 ? spent / result.steps : 0,
          stepsPerFrame: result.steps,
          kinetic: world.kinetic,
          contacts: result.contacts,
          jitter: world.jitter,
          asleep: world.asleep,
          settleSeconds: world.sleptAt === null ? null : world.sleptAt - world.wokeAt,
          bodies: world.bodies.length,
          links: world.links.length,
          groups: world.groups.length,
        };
        report(metrics);
      }
    };

    const start = (): void => {
      if (raf !== 0 || document.hidden) return;
      last = 0;
      raf = window.requestAnimationFrame(tick);
    };
    const stop = (): void => {
      if (raf === 0) return;
      window.cancelAnimationFrame(raf);
      raf = 0;
    };
    const onVisibility = (): void => (document.hidden ? stop() : start());
    wakeLoopRef.current = () => {
      const world = worldRef.current;
      if (world) wake(world);
      start();
    };
    document.addEventListener("visibilitychange", onVisibility);
    start();
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      wakeLoopRef.current = () => undefined;
    };
  }, [structure, reducedMotion, cfg, paint, syncHappy]);

  // ─── Coordinates ──────────────────────────────────────────────────────────
  const toWorld = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const element = surfaceRef.current;
      const camera = cameraRef.current;
      const world = worldRef.current;
      if (!element || !camera || !world) return null;
      const rect = element.getBoundingClientRect();
      const sx = ((clientX - rect.left) / Math.max(1, rect.width)) * world.width;
      const sy = ((clientY - rect.top) / Math.max(1, rect.height)) * world.height;
      return screenToWorld(camera, world.width, world.height, sx, sy);
    },
    [surfaceRef],
  );

  const toScreen = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const element = surfaceRef.current;
      const world = worldRef.current;
      if (!element || !world) return null;
      const rect = element.getBoundingClientRect();
      return {
        x: ((clientX - rect.left) / Math.max(1, rect.width)) * world.width,
        y: ((clientY - rect.top) / Math.max(1, rect.height)) * world.height,
      };
    },
    [surfaceRef],
  );

  const repaintStill = useCallback((): void => {
    const world = worldRef.current;
    if (!world) return;
    const frame = buildFrame(world, cfg, { alpha: 1, still: true });
    paint(frame);
  }, [cfg, paint]);

  const cameraChanged = useCallback((): void => {
    const camera = cameraRef.current;
    const world = worldRef.current;
    if (!camera || !world) return;
    if (reducedMotion) {
      camera.x = camera.tx;
      camera.y = camera.ty;
      camera.zoom = camera.tzoom;
      repaintStill();
    }
    setCentred(isCentred(camera, world.width, world.height));
    wakeLoopRef.current();
  }, [reducedMotion, repaintStill]);

  // ─── Pointer: drag a star, pinch / pan the sky ────────────────────────────
  const updateGesture = useCallback((): void => {
    const g = gestureRef.current;
    const points = [...g.pointers.values()];
    if (points.length < 2) return;
    const [a, b] = points as [{ x: number; y: number }, { x: number; y: number }];
    g.distance = Math.hypot(b.x - a.x, b.y - a.y);
    g.midX = (a.x + b.x) / 2;
    g.midY = (a.y + b.y) / 2;
  }, []);

  const endNodeDrag = useCallback(
    (pointerId: number, cancelled: boolean): void => {
      const drag = dragRef.current;
      const world = worldRef.current;
      if (!drag || drag.pointerId !== pointerId) return;
      dragRef.current = null;
      if (world) {
        const velocity = reducedMotion
          ? { x: 0, y: 0 }
          : estimateVelocity(drag.trail, performance.now(), cfg.interaction.throwWindowMs, cfg.interaction.maxThrowSpeed);
        release(world, velocity);
        if (reducedMotion) {
          settle(world, cfg);
          repaintStill();
        } else {
          wakeLoopRef.current();
        }
      }
      if (!cancelled && !drag.moved) onSelectNode(drag.id);
    },
    [cfg, reducedMotion, onSelectNode, repaintStill],
  );

  const handleNodePointerDown = useCallback(
    (event: ReactPointerEvent<SVGGElement>, nodeId: string): void => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const world = worldRef.current;
      const point = toWorld(event.clientX, event.clientY);
      const index = world?.index.get(nodeId);
      const body = index === undefined ? undefined : world?.bodies[index];
      if (!world || !point || !body) return;
      if (body.kind === "self") return;
      event.stopPropagation();
      svgRef.current?.setPointerCapture(event.pointerId);
      joinArmedRef.current = true;
      const trail = createTrail();
      pushSample(trail, { t: performance.now(), x: point.x, y: point.y });
      dragRef.current = {
        kind: "node",
        id: nodeId,
        pointerId: event.pointerId,
        dx: body.x - point.x,
        dy: body.y - point.y,
        originX: event.clientX,
        originY: event.clientY,
        moved: false,
        trail,
      };
    },
    [toWorld],
  );

  const handleSurfacePointerDown = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>): void => {
      if (dragRef.current) return;
      const screen = toScreen(event.clientX, event.clientY);
      if (!screen) return;
      gestureRef.current.pointers.set(event.pointerId, screen);
      svgRef.current?.setPointerCapture(event.pointerId);
      updateGesture();
    },
    [toScreen, updateGesture],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>): void => {
      const drag = dragRef.current;
      if (drag && event.pointerId === drag.pointerId) {
        if (!drag.moved) {
          const travel = Math.hypot(event.clientX - drag.originX, event.clientY - drag.originY);
          if (travel < cfg.interaction.tapSlopPx) return;
          drag.moved = true;
          const world = worldRef.current;
          const start = toWorld(drag.originX, drag.originY);
          if (!world || !start || !grab(world, drag.id, start.x + drag.dx, start.y + drag.dy)) {
            dragRef.current = null;
            return;
          }
        }
        const point = toWorld(event.clientX, event.clientY);
        const world = worldRef.current;
        if (!point || !world) return;
        pushSample(drag.trail, { t: performance.now(), x: point.x, y: point.y });
        moveAnchor(world, point.x + drag.dx, point.y + drag.dy);
        if (reducedMotion) {
          placeAt(world, drag.id, point.x + drag.dx, point.y + drag.dy);
          repaintStill();
        } else {
          wakeLoopRef.current();
        }
        return;
      }

      const g = gestureRef.current;
      if (!g.pointers.has(event.pointerId)) return;
      const screen = toScreen(event.clientX, event.clientY);
      const camera = cameraRef.current;
      const world = worldRef.current;
      if (!screen || !camera || !world) return;
      g.pointers.set(event.pointerId, screen);
      if (g.pointers.size < 2) return;
      const before = { distance: g.distance, midX: g.midX, midY: g.midY };
      updateGesture();
      if (before.distance > 0) {
        zoomAt(camera, g.distance / before.distance, g.midX, g.midY, world.width, world.height, cfg.camera);
      }
      panBy(camera, g.midX - before.midX, g.midY - before.midY, world.width, world.height, cfg.camera);
      cameraChanged();
    },
    [cfg, reducedMotion, toWorld, toScreen, updateGesture, cameraChanged, repaintStill],
  );

  const handlePointerEnd = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>, cancelled: boolean): void => {
      const svg = svgRef.current;
      if (svg?.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
      if (dragRef.current?.pointerId === event.pointerId) {
        endNodeDrag(event.pointerId, cancelled);
        return;
      }
      gestureRef.current.pointers.delete(event.pointerId);
      updateGesture();
    },
    [endNodeDrag, updateGesture],
  );

  // Wheel / trackpad pinch. Needs a non-passive listener to stop page zoom.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent): void => {
      const camera = cameraRef.current;
      const world = worldRef.current;
      const screen = toScreen(event.clientX, event.clientY);
      if (!camera || !world || !screen) return;
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * cfg.camera.wheelSensitivity);
      zoomAt(camera, factor, screen.x, screen.y, world.width, world.height, cfg.camera);
      cameraChanged();
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [structure, cfg, toScreen, cameraChanged]);

  const zoomButton = useCallback(
    (factor: number): void => {
      const camera = cameraRef.current;
      const world = worldRef.current;
      if (!camera || !world) return;
      zoomAt(camera, factor, world.width / 2, world.height / 2, world.width, world.height, cfg.camera);
      cameraChanged();
    },
    [cfg, cameraChanged],
  );

  const handleRecenter = useCallback((): void => {
    const camera = cameraRef.current;
    const world = worldRef.current;
    if (!camera || !world) return;
    recenter(camera, world.width, world.height, cfg.camera);
    cameraChanged();
  }, [cfg, cameraChanged]);

  useEffect(() => {
    if (!controlRef) return;
    controlRef.current = {
      recenter: handleRecenter,
      kick: () => {
        const world = worldRef.current;
        if (!world) return;
        const rand = mulberry32(world.steps + 1);
        kick(world, cfg.interaction.kickSpeed, () => rand());
        if (reducedMotion) {
          settle(world, cfg);
          repaintStill();
        } else {
          wakeLoopRef.current();
        }
      },
    };
    return () => {
      controlRef.current = null;
    };
  }, [controlRef, cfg, reducedMotion, handleRecenter, repaintStill]);

  // ─── Highlight ────────────────────────────────────────────────────────────
  const activeId = selectedNodeId ?? focusId ?? hoverId;
  const ringId = focusId ?? selectedNodeId;
  // Only one element breathes: your star while nothing is in focus; if your
  // star is not on the canvas (track switch), the top match. Focus / selection
  // pause it so the ring is the one thing that moves the eye.
  const breathId = useMemo(() => {
    if (!structure || activeId !== null || reducedMotion) return null;
    const self = structure.nodes.find((node) => node.isSelf && !node.isLeaving);
    if (self) return self.id;
    const top = structure.nodes.find((node) => node.radiant);
    return top?.id ?? null;
  }, [structure, activeId, reducedMotion]);
  const focusSet = useMemo(() => {
    const set = new Set<string>();
    if (!structure || !activeId) return set;
    set.add(activeId);
    for (const neighbour of structure.adjacency.get(activeId) ?? []) set.add(neighbour);
    return set;
  }, [structure, activeId]);
  const similarityById = useMemo(() => new Map(matches.map((m) => [m.id, m.similarity])), [matches]);
  const romancePulseId =
    track === "romance" && activeId !== null && (similarityById.get(activeId) ?? 0) >= ROMANCE_SPRITE_THRESHOLD
      ? activeId
      : null;

  const starHandlers = useMemo<StarHandlers>(
    () => ({
      pointerDown: handleNodePointerDown,
      hover: (next, leaving) => setHoverId((current) => (next === null && current !== leaving ? current : next)),
      focus: (next, leaving) => setFocusId((current) => (next === null && current !== leaving ? current : next)),
      select: onSelectNode,
    }),
    [handleNodePointerDown, onSelectNode],
  );

  const isEmpty = structure !== null && activeMatches.length === 0;
  const booting = structure === null;
  const rootStyle = { height: "min(72vh, 44rem)", minHeight: "22rem", ...style };

  return (
    <div className={`zm-canvas ${className ?? ""}`.trim()} style={rootStyle}>
      <div ref={surfaceRef} className="zm-canvas__surface" data-track={track}>
        {structure && width > 0 && height > 0 ? (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${structure.width} ${structure.height}`}
            className="zm-canvas__svg"
            role="group"
            aria-label={CONSTELLATION_COPY.canvasLabel}
            style={{ touchAction: "none" }}
            onPointerDown={handleSurfacePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={(event) => handlePointerEnd(event, false)}
            onPointerCancel={(event) => handlePointerEnd(event, true)}
            onDragStart={(event) => event.preventDefault()}
          >
            {/* Pre-rendered Bayer halos: three affinity steps plus the two gold ones. */}
            <GlowDefs />
            <g ref={skyRef}>
              {/* ── Group figures ── */}
              <g aria-hidden="true" fill="none">
                {structure.groups.map((ids) => (
                  <polygon
                    key={ids.join("|")}
                    data-group="1"
                    className="zm-canvas__figure"
                    strokeWidth={1}
                    opacity={0}
                    shapeRendering="crispEdges"
                  />
                ))}
              </g>

              {/* ── Constellation lines ── */}
              <g aria-hidden="true" fill="none" strokeLinecap="butt" shapeRendering="crispEdges">
                {structure.edges.map((edge) => {
                  const lit = activeId !== null && (edge.source === activeId || edge.target === activeId);
                  return (
                    <line
                      key={edge.key}
                      data-line-key={edge.key}
                      className={edge.radiant ? "zm-canvas__line zm-canvas__line--radiant" : "zm-canvas__line"}
                      strokeWidth={lit ? edge.width + LIT_STROKE_EXTRA : edge.width}
                      strokeOpacity={lit ? Math.min(1, edge.opacity + EDGE_LIT_BOOST) : edge.opacity}
                      strokeDasharray={`${LINE_DASH[0]} ${LINE_DASH[1]}`}
                    />
                  );
                })}
              </g>

              {/* ── Join flashes: one pixel of light ── */}
              <g aria-hidden="true">
                {structure.edges.map((edge) => (
                  <rect
                    key={edge.key}
                    data-flash-key={edge.key}
                    width={2}
                    height={2}
                    className="zm-canvas__flash"
                    opacity={0}
                    shapeRendering="crispEdges"
                  />
                ))}
              </g>

              {/* ── Stars ── */}
              <g>
                {structure.nodes.map((node) => {
                  const interactive = !node.isGhost && !node.isLeaving;
                  const romance = romancePulseId === node.id;
                  return (
                    <StarNode
                      key={node.id}
                      node={node}
                      romance={romance}
                      happy={!romance && (focusSet.has(node.id) || happyIds.has(node.id))}
                      dimmed={activeId !== null && interactive && !node.isSelf && !focusSet.has(node.id)}
                      ringed={ringId === node.id}
                      breathing={breathId === node.id}
                      showTag={interactive && (node.isSelf || node.id === activeId)}
                      reducedMotion={reducedMotion}
                      flatGlow={structure.nodes.length > cfg.scene.denseSkyStars}
                      handlers={starHandlers}
                    />
                  );
                })}
              </g>
            </g>
          </svg>
        ) : null}

        {booting ? (
          <div className="zm-canvas__overlay">
            <p className="zm-canvas__status" role="status" aria-live="polite">
              {CONSTELLATION_COPY.loading}
            </p>
          </div>
        ) : null}

        {structure ? (
          <div className="zm-canvas__controls">
            <Button variant="ghost" className="zm-btn--icon" aria-label={CONSTELLATION_COPY.zoomIn} title={CONSTELLATION_COPY.zoomIn} onClick={() => zoomButton(ZOOM_STEP)}>
              <span aria-hidden="true">+</span>
            </Button>
            <Button variant="ghost" className="zm-btn--icon" aria-label={CONSTELLATION_COPY.zoomOut} title={CONSTELLATION_COPY.zoomOut} onClick={() => zoomButton(1 / ZOOM_STEP)}>
              <span aria-hidden="true">−</span>
            </Button>
            <IconButton
              icon="recenter"
              label={CONSTELLATION_COPY.recenter}
              onClick={handleRecenter}
              disabled={centred}
            />
          </div>
        ) : null}

        {isEmpty ? (
          <div className="zm-canvas__empty">
            <p className="zm-box zm-canvas__empty-card">
              {emptyMessage ?? (track === "romance" ? CONSTELLATION_COPY.emptyRomance : CONSTELLATION_COPY.emptyAmistad)}
            </p>
          </div>
        ) : null}
      </div>

      <section className="zm-sr-only" aria-labelledby="constellation-sr-heading">
        <h2 id="constellation-sr-heading">{CONSTELLATION_COPY.srListHeading}</h2>
        <p>{CONSTELLATION_COPY.srListIntro}</p>
        <ul>
          <li>{selfAriaLabel(me.animalName, me.colorName, me.alias)}</li>
          {activeMatches.length === 0 ? (
            <li>{CONSTELLATION_COPY.srNoConnections}</li>
          ) : (
            activeMatches.map((match) => (
              <li key={match.id}>
                {`${match.alias} — ${matchAriaLabel(match.animalName, match.colorName, match.similarity, match.track)}. ${CONSTELLATION_COPY.srOpenDetail}.`}
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}

/**
 * Memoised so a parent re-render (the dev panel updates its metrics twice a
 * second) never reconciles the sky; only its own state changes do.
 */
export const ConstellationCanvas = memo(ConstellationCanvasImpl);

export default ConstellationCanvas;
