/**
 * Pixel finger dragging a star toward its match, drawn on the logical-pixel
 * grid (one SVG unit = one cell) and moved by a CSS `steps()` animation, so
 * every frame lands on a whole cell. With reduced motion it simply stays put.
 */

import type { CSSProperties } from "react";

import { EXPERIENCE } from "@/config";

/** `#` outline, `o` fill, `.` empty. Tip of the index finger on row 0. */
const HAND = [
  "...##.....",
  "..#oo#....",
  "..#oo#....",
  "..#oo####.",
  "..#oooooo#",
  "###oooooo#",
  "#oooooooo#",
  "#oooooooo#",
  ".#ooooooo#",
  "..#oooooo#",
  "...######.",
] as const;

const STAR = [".#.", "###", ".#."] as const;
/** Cells moved per animation frame. */
const CELLS_PER_STEP = 3;
/** Each grid cell is SCALE logical pixels (×2 keeps it small inside the card). */
const SCALE = 2;

/** One `h`-run per horizontal stretch of `char`, offset by (dx, dy) cells. */
function runs(rows: readonly string[], char: "#" | "o", dx: number, dy: number): string {
  const pattern = char === "#" ? /#+/g : /o+/g;
  let d = "";
  rows.forEach((row, y) => {
    for (const match of row.matchAll(pattern)) {
      d += `M${dx + match.index} ${dy + y}h${match[0].length}v1h-${match[0].length}z`;
    }
  });
  return d;
}

export function CoachFinger({ still = false }: { still?: boolean }) {
  const steps = EXPERIENCE.coachmarks.dragSteps;
  const travel = steps * CELLS_PER_STEP;
  const width = 12 + travel + 4;
  const height = 16;
  const style = {
    "--coach-drag-dx": `${travel}px`,
    "--coach-drag-steps": steps,
    "--coach-drag-ms": `${EXPERIENCE.coachmarks.dragLoopMs}ms`,
    width: `calc(var(--zm-px) * ${width * SCALE})`,
    height: `calc(var(--zm-px) * ${height * SCALE})`,
  } as CSSProperties;
  return (
    <svg className="zm-coach-finger" viewBox={`0 0 ${width} ${height}`} shapeRendering="crispEdges" aria-hidden="true" focusable="false" style={style}>
      <path className="zm-coach-finger__track" d={`M5 3h${travel + 4}v1h-${travel + 4}z`} />
      <path className="zm-coach-finger__match" d={runs(STAR, "#", travel + 9, 2)} />
      <g className={still ? "zm-coach-finger__grab" : "zm-coach-finger__grab zm-coach-finger__grab--moving"}>
        <path className="zm-coach-finger__star" d={runs(STAR, "#", 3, 2)} />
        <path className="zm-coach-finger__fill" d={runs(HAND, "o", 1, 5)} />
        <path className="zm-coach-finger__line" d={runs(HAND, "#", 1, 5)} />
      </g>
    </svg>
  );
}
