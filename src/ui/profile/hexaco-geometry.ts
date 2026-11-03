/**
 * Pure geometry of the HEXACO constellation: six stars on a hexagon, each
 * drawn at the factor's estimated population position, with the uncertainty
 * band as a faint segment along the same spoke. All coordinates are snapped
 * to whole grid cells so the SVG stays pixel-crisp.
 */
import type { ScaleReadingDto } from "@/contracts/profile";

export const HEX_GRID = 64;
const CENTER = HEX_GRID / 2;
/** Outer radius in cells; the inner floor keeps a low score off the centre. */
const RADIUS = 26;
const FLOOR = 4;
const START_ANGLE = -Math.PI / 2;
const SIDES = 6;

export interface HexPoint {
  x: number;
  y: number;
}

export interface HexStar {
  key: string;
  label: string;
  vertex: HexPoint;
  star: HexPoint;
  bandFrom: HexPoint;
  bandTo: HexPoint;
  open: boolean;
}

const snap = (v: number) => Math.round(v);
const safeUnit = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5);

function along(index: number, fraction: number): HexPoint {
  const angle = START_ANGLE + (index * 2 * Math.PI) / SIDES;
  const r = FLOOR + (RADIUS - FLOOR) * safeUnit(fraction);
  return { x: snap(CENTER + r * Math.cos(angle)), y: snap(CENTER + r * Math.sin(angle)) };
}

export function hexStars(scales: readonly ScaleReadingDto[]): HexStar[] {
  return scales.slice(0, SIDES).map((s, i) => ({
    key: s.key,
    label: s.label,
    vertex: along(i, 1),
    star: along(i, s.position),
    bandFrom: along(i, s.range[0]),
    bandTo: along(i, s.range[1]),
    open: s.confidence === "abierta",
  }));
}

export const HEX_CENTER: HexPoint = { x: CENTER, y: CENTER };

/** Closed polyline through the stars (the constellation shape). */
export function polygonPoints(points: readonly HexPoint[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}
