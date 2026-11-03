/**
 * Golden aura for a match whose shown affinity is at least
 * `RADIANT_AFFINITY_PERCENT` (ADR-025, `glow-hito` since ADR-027). Pixel
 * language only: a pre-rendered Bayer gold disc, a dashed stepped corona and
 * four static plus-shaped sparkles. No blur, no gradients and no blinking:
 * only the priority element of the sky breathes (slowly), and never under
 * `prefers-reduced-motion`. Rendered inside the node's translated `<g>`, so
 * coordinates are relative to the node centre.
 */

import { GLOW_REACH, HITO_PATTERN_ID } from "./glow";
import { round2 } from "./render-helpers";

/** Dashed corona sits this far outside the sprite edge, in world units. */
const CORONA_GAP = 2;
const CORONA_STROKE = 1.5;
const CORONA_DASH = "2 4";
/** Sparkles sit on the diagonals, this fraction of the sprite size from the centre. */
const SPARK_OFFSET_RATIO = 0.62;
/** Edge length of one sparkle pixel, in user units. */
const SPARK_PIXEL = 1.5;
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

function Sparkle({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${round2(x)} ${round2(y)})`} className="zm-canvas__radiant-spark">
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

export function RadiantAura({ size, flat, breathing }: { size: number; flat: boolean; breathing: boolean }) {
  const half = size / 2;
  const offset = half * SPARK_OFFSET_RATIO;
  return (
    <g aria-hidden="true" className={breathing ? "zm-canvas__radiant zm-canvas__breath" : "zm-canvas__radiant"}>
      <circle
        r={round2(half + GLOW_REACH.hito)}
        fill={flat ? "currentColor" : `url(#${HITO_PATTERN_ID})`}
        className={flat ? "zm-canvas__glow zm-canvas__glow--hito zm-canvas__glow--flat" : "zm-canvas__glow zm-canvas__glow--hito"}
      />
      <circle
        r={round2(half + CORONA_GAP)}
        className="zm-canvas__radiant-corona"
        strokeWidth={CORONA_STROKE}
        strokeDasharray={CORONA_DASH}
        shapeRendering="crispEdges"
      />
      {DIAGONALS.map(([sx, sy], i) => (
        <Sparkle key={i} x={sx * offset} y={sy * offset} />
      ))}
    </g>
  );
}
