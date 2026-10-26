"use client";

/**
 * ConstellationCanvas — the interactive sky.
 *
 * ─── Rendering technology: SVG ───────────────────────────────────────────────
 * SVG (not canvas 2D) because:
 *   1. every real star must be a focusable `role="button"` with an es-MX
 *      `aria-label`, which canvas cannot do without a parallel shadow tree;
 *   2. pixel sprites stay razor-sharp at any DPR through a nested 12×12 viewBox
 *      plus `image-rendering: pixelated`, with no manual scale math;
 *   3. the node count is bounded (≤ 50 real + ≤ 12 ghosts) and each star costs
 *      three DOM elements thanks to the sprite-sheet trick, so the whole sky is
 *      under ~250 elements — comfortably inside SVG's budget.
 * Lines are capped by `selectRenderEdges` (see render-helpers) because stroking
 * hundreds of semi-transparent segments per frame is the real mobile cost.
 *
 * ─── Per-frame work: refs, never state ───────────────────────────────────────
 * React renders the *static* structure once per data / size / track change. The
 * `requestAnimationFrame` loop then writes `transform` on each `<g>` and
 * `x1/y1/x2/y2` on each `<line>` directly. There is no `setState` anywhere in
 * the loop, so 60 fps costs zero reconciliation. React is safe with this: it
 * diffs against its own previous props, and `transform` never changes between
 * renders, so it never overwrites an imperative write.
 *
 * ─── Loop lifecycle ──────────────────────────────────────────────────────────
 *   • full rate   — while dragging or while `isEquilibrium` is false: up to
 *                   `MAX_STEPS_PER_FRAME` physics steps per frame, sized from the
 *                   real frame delta so a slow device simulates the same physics.
 *   • ambient     — once the engine latches equilibrium, the loop keeps running
 *                   but only steps every `AMBIENT_FRAME_DIVIDER`-th frame. The
 *                   engine's post-equilibrium drift is positional-only and keyed
 *                   on `tick`, so slowing the tick rate is exactly "gentle
 *                   ambient drift" instead of "full physics at 60 Hz".
 *   • stopped     — `document.hidden` cancels the rAF outright (and restarts it
 *                   on `visibilitychange`); reduced motion never starts it.
 *   • resumed     — drag start and track switch both clear `isEquilibrium`,
 *                   which drops the loop straight back to full rate.
 *
 * ─── Boot ────────────────────────────────────────────────────────────────────
 * Convergence is slow (~1750 ticks), so positions are seeded with
 * `precomputeLayout` (2000 ticks). That work plus the first `getSpriteFrame`
 * (which lazily builds the whole sprite catalogue, ~180 ms) is deferred behind a
 * double `requestAnimationFrame` so the "Acomodando las estrellas…" placeholder
 * paints first and the main thread is never blocked before first contentful
 * paint. Measured on this machine: 142 ms for 51 nodes / 702 edges.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  buildGraph,
  dragNode,
  getTrackThreshold,
  precomputeLayout,
  releaseNode,
  stepSimulation,
  switchTrack,
  type SimulationState,
} from "@/lib/constellation-layout";
import type { MatchTrack } from "@/types/microtest";

import {
  buildNodeMeta,
  structureFromState,
  toMatchInputs,
  toSelfIdentity,
} from "./build-structure";
import { useElementSize } from "./hooks";
import { PixelAnimal } from "./PixelAnimal";
import {
  AMBIENT_FRAME_DIVIDER,
  DRAG_CLICK_SLOP,
  GHOST_ANIMAL_ID,
  GHOST_COLOR_ID,
  HIT_RADIUS_PADDING,
  JOIN_DISTANCE_FACTOR,
  MAX_RENDERED_EDGES,
  MAX_SPARKS,
  MAX_STEPS_PER_FRAME,
  SIZE_DEBOUNCE_MS,
  SPARK_LIFETIME_MS,
  applyCachedPositions,
  buildDataKey,
  capturePositions,
  clamp,
  clientToViewBox,
  distance,
  heartRects,
  matchAriaLabel,
  matchesForTrack,
  pruneInactiveNodes,
  round2,
  selfAriaLabel,
  type CachedPosition,
} from "./render-helpers";
import { warmSpriteSheets } from "./sprite-sheet";
import { CONSTELLATION_COPY } from "./types";
import type {
  ConstellationCanvasProps,
  ConstellationStructure,
  NodeMeta,
} from "./types";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Nominal frame length used to convert a real delta into a step count. */
const FRAME_MS = 1000 / 60;

interface DragState {
  id: string;
  pointerId: number;
  /** Node-to-pointer offset in user units, so the star never jumps on grab. */
  dx: number;
  dy: number;
  originX: number;
  originY: number;
  x: number;
  y: number;
  moved: boolean;
}

interface Spark {
  element: SVGGElement;
  sourceId: string;
  targetId: string;
  born: number;
}

/** Builds one pixel-heart spark group, half in each node's colour. */
function createSpark(colorA: string, colorB: string, sourceId: string, targetId: string, born: number): Spark {
  const group = document.createElementNS(SVG_NS, "g") as SVGGElement;
  group.setAttribute("aria-hidden", "true");
  group.setAttribute("opacity", "0");
  for (const rect of heartRects()) {
    const element = document.createElementNS(SVG_NS, "rect");
    element.setAttribute("x", String(rect.x));
    element.setAttribute("y", String(rect.y));
    element.setAttribute("width", String(rect.w));
    element.setAttribute("height", "1");
    element.setAttribute("fill", rect.colorIndex === 0 ? colorA : colorB);
    element.setAttribute("shape-rendering", "crispEdges");
    group.appendChild(element);
  }
  return { element: group, sourceId, targetId, born };
}

export function ConstellationCanvas({
  me,
  matches,
  track,
  ghostCount = 8,
  reducedMotion,
  selectedNodeId,
  onSelectNode,
  className,
  style,
  emptyMessage,
  maxRenderedEdges = MAX_RENDERED_EDGES,
}: ConstellationCanvasProps) {
  const { ref: surfaceRef, width: measuredWidth, height: measuredHeight } =
    useElementSize<HTMLDivElement>();

  /**
   * Debounced size. The first measurement is applied immediately (so boot is not
   * delayed); later ones wait, because every change re-runs the whole
   * `precomputeLayout` and a window drag fires `ResizeObserver` continuously.
   */
  const [size, setSize] = useState({ width: 0, height: 0 });
  const hasSizeRef = useRef(false);
  useEffect(() => {
    if (measuredWidth <= 0 || measuredHeight <= 0) return;
    if (!hasSizeRef.current) {
      hasSizeRef.current = true;
      setSize({ width: measuredWidth, height: measuredHeight });
      return;
    }
    const id = window.setTimeout(
      () => setSize({ width: measuredWidth, height: measuredHeight }),
      SIZE_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(id);
  }, [measuredWidth, measuredHeight]);
  const { width, height } = size;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const nodesLayerRef = useRef<SVGGElement | null>(null);
  const edgesLayerRef = useRef<SVGGElement | null>(null);
  const sparksLayerRef = useRef<SVGGElement | null>(null);

  /** Imperative DOM handles, rebuilt whenever the structure changes. */
  const nodeEls = useRef<Map<string, SVGGElement>>(new Map());
  const edgeEls = useRef<Map<string, SVGLineElement>>(new Map());
  const colorById = useRef<Map<string, string>>(new Map());
  /** Last painted position per node id; mutated in place to avoid allocation. */
  const positions = useRef<Map<string, { x: number; y: number }>>(new Map());
  const sparks = useRef<Spark[]>([]);
  /** Edge keys whose "join" moment has already been consumed. */
  const joined = useRef<Set<string>>(new Set());

  const simRef = useRef<SimulationState | null>(null);
  const structureRef = useRef<ConstellationStructure | null>(null);
  const metaRef = useRef<Map<string, NodeMeta>>(new Map());
  const trackRef = useRef<MatchTrack>(track);
  const builtKeyRef = useRef<string | null>(null);
  /** Remembers positions across track switches so switching back restores them. */
  const memoryRef = useRef<Map<string, CachedPosition>>(new Map());
  const dragRef = useRef<DragState | null>(null);

  const [structure, setStructure] = useState<ConstellationStructure | null>(null);
  const [booting, setBooting] = useState(true);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);

  // ─── Derived (cheap) ──────────────────────────────────────────────────────
  const dataKey = useMemo(() => buildDataKey(me, matches), [me, matches]);
  const meta = useMemo(() => buildNodeMeta(me, matches), [me, matches]);

  const threshold = useMemo(() => getTrackThreshold(track), [track]);
  const activeMatches = useMemo(
    () => matchesForTrack(matches, track, threshold),
    [matches, track, threshold],
  );

  const bootKey = width > 0 && height > 0 ? `${dataKey}|${width}x${height}` : null;

  /**
   * Mirrors the latest render values into the refs the imperative effects read.
   *
   * The write happens in an effect rather than during render (React's ref rule),
   * and this effect is declared *before* the boot and track-switch effects that
   * consume `trackRef` / `metaRef`, so both are always current by the time those
   * run. `trackRef` exists precisely so the expensive boot rebuild does not have
   * to list `track` as a dependency.
   */
  useEffect(() => {
    trackRef.current = track;
    metaRef.current = meta;
  }, [track, meta]);

  // ─── Imperative painting ──────────────────────────────────────────────────
  const clearSparks = useCallback((): void => {
    for (const spark of sparks.current) spark.element.remove();
    sparks.current = [];
  }, []);

  const paint = useCallback((state: SimulationState | null): void => {
    if (!state) return;
    const pos = positions.current;
    const nodeMap = nodeEls.current;
    for (const node of state.nodes) {
      const x = round2(node.x);
      const y = round2(node.y);
      const entry = pos.get(node.id);
      if (entry) {
        entry.x = x;
        entry.y = y;
      } else {
        pos.set(node.id, { x, y });
      }
      const element = nodeMap.get(node.id);
      if (element) element.setAttribute("transform", `translate(${x} ${y})`);
    }

    const current = structureRef.current;
    if (!current) return;
    const edgeMap = edgeEls.current;
    for (const edge of current.edges) {
      const element = edgeMap.get(edge.key);
      if (!element) continue;
      const a = pos.get(edge.source);
      const b = pos.get(edge.target);
      if (!a || !b) continue;
      element.setAttribute("x1", String(a.x));
      element.setAttribute("y1", String(a.y));
      element.setAttribute("x2", String(b.x));
      element.setAttribute("y2", String(b.y));
    }
  }, []);

  const updateSparks = useCallback(
    (structureNow: ConstellationStructure, now: number): void => {
      const layer = sparksLayerRef.current;
      if (!layer) return;
      const pos = positions.current;
      const joinedSet = joined.current;
      const colors = colorById.current;

      if (sparks.current.length < MAX_SPARKS) {
        for (const edge of structureNow.edges) {
          if (joinedSet.has(edge.key)) continue;
          const a = pos.get(edge.source);
          const b = pos.get(edge.target);
          if (!a || !b) {
            joinedSet.add(edge.key);
            continue;
          }
          if (distance(a.x, a.y, b.x, b.y) > edge.targetDistance * JOIN_DISTANCE_FACTOR) continue;
          joinedSet.add(edge.key);
          const spark = createSpark(
            colors.get(edge.source) ?? "#e8a0bf",
            colors.get(edge.target) ?? "#7ec8a9",
            edge.source,
            edge.target,
            now,
          );
          layer.appendChild(spark.element);
          sparks.current.push(spark);
          if (sparks.current.length >= MAX_SPARKS) break;
        }
      }

      const alive: Spark[] = [];
      for (const spark of sparks.current) {
        const t = (now - spark.born) / SPARK_LIFETIME_MS;
        const a = pos.get(spark.sourceId);
        const b = pos.get(spark.targetId);
        if (t >= 1 || !a || !b) {
          spark.element.remove();
          continue;
        }
        const swell = Math.sin(Math.PI * t);
        const scale = 0.6 + 0.8 * swell;
        spark.element.setAttribute(
          "transform",
          `translate(${round2((a.x + b.x) / 2)} ${round2((a.y + b.y) / 2)}) scale(${scale.toFixed(3)})`,
        );
        spark.element.setAttribute("opacity", swell.toFixed(3));
        alive.push(spark);
      }
      sparks.current = alive;
    },
    [],
  );

  // ─── Boot: warm sprites, then precompute the settled layout ───────────────
  useEffect(() => {
    if (bootKey === null || builtKeyRef.current === bootKey) return;
    let cancelled = false;
    let second = 0;
    setBooting(true);

    const first = window.requestAnimationFrame(() => {
      second = window.requestAnimationFrame(() => {
        if (cancelled) return;
        const activeTrack = trackRef.current;
        const activeThreshold = getTrackThreshold(activeTrack);
        const nextMeta = metaRef.current;

        // Building the sprite catalogue is the single most expensive lazy init
        // in the app; do it here, while the placeholder is on screen.
        const pairs: { animalId: string; colorId: string }[] = [
          { animalId: me.animalId, colorId: me.colorId },
        ];
        if (ghostCount > 0) pairs.push({ animalId: GHOST_ANIMAL_ID, colorId: GHOST_COLOR_ID });
        for (const match of matchesForTrack(matches, activeTrack, activeThreshold)) {
          pairs.push({ animalId: match.animalId, colorId: match.colorId });
        }
        warmSpriteSheets(pairs);

        const graph = buildGraph(
          toSelfIdentity(me),
          toMatchInputs(matches),
          activeTrack,
          activeThreshold,
          width,
          height,
          ghostCount,
        );
        const settled = pruneInactiveNodes(precomputeLayout(graph, width, height));

        simRef.current = settled;
        memoryRef.current = capturePositions(settled);
        builtKeyRef.current = bootKey;
        setStructure(
          structureFromState(settled, nextMeta, activeThreshold, activeTrack, maxRenderedEdges),
        );
        setBooting(false);
      });
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(first);
      if (second) window.cancelAnimationFrame(second);
    };
  }, [bootKey, me, matches, ghostCount, width, height, maxRenderedEdges]);

  // ─── Track switch: cheap re-target, positions preserved ───────────────────
  const previousTrack = useRef<MatchTrack>(track);
  useEffect(() => {
    if (previousTrack.current === track) return;
    previousTrack.current = track;
    const state = simRef.current;
    // Not built yet (or being rebuilt): the boot effect reads `trackRef`, so it
    // will produce the right track on its own.
    if (!state || builtKeyRef.current === null) return;

    const nextThreshold = getTrackThreshold(track);
    for (const [id, position] of capturePositions(state)) memoryRef.current.set(id, position);
    let next = switchTrack(state, toMatchInputs(matches), track, nextThreshold);
    next = applyCachedPositions(next, memoryRef.current);
    next = pruneInactiveNodes(next);
    simRef.current = next;
    setStructure(
      structureFromState(next, metaRef.current, nextThreshold, track, maxRenderedEdges),
    );
  }, [track, matches, maxRenderedEdges]);

  // ─── Collect DOM handles whenever the structure changes ───────────────────
  useEffect(() => {
    if (!structure) return;
    structureRef.current = structure;

    const nextNodes = new Map<string, SVGGElement>();
    const nextEdges = new Map<string, SVGLineElement>();
    const nextColors = new Map<string, string>();
    const nodesRoot = nodesLayerRef.current;
    const edgesRoot = edgesLayerRef.current;
    if (nodesRoot) {
      for (const element of nodesRoot.querySelectorAll<SVGGElement>("[data-node-id]")) {
        const id = element.getAttribute("data-node-id");
        if (id) nextNodes.set(id, element);
      }
    }
    if (edgesRoot) {
      for (const element of edgesRoot.querySelectorAll<SVGLineElement>("[data-edge-key]")) {
        const key = element.getAttribute("data-edge-key");
        if (key) nextEdges.set(key, element);
      }
    }
    for (const node of structure.nodes) nextColors.set(node.id, node.colorHex);
    nodeEls.current = nextNodes;
    edgeEls.current = nextEdges;
    colorById.current = nextColors;

    // Seed the position cache and pre-consume every edge that is ALREADY within
    // spring distance, so a rebuild or a track switch never fires a storm of
    // join sparks for connections that were together all along. Only links that
    // form live — the ones the physics is still walking together — sparkle.
    const state = simRef.current;
    clearSparks();
    if (state) {
      const pos = new Map<string, { x: number; y: number }>();
      for (const node of state.nodes) pos.set(node.id, { x: node.x, y: node.y });
      positions.current = pos;
      const nextJoined = new Set<string>();
      for (const edge of structure.edges) {
        const a = pos.get(edge.source);
        const b = pos.get(edge.target);
        if (!a || !b) continue;
        if (distance(a.x, a.y, b.x, b.y) <= edge.targetDistance * JOIN_DISTANCE_FACTOR) {
          nextJoined.add(edge.key);
        }
      }
      joined.current = nextJoined;
      paint(state);
    }
  }, [structure, clearSparks, paint]);

  // ─── The animation loop ───────────────────────────────────────────────────
  useEffect(() => {
    if (!structure || reducedMotion) return;
    let raf = 0;
    let last = 0;
    let frame = 0;
    let active = true;

    const tick = (now: number): void => {
      if (!active) return;
      raf = window.requestAnimationFrame(tick);
      const state = simRef.current;
      const current = structureRef.current;
      if (!state || !current) return;

      const elapsed = last === 0 ? FRAME_MS : now - last;
      last = now;
      frame += 1;

      const dragging = dragRef.current !== null;
      const ambient = state.isEquilibrium && !dragging;
      if (ambient && frame % AMBIENT_FRAME_DIVIDER !== 0) return;

      const steps = ambient
        ? 1
        : clamp(Math.round(elapsed / FRAME_MS), 1, MAX_STEPS_PER_FRAME);
      let next = state;
      for (let i = 0; i < steps; i++) next = stepSimulation(next, 1);
      const drag = dragRef.current;
      if (drag) next = dragNode(next, drag.id, drag.x, drag.y);
      simRef.current = next;

      paint(next);
      updateSparks(current, now);
    };

    const start = (): void => {
      if (!active || raf !== 0) return;
      last = 0;
      raf = window.requestAnimationFrame(tick);
    };
    const stop = (): void => {
      if (raf === 0) return;
      window.cancelAnimationFrame(raf);
      raf = 0;
    };
    const onVisibilityChange = (): void => {
      if (document.hidden) stop();
      else start();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    if (!document.hidden) start();
    return () => {
      active = false;
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearSparks();
    };
  }, [structure, reducedMotion, paint, updateSparks, clearSparks]);

  // ─── Drag (pointer events → touch + mouse + pen) ──────────────────────────
  const toViewBox = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const element = surfaceRef.current;
      const current = structureRef.current;
      if (!element || !current) return null;
      const rect = element.getBoundingClientRect();
      return clientToViewBox(rect, current.width, current.height, clientX, clientY);
    },
    [surfaceRef],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<SVGGElement>, nodeId: string): void => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const state = simRef.current;
      if (!state) return;
      const point = toViewBox(event.clientX, event.clientY);
      if (!point) return;
      const node = state.nodes.find((candidate) => candidate.id === nodeId);
      if (!node) return;

      svgRef.current?.setPointerCapture(event.pointerId);
      dragRef.current = {
        id: nodeId,
        pointerId: event.pointerId,
        dx: node.x - point.x,
        dy: node.y - point.y,
        originX: event.clientX,
        originY: event.clientY,
        x: node.x,
        y: node.y,
        moved: false,
      };
      // With no loop running (reduced motion) the drag has to paint itself.
      if (reducedMotion) {
        const next = dragNode(state, nodeId, node.x, node.y);
        simRef.current = next;
        paint(next);
      }
    },
    [reducedMotion, paint, toViewBox],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>): void => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (!drag.moved) {
        const travel = Math.hypot(event.clientX - drag.originX, event.clientY - drag.originY);
        if (travel < DRAG_CLICK_SLOP) return;
        drag.moved = true;
      }
      const point = toViewBox(event.clientX, event.clientY);
      if (!point) return;
      drag.x = point.x + drag.dx;
      drag.y = point.y + drag.dy;
      if (reducedMotion) {
        const state = simRef.current;
        if (state) {
          const next = dragNode(state, drag.id, drag.x, drag.y);
          simRef.current = next;
          paint(next);
        }
      }
    },
    [reducedMotion, paint, toViewBox],
  );

  const endDrag = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>, cancelled: boolean): void => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      dragRef.current = null;
      const svg = svgRef.current;
      if (svg?.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
      const state = simRef.current;
      if (state) {
        const next = releaseNode(state, drag.id);
        simRef.current = next;
        // No loop under reduced motion: the impulse is simply never integrated
        // and the star stays exactly where it was dropped.
        if (reducedMotion) paint(next);
      }
      if (!cancelled && !drag.moved) onSelectNode(drag.id);
    },
    [reducedMotion, paint, onSelectNode],
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>): void => endDrag(event, false),
    [endDrag],
  );
  const handlePointerCancel = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>): void => endDrag(event, true),
    [endDrag],
  );
  const handleDragStart = useCallback((event: ReactDragEvent<SVGSVGElement>): void => {
    event.preventDefault();
  }, []);

  // ─── Highlight / happy set ────────────────────────────────────────────────
  const activeId = selectedNodeId ?? focusId ?? hoverId;
  const ringId = focusId ?? selectedNodeId;

  const happyIds = useMemo(() => {
    const set = new Set<string>();
    if (!structure || !activeId) return set;
    set.add(activeId);
    for (const neighbour of structure.adjacency.get(activeId) ?? []) set.add(neighbour);
    return set;
  }, [structure, activeId]);

  const isEmpty = !booting && structure !== null && activeMatches.length === 0;

  const rootStyle = {
    height: "min(72vh, 44rem)",
    minHeight: "22rem",
    ...style,
  };

  return (
    <div
      className={`constellation-canvas relative w-full select-none ${className ?? ""}`.trim()}
      style={rootStyle}
    >
      <div
        ref={surfaceRef}
        className="absolute inset-0 overflow-hidden rounded-3xl border border-ink/10"
        style={{
          touchAction: "none",
          background:
            "radial-gradient(circle at 50% 42%, #fbf7ec 0%, #f0eadb 52%, #e2dac6 100%)",
        }}
      >
        {structure && width > 0 && height > 0 ? (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${structure.width} ${structure.height}`}
            className="absolute inset-0 h-full w-full"
            role="group"
            aria-label={CONSTELLATION_COPY.canvasLabel}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onDragStart={handleDragStart}
          >
            {/* ── Connection lines ── */}
            <g ref={edgesLayerRef} aria-hidden="true" fill="none" strokeLinecap="round">
              {structure.edges.map((edge) => (
                <line
                  key={edge.key}
                  data-edge-key={edge.key}
                  x1={round2(edge.sourceX)}
                  y1={round2(edge.sourceY)}
                  x2={round2(edge.targetX)}
                  y2={round2(edge.targetY)}
                  stroke={edge.color}
                  strokeWidth={edge.width}
                  strokeOpacity={edge.opacity}
                />
              ))}
            </g>

            {/* ── Join sparks (populated imperatively) ── */}
            <g ref={sparksLayerRef} aria-hidden="true" />

            {/* ── Stars ── */}
            <g ref={nodesLayerRef}>
              {structure.nodes.map((node) => {
                const interactive = !node.isGhost;
                const isHappy = happyIds.has(node.id);
                const isRinged = ringId === node.id;
                return (
                  <g
                    key={node.id}
                    data-node-id={node.id}
                    transform={`translate(${round2(node.initialX)} ${round2(node.initialY)})`}
                    role={node.isGhost ? undefined : node.isSelf ? "img" : "button"}
                    tabIndex={interactive ? 0 : undefined}
                    aria-label={interactive ? node.ariaLabel : undefined}
                    aria-hidden={node.isGhost ? true : undefined}
                    opacity={node.opacity}
                    style={{ cursor: interactive ? "grab" : "default" }}
                    onPointerDown={
                      interactive ? (event) => handlePointerDown(event, node.id) : undefined
                    }
                    onPointerEnter={
                      interactive ? () => setHoverId(node.id) : undefined
                    }
                    onPointerLeave={
                      interactive
                        ? () => setHoverId((current) => (current === node.id ? null : current))
                        : undefined
                    }
                    onFocus={interactive ? () => setFocusId(node.id) : undefined}
                    onBlur={
                      interactive
                        ? () => setFocusId((current) => (current === node.id ? null : current))
                        : undefined
                    }
                    onKeyDown={
                      interactive && !node.isSelf
                        ? (event: ReactKeyboardEvent<SVGGElement>) => {
                            if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") {
                              return;
                            }
                            event.preventDefault();
                            onSelectNode(node.id);
                          }
                        : undefined
                    }
                  >
                    {/* Halo: the self node wears its own colour. */}
                    {node.isSelf ? (
                      <g className={reducedMotion ? undefined : "animate-pulse"}>
                        <circle r={node.radius * 1.9} fill={node.colorHex} opacity={0.12} />
                        <circle
                          r={node.radius * 1.4}
                          fill="none"
                          stroke={node.colorHex}
                          strokeWidth={1.5}
                          strokeDasharray="3 5"
                          opacity={0.6}
                        />
                      </g>
                    ) : null}

                    {/* Selected / focused ring. */}
                    {interactive && isRinged ? (
                      <circle
                        r={node.radius + 5}
                        fill="none"
                        className="stroke-clay"
                        strokeWidth={2.5}
                        strokeDasharray={node.isSelf ? undefined : "5 4"}
                      />
                    ) : null}

                    <PixelAnimal
                      animalId={node.animalId}
                      colorId={node.colorId}
                      size={node.displaySize}
                      x={-node.displaySize / 2}
                      y={-node.displaySize / 2}
                      happy={isHappy}
                      animated={!reducedMotion && interactive}
                      opacity={1}
                    />

                    {/* Invisible, generously sized hit target (≈48 px). */}
                    <circle
                      r={node.radius + HIT_RADIUS_PADDING}
                      fill="transparent"
                      style={{ pointerEvents: interactive ? "all" : "none" }}
                    />

                    {/* Name tag: only for you and for whatever you are looking at. */}
                    {interactive && (node.isSelf || node.id === activeId) && node.alias ? (
                      <text
                        y={node.radius + 16}
                        textAnchor="middle"
                        className="pointer-events-none fill-ink font-mono"
                        fontSize={10}
                        opacity={0.72}
                      >
                        {node.alias}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </g>
          </svg>
        ) : null}

        {/* ── Boot placeholder ── */}
        {booting || !structure ? (
          <div className="absolute inset-0 grid place-items-center px-6 text-center">
            <p
              className="font-mono text-[0.68rem] tracking-[0.18em] text-ink/45 uppercase"
              role="status"
              aria-live="polite"
            >
              {CONSTELLATION_COPY.loading}
            </p>
          </div>
        ) : null}

        {/* ── Empty sky ── */}
        {isEmpty ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center px-6">
            <p className="max-w-sm text-center text-sm leading-relaxed text-ink/70 italic">
              {emptyMessage ??
                (track === "romance"
                  ? CONSTELLATION_COPY.emptyRomance
                  : CONSTELLATION_COPY.emptyAmistad)}
            </p>
          </div>
        ) : null}
      </div>

      {/* ── Textual alternative for screen readers ── */}
      <section className="sr-only" aria-labelledby="constellation-sr-heading">
        <h2 id="constellation-sr-heading">{CONSTELLATION_COPY.srListHeading}</h2>
        <p>{CONSTELLATION_COPY.srListIntro}</p>
        <ul>
          <li>{selfAriaLabel(me.animalName, me.colorName, me.alias)}</li>
          {activeMatches.length === 0 ? (
            <li>{CONSTELLATION_COPY.srNoConnections}</li>
          ) : (
            activeMatches.map((match) => (
              <li key={match.id}>
                {`${match.alias} — ${matchAriaLabel(
                  match.animalName,
                  match.colorName,
                  match.similarity,
                  match.track,
                )}. ${CONSTELLATION_COPY.srOpenDetail}.`}
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}

export default ConstellationCanvas;
