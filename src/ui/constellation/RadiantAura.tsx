/**
 * Golden aura for a match whose shown affinity is at least
 * `RADIANT_AFFINITY_PERCENT`. Pixel language only: a dithered gold disc, a
 * dashed corona and four plus-shaped sparkles that blink out of phase. No blur,
 * no gradients; motion is CSS and is suppressed by the reduced-motion rule.
 * Rendered inside the node's translated `<g>`, so coordinates are relative to
 * the node centre.
 */

import { RADIANT_PATTERN_ID } from "./glow";

/** Aura disc radius, as a multiple of the physics radius (normal glow is 2.2). */
const AURA_RADIUS_FACTOR = 2.6;
/** Dashed corona radius, as a multiple of the physics radius. */
const CORONA_RADIUS_FACTOR = 1.55;
const CORONA_STROKE = 1.5;
const CORONA_DASH = "2 4";
/** Sparkles sit on the diagonals, this fraction of the sprite size from the centre. */
const SPARK_OFFSET_RATIO = 0.62;
/** Edge length of one sparkle pixel, in user units. */
const SPARK_PIXEL = 1.5;
/** Phase step between sparkles so they never blink together. */
const SPARK_DELAY_STEP_S = 0.35;
const DIAGONALS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];
/** A plus sign drawn on a 3×3 pixel grid (centre + 4 arms). */
const PLUS_CELLS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [-1, 0],
  [0, 0],
  [1, 0],
  [0, 1],
];

function Sparkle({ x, y, delay }: { x: number; y: number; delay: number }) {
  return (
    <g transform={`translate(${x} ${y})`} className="zm-canvas__radiant-spark" style={{ animationDelay: `-${delay}s` }}>
      {PLUS_CELLS.map(([dx, dy]) => (
        <rect
          key={`${dx}:${dy}`}
          x={(dx - 0.5) * SPARK_PIXEL}
          y={(dy - 0.5) * SPARK_PIXEL}
          width={SPARK_PIXEL}
          height={SPARK_PIXEL}
          shapeRendering="crispEdges"
        />
      ))}
    </g>
  );
}

export function RadiantAura({ radius, size, flat }: { radius: number; size: number; flat: boolean }) {
  const offset = (size / 2) * SPARK_OFFSET_RATIO * Math.SQRT2;
  return (
    <g aria-hidden="true" className="zm-canvas__radiant">
      <circle
        r={radius * AURA_RADIUS_FACTOR}
        fill={flat ? "currentColor" : `url(#${RADIANT_PATTERN_ID})`}
        className={flat ? "zm-canvas__radiant-glow zm-canvas__radiant-glow--flat" : "zm-canvas__radiant-glow"}
      />
      <circle
        r={radius * CORONA_RADIUS_FACTOR}
        className="zm-canvas__radiant-corona"
        strokeWidth={CORONA_STROKE}
        strokeDasharray={CORONA_DASH}
        shapeRendering="crispEdges"
      />
      {DIAGONALS.map(([sx, sy], i) => (
        <Sparkle key={i} x={(sx * offset) / Math.SQRT2} y={(sy * offset) / Math.SQRT2} delay={i * SPARK_DELAY_STEP_S} />
      ))}
    </g>
  );
}
