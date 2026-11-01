/**
 * Ordered (Bayer) dithering. Every soft edge in ZooMatch (nebula, glows,
 * disabled states) is a Bayer pattern instead of a blur or a smooth gradient.
 * Pure helpers: the canvas sky and the CSS mask tiles both come from here.
 */

/** Classic 4×4 Bayer index matrix (values 0..15). */
export const BAYER_4: readonly (readonly number[])[] = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

const BAYER_SIZE = 4;
const BAYER_LEVELS = BAYER_SIZE * BAYER_SIZE;

/** Threshold in (0, 1) for a cell; a value lights the cell iff value > threshold. */
export function bayerThreshold(x: number, y: number): number {
  const row = BAYER_4[((y % BAYER_SIZE) + BAYER_SIZE) % BAYER_SIZE] ?? [];
  const index = row[((x % BAYER_SIZE) + BAYER_SIZE) % BAYER_SIZE] ?? 0;
  return (index + 0.5) / BAYER_LEVELS;
}

/** Whether a cell is lit for a coverage value in [0, 1]. */
export function bayerLit(x: number, y: number, coverage: number): boolean {
  return coverage > bayerThreshold(x, y);
}

/** Lit cells of the 4×4 tile for a coverage level (count = round(level·16)). */
export function bayerTileCells(coverage: number): readonly (readonly [number, number])[] {
  const cells: [number, number][] = [];
  for (let y = 0; y < BAYER_SIZE; y += 1) {
    for (let x = 0; x < BAYER_SIZE; x += 1) {
      if (bayerLit(x, y, coverage)) cells.push([x, y]);
    }
  }
  return cells;
}

/**
 * A 4×4 SVG tile (one user unit per cell) usable as a CSS `mask-image`, so the
 * dither colour stays a CSS variable and follows the theme.
 */
export function bayerMaskDataUri(coverage: number): string {
  const rects = bayerTileCells(coverage)
    .map(([x, y]) => `<rect x='${x}' y='${y}' width='1' height='1'/>`)
    .join("");
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='4' height='4' shape-rendering='crispEdges'>${rects}</svg>`;
  return `url("data:image/svg+xml,${svg.replaceAll("<", "%3C").replaceAll(">", "%3E")}")`;
}

/** Coverage levels shipped as CSS mask utilities (`.dither-25` …). */
export const DITHER_LEVELS = [25, 50, 75] as const;
