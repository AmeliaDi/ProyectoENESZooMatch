/**
 * Seeded pixel sky: three star layers (1, 2 and 3 logical px) plus a Bayer
 * nebula. Pure data so the same sky renders identically on server, client,
 * canvas and tests. Units are logical cells; the renderer multiplies by the
 * logical pixel size.
 */

import { mulberry32 } from "@/domain/shared/random";

import { bayerLit } from "./bayer";

export interface SkyLayerSpec {
  size: 1 | 2 | 3;
  density: number;
  twinkles: boolean;
  parallax: number;
}

export interface NebulaSpec {
  x: number;
  y: number;
  rx: number;
  ry: number;
  tone: "nebula-1" | "nebula-2";
  peak: number;
}

export interface SkySpec {
  seed: number;
  tileCells: number;
  layers: readonly SkyLayerSpec[];
  twinklePeriodMs: readonly [number, number];
  nebula: readonly NebulaSpec[];
}

export interface Star {
  x: number;
  y: number;
  size: 1 | 2 | 3;
  layer: number;
  /** 0 when the star does not twinkle. */
  periodMs: number;
  phase: number;
}

export interface NebulaCell {
  x: number;
  y: number;
  tone: NebulaSpec["tone"];
}

/** Stars of a square tile `tileCells` wide; tiles repeat seamlessly. */
export function generateStars(spec: SkySpec): readonly Star[] {
  const random = mulberry32(spec.seed);
  const [minPeriod, maxPeriod] = spec.twinklePeriodMs;
  const area = spec.tileCells * spec.tileCells;
  const stars: Star[] = [];
  spec.layers.forEach((layer, index) => {
    const count = Math.round(area * layer.density);
    for (let i = 0; i < count; i += 1) {
      // Keep the whole star inside the tile so repeats never cut it.
      const span = spec.tileCells - layer.size;
      stars.push({
        x: Math.floor(random() * span),
        y: Math.floor(random() * span),
        size: layer.size,
        layer: index,
        periodMs: layer.twinkles ? Math.round(minPeriod + random() * (maxPeriod - minPeriod)) : 0,
        phase: random(),
      });
    }
  });
  return stars;
}

/**
 * Nebula as dithered cells over a `width × height` cell grid. Coverage falls
 * off quadratically from each blob centre and is quantised by Bayer 4×4.
 */
export function generateNebula(spec: SkySpec, width: number, height: number): readonly NebulaCell[] {
  const cells: NebulaCell[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let best = 0;
      let tone: NebulaSpec["tone"] = "nebula-1";
      for (const blob of spec.nebula) {
        const dx = (x / width - blob.x) / blob.rx;
        const dy = (y / height - blob.y) / blob.ry;
        const coverage = blob.peak * Math.max(0, 1 - (dx * dx + dy * dy));
        if (coverage > best) {
          best = coverage;
          tone = blob.tone;
        }
      }
      if (best > 0 && bayerLit(x, y, best)) cells.push({ x, y, tone });
    }
  }
  return cells;
}

/** Discrete twinkle level index at time `t` (stepwise, never a smooth fade). */
export function twinkleLevel(star: Star, timeMs: number, levels: number): number {
  if (star.periodMs === 0 || levels <= 1) return 0;
  const cycle = (timeMs / star.periodMs + star.phase) % 1;
  // Triangle wave quantised to `levels` steps: bright → dim → bright.
  const tri = cycle < 0.5 ? cycle * 2 : (1 - cycle) * 2;
  return Math.min(levels - 1, Math.floor(tri * levels));
}
