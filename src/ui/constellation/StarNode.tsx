"use client";

/**
 * One star of the constellation. Memoised so that a change in the "happy" or
 * highlight state of one star re-renders only that star; positions are never
 * props (the animation loop writes the `transform` directly).
 */

import { memo, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";

import { GLOW_PATTERN_ID } from "./glow";
import { PixelAnimal } from "./PixelAnimal";
import { affinityLabelY, HIT_RADIUS_PADDING, round2 } from "./render-helpers";
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
  showTag: boolean;
  reducedMotion: boolean;
  /** Dense skies paint a flat glow instead of the dither pattern. */
  flatGlow: boolean;
  handlers: StarHandlers;
}

function onActivateKey(event: ReactKeyboardEvent<SVGGElement>, select: () => void): void {
  if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") return;
  event.preventDefault();
  select();
}

function StarNodeImpl({ node, happy, romance, dimmed, ringed, showTag, reducedMotion, flatGlow, handlers }: StarNodeProps) {
  const interactive = !node.isGhost && !node.isLeaving;
  const clickable = interactive && !node.isSelf;
  return (
    <g
      data-node-id={node.id}
      transform={`translate(${round2(node.initialX)} ${round2(node.initialY)})`}
      role={!interactive ? undefined : node.isSelf ? "img" : "button"}
      tabIndex={clickable ? 0 : undefined}
      aria-label={interactive ? node.ariaLabel : undefined}
      aria-hidden={interactive ? undefined : true}
      style={{ cursor: clickable ? "grab" : "default" }}
      onPointerDown={interactive ? (event) => handlers.pointerDown(event, node.id) : undefined}
      onPointerEnter={interactive ? () => handlers.hover(node.id) : undefined}
      onPointerLeave={interactive ? () => handlers.hover(null, node.id) : undefined}
      onFocus={interactive ? () => handlers.focus(node.id) : undefined}
      onBlur={interactive ? () => handlers.focus(null, node.id) : undefined}
      onKeyDown={clickable ? (event) => onActivateKey(event, () => handlers.select(node.id)) : undefined}
    >
      <g data-body-id={node.id} opacity={1}>
        <g opacity={dimmed ? 0.55 : node.opacity}>
          {!node.isGhost ? (
            <circle
              r={node.radius * 2.2}
              fill={flatGlow ? node.colorHex : `url(#${GLOW_PATTERN_ID})`}
              color={node.colorHex}
              className={flatGlow ? "zm-canvas__glow zm-canvas__glow--flat" : "zm-canvas__glow"}
            />
          ) : null}
          {interactive && node.radiant ? (
            <RadiantAura radius={node.radius} size={node.displaySize} flat={flatGlow} />
          ) : null}
          {node.isSelf ? (
            <g className={reducedMotion ? undefined : "zm-canvas__halo"}>
              <circle r={node.radius * 1.9} fill={node.colorHex} opacity={0.12} />
              <circle r={node.radius * 1.4} fill="none" stroke={node.colorHex} strokeWidth={1.5} strokeDasharray="3 5" opacity={0.6} />
            </g>
          ) : null}
          {interactive && ringed ? (
            <circle
              r={node.radius + 5}
              fill="none"
              className="zm-canvas__ring"
              strokeWidth={2.5}
              strokeDasharray={node.isSelf ? undefined : "5 4"}
            />
          ) : null}
          <PixelAnimal
            animalId={node.animalId}
            colorId={node.colorId}
            mark={node.mark}
            size={node.displaySize}
            x={-node.displaySize / 2}
            y={-node.displaySize / 2}
            happy={happy}
            romance={romance}
            animated={!reducedMotion && interactive}
            opacity={1}
          />
          {romance ? <OrbitingHearts size={node.displaySize} animated={!reducedMotion} /> : null}
          {interactive && node.affinityLabel ? (
            <text
              y={round2(affinityLabelY(node.displaySize, romance))}
              textAnchor="middle"
              className={node.radiant ? "zm-canvas__affinity zm-canvas__affinity--radiant" : "zm-canvas__affinity"}
              fontSize={9}
              aria-hidden="true"
            >
              {node.affinityLabel}
            </text>
          ) : null}
        </g>
        <circle r={node.radius + HIT_RADIUS_PADDING} fill="transparent" style={{ pointerEvents: interactive ? "all" : "none" }} />
        {showTag && node.alias ? (
          <text y={node.radius + 16} textAnchor="middle" className="zm-canvas__tag" fontSize={10} opacity={0.82}>
            {node.alias}
          </text>
        ) : null}
      </g>
    </g>
  );
}

export const StarNode = memo(StarNodeImpl);
