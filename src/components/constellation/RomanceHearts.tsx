/**
 * Pixel hearts shared by the constellation and the detail sheet.
 *
 * Hearts are always 3×3 pixel grids rendered as `<rect>`s with
 * `shape-rendering="crispEdges"` — never emoji, never a raster image. The CSS
 * animations live in `globals.css` (`heart-orbit`, `heart-pulse`) and are
 * suppressed by the global reduced-motion rule.
 */

import { HEART_COLOR } from "@/lib/pixel-sprites";

import { PixelAnimal } from "./PixelAnimal";

const HEART_CELLS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [1, 1],
  [2, 1],
  [1, 2],
];

interface PixelHeartProps {
  x?: number;
  y?: number;
  size?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}

/** A single 3×3 pixel heart in user units (size = full edge length). */
export function PixelHeart({
  x = 0,
  y = 0,
  size = 3,
  color = HEART_COLOR,
  className,
  style,
}: PixelHeartProps) {
  const cell = size / 3;
  return (
    <g transform={`translate(${x} ${y})`} className={className} style={style} aria-hidden="true">
      {HEART_CELLS.map(([r, c]) => (
        <rect
          key={`${r}-${c}`}
          x={c * cell}
          y={r * cell}
          width={cell}
          height={cell}
          fill={color}
          shapeRendering="crispEdges"
        />
      ))}
    </g>
  );
}

/**
 * Two hearts orbiting above a constellation node. Rendered inside the node's
 * translated `<g>`, so `y` is expressed relative to the node centre.
 */
export function OrbitingHearts({
  size,
  animated = true,
}: {
  size: number;
  animated?: boolean;
}) {
  return (
    <g aria-hidden="true" transform={`translate(${-size / 2} ${-size / 2 - size * 0.42})`}>
      <PixelHeart
        size={2.6}
        color="#FF6B6B"
        className={animated ? "romance-heart-orbit" : undefined}
      />
      <PixelHeart
        x={size * 0.62}
        y={-1.8}
        size={1.9}
        color="#FF8A8A"
        className={animated ? "romance-heart-orbit" : undefined}
        style={animated ? { animationDelay: "-1.2s" } : undefined}
      />
    </g>
  );
}

/** A standalone shared heart, used between the two sprites of a romance duo. */
export function SharedHeart({ size = 18, animated = true }: { size?: number; animated?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 3 3"
      role="img"
      aria-label="Corazón compartido"
      style={{ display: "block", overflow: "visible" }}
    >
      <g
        className={animated ? "romance-heart-pulse" : undefined}
        style={{ transformOrigin: "center" }}
      >
        {HEART_CELLS.map(([r, c]) => (
          <rect
            key={`${r}-${c}`}
            x={c}
            y={r}
            width={1}
            height={1}
            fill={HEART_COLOR}
            shapeRendering="crispEdges"
          />
        ))}
      </g>
    </svg>
  );
}

interface RomanceDuoProps {
  selfAnimalId: string;
  selfColorId: string;
  matchAnimalId: string;
  matchColorId: string;
  size?: number;
  animated?: boolean;
}

/**
 * `romance_duo` — the fifth animation state. It is not a per-animal grid: it is
 * a composition of both partners facing each other with a shared pulsing heart.
 * Used by the detail sheet when `track === "romance"` and chemistry >= 70 %.
 */
export function RomanceDuo({
  selfAnimalId,
  selfColorId,
  matchAnimalId,
  matchColorId,
  size = 54,
  animated = true,
}: RomanceDuoProps) {
  return (
    <div
      className="flex items-center justify-center gap-0.5"
      role="img"
      aria-label="Dos animalitos mirándose con un corazón compartido"
    >
      <PixelAnimal
        animalId={selfAnimalId}
        colorId={selfColorId}
        size={size}
        happy
        animated={animated}
      />
      <SharedHeart size={Math.max(14, Math.round(size * 0.28))} animated={animated} />
      <div style={{ transform: "scaleX(-1)" }} aria-hidden="true">
        <PixelAnimal
          animalId={matchAnimalId}
          colorId={matchColorId}
          size={size}
          happy
          animated={animated}
        />
      </div>
    </div>
  );
}

export default RomanceDuo;
