"use client";

/**
 * One star of the constellation. Memoised so that a change in the "happy" or
 * highlight state of one star re-renders only that star; positions are never
 * props (the animation loop writes the `transform` directly).
 */

import { memo, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";

import { FOCO_PATTERN_ID, GLOW_REACH, suavePatternId } from "./glow";
import { PixelAnimal } from "./PixelAnimal";
import { affinityLabelOpacity, affinityLabelY, DIMMED_OPACITY, HIT_RADIUS_PADDING, round2 } from "./render-helpers";
import { RadiantAura } from "./RadiantAura";
import { OrbitingHearts } from "./RomanceHearts";
import type { RenderNode } from "./types";

export interface StarHandlers {
  pointerDown: (event: ReactPointerEvent<SVGGElement>, id: string) => void;
  hover: (id: string | null, leaving?: string) => void;
  focus: (id: string | null, leaving?: string) => void;
  select: (id: string) => void;
}

export interface StarNodeProps {
  node: RenderNode;
  happy: boolean;
  romance: boolean;
  dimmed: boolean;
  ringed: boolean;
  /** The single priority element that breathes (never under reduced motion). */
  breathing: boolean;
  showTag: boolean;
  reducedMotion: boolean;
  /** Dense skies paint a flat glow instead of the dither pattern. */
  flatGlow: boolean;
  /** An invitation waits for you from this match: tiny speech mark, never a number. */
  chatPending?: boolean;
  handlers: StarHandlers;
}

/** 5×4 speech-bubble mark (pixel cells) drawn above the sprite's top-right corner. */
const CHAT_MARK_CELLS: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [1, 0], [2, 0], [3, 0], [4, 0],
  [0, 1], [4, 1],
  [0, 2], [1, 2], [2, 2], [3, 2], [4, 2],
  [1, 3],
];
const CHAT_MARK_CELL = 2;
export const CHAT_PENDING_LABEL = "Tiene una invitación de chat para ti";

function ChatMark({ size }: { size: number }) {
  const x = size / 2 - CHAT_MARK_CELL * 2;
  const y = -size / 2 - CHAT_MARK_CELL * 4;
  return (
    <g transform={`translate(${round2(x)} ${round2(y)})`} className="zm-canvas__chat-mark" aria-hidden="true">
      {CHAT_MARK_CELLS.map(([cx, cy]) => (
        <rect key={`${cx}-${cy}`} x={cx * CHAT_MARK_CELL} y={cy * CHAT_MARK_CELL} width={CHAT_MARK_CELL} height={CHAT_MARK_CELL} shapeRendering="crispEdges" />
      ))}
    </g>
  );
}

/** % label size in world units (Atkinson, tabular figures; see ADR-028). */
const AFFINITY_FONT_SIZE = 10;
const TAG_FONT_SIZE = 10;
/** Alias baseline below the star, in world units. */
const TAG_OFFSET = 16;
/** Selection ring: gap to the sprite edge and stroke, in world units. */
const RING_GAP = 5;
const RING_STROKE = 2;
const RING_DASH = "4 3";

function onActivateKey(event: ReactKeyboardEvent<SVGGElement>, select: () => void): void {
  if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") return;
  event.preventDefault();
  select();
}

function StarNodeImpl({ node, happy, romance, dimmed, ringed, breathing, showTag, reducedMotion, flatGlow, chatPending = false, handlers }: StarNodeProps) {
  const interactive = !node.isGhost && !node.isLeaving;
  const clickable = interactive && !node.isSelf;
  const bodyOpacity = dimmed ? DIMMED_OPACITY : node.opacity;
  const spriteHalf = node.displaySize / 2;
  const breathClass = breathing && !reducedMotion ? " zm-canvas__breath" : "";
  return (
    <g
      data-node-id={node.id}
      transform={`translate(${round2(node.initialX)} ${round2(node.initialY)})`}
      role={!interactive ? undefined : node.isSelf ? "img" : "button"}
      tabIndex={clickable ? 0 : undefined}
      aria-label={interactive ? (chatPending ? `${node.ariaLabel}. ${CHAT_PENDING_LABEL}` : node.ariaLabel) : undefined}
      aria-hidden={interactive ? undefined : true}
      className={clickable ? "zm-canvas__star" : undefined}
      style={{ cursor: clickable ? "grab" : "default" }}
      onPointerDown={interactive ? (event) => handlers.pointerDown(event, node.id) : undefined}
      onPointerEnter={interactive ? () => handlers.hover(node.id) : undefined}
      onPointerLeave={interactive ? () => handlers.hover(null, node.id) : undefined}
      onFocus={interactive ? () => handlers.focus(node.id) : undefined}
      onBlur={interactive ? () => handlers.focus(null, node.id) : undefined}
      onKeyDown={clickable ? (event) => onActivateKey(event, () => handlers.select(node.id)) : undefined}
    >
      <g data-body-id={node.id} opacity={1}>
        <g opacity={bodyOpacity}>
          {!node.isGhost && !node.isSelf && !node.radiant ? (
            <circle
              r={round2(spriteHalf + GLOW_REACH.suave)}
              fill={flatGlow ? "currentColor" : `url(#${suavePatternId(node.glowLevel)})`}
              className={`zm-canvas__glow zm-canvas__glow--suave${flatGlow ? " zm-canvas__glow--flat" : ""}`}
              data-level={node.glowLevel}
            />
          ) : null}
          {interactive && node.radiant ? (
            <RadiantAura size={node.displaySize} flat={flatGlow} breathing={breathing && !reducedMotion} />
          ) : null}
          {node.isSelf ? (
            <g className={`zm-canvas__self${breathClass}`}>
              <circle
                r={round2(spriteHalf + GLOW_REACH.foco)}
                fill={flatGlow ? "currentColor" : `url(#${FOCO_PATTERN_ID})`}
                className={`zm-canvas__glow zm-canvas__glow--foco${flatGlow ? " zm-canvas__glow--flat" : ""}`}
              />
            </g>
          ) : null}
          {interactive && ringed ? (
            <circle
              r={round2(spriteHalf + RING_GAP)}
              fill="none"
              className="zm-canvas__ring"
              strokeWidth={RING_STROKE}
              strokeDasharray={node.isSelf ? undefined : RING_DASH}
              shapeRendering="crispEdges"
            />
          ) : null}
          <PixelAnimal
            animalId={node.animalId}
            colorId={node.colorId}
            mark={node.mark}
            size={node.displaySize}
            x={-spriteHalf}
            y={-spriteHalf}
            happy={happy}
            romance={romance}
            animated={!reducedMotion && interactive}
            opacity={1}
          />
          {romance ? <OrbitingHearts size={node.displaySize} animated={!reducedMotion} /> : null}
          {interactive && chatPending ? <ChatMark size={node.displaySize} /> : null}
        </g>
        {interactive && node.affinityLabel ? (
          <text
            y={round2(affinityLabelY(node.displaySize, romance))}
            textAnchor="middle"
            className={node.radiant ? "zm-canvas__affinity zm-canvas__affinity--radiant" : "zm-canvas__affinity"}
            fontSize={AFFINITY_FONT_SIZE}
            opacity={affinityLabelOpacity(bodyOpacity, node.radiant)}
            aria-hidden="true"
          >
            {node.affinityLabel}
          </text>
        ) : null}
        <circle r={node.radius + HIT_RADIUS_PADDING} fill="transparent" style={{ pointerEvents: interactive ? "all" : "none" }} />
        {showTag && node.alias ? (
          <text y={node.radius + TAG_OFFSET} textAnchor="middle" className="zm-canvas__tag" fontSize={TAG_FONT_SIZE}>
            {node.alias}
          </text>
        ) : null}
      </g>
    </g>
  );
}

export const StarNode = memo(StarNodeImpl);
