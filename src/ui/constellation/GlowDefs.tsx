/**
 * `<defs>` with every pre-rendered halo pattern (ADR-027): three affinity
 * steps of `glow-suave` plus the gold `glow-foco` (you) and `glow-hito`
 * (≥ 95 %). Shared by the canvas and the `/dev/ui` gallery.
 */

import { bayerTileCells } from "@/ui/design/bayer";

import { FOCO_PATTERN_ID, GOLD_COVERAGE, HITO_PATTERN_ID, SUAVE_COVERAGE, suavePatternId } from "./glow";
import type { GlowLevel } from "./render-helpers";

/** Edge of a Bayer tile, in world units (one dither cell = one unit). */
const DITHER_TILE = 4;
const LEVELS: readonly GlowLevel[] = [0, 1, 2];

function DitherPattern({ id, coverage, className }: { id: string; coverage: number; className: string }) {
  return (
    <pattern id={id} width={DITHER_TILE} height={DITHER_TILE} patternUnits="userSpaceOnUse">
      {bayerTileCells(coverage).map(([x, y]) => (
        <rect key={`${x}:${y}`} x={x} y={y} width={1} height={1} className={className} />
      ))}
    </pattern>
  );
}

export function GlowDefs() {
  return (
    <defs>
      {LEVELS.map((level) => (
        <DitherPattern key={level} id={suavePatternId(level)} coverage={SUAVE_COVERAGE[level]} className="zm-canvas__dot--suave" />
      ))}
      <DitherPattern id={FOCO_PATTERN_ID} coverage={GOLD_COVERAGE} className="zm-canvas__dot--foco" />
      <DitherPattern id={HITO_PATTERN_ID} coverage={GOLD_COVERAGE} className="zm-canvas__dot--hito" />
    </defs>
  );
}
