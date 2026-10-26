/**
 * Constellation render layer — sprite sheet builder.
 *
 * The approved sprite engine (`@/lib/pixel-sprites`) returns a 12×12 grid of
 * hex strings. Rendering that as 144 `<rect>` elements per node would mean
 * ~7 200 SVG nodes for a 50-star constellation, which no mid-range phone can
 * composite at 60 fps alongside a physics loop.
 *
 * Instead each (animal, colour) pair is rasterised ONCE into a tiny inline SVG
 * *sprite sheet* — four 12×12 frames side by side (`idle_1`, `idle_2`, `happy`,
 * `romance_pulse`) — and exposed as a memoised `data:` URL. A node then renders
 * as a single `<image>` inside a nested 12×12 viewBox, and the frame is chosen by
 * shifting the image's `x` attribute imperatively. Three DOM elements per node
 * instead of 144, zero React re-renders per animation tick.
 *
 * Rows are run-length encoded, so a typical frame becomes ~40 `<rect>`s of
 * markup instead of ~100 filled cells, and the whole sheet stays well under
 * 2 KB of URL text.
 *
 * This module is pure (no DOM access): the sheet is a string, so it is fully
 * unit-testable in Vitest's `node` environment and safe to build during SSR.
 */

import { GRID_SIZE, getSpriteFrame, type AnimationFrame } from "@/lib/pixel-sprites";

import type { SpriteFrameName } from "./types";

/** Sheet column order. Index === frame column. */
export const SHEET_FRAMES: readonly SpriteFrameName[] = [
  "idle_1",
  "idle_2",
  "happy",
  "romance_pulse",
] as const;

/** Total sheet width in user units (4 frames × 12). */
export const SHEET_WIDTH = GRID_SIZE * SHEET_FRAMES.length;

/** Upper bound on memoised sheets; the cache is dropped wholesale past this. */
export const MAX_CACHED_SHEETS = 400;

const sheetCache = new Map<string, string>();

function cacheKey(animalId: string, colorId: string): string {
  return `${animalId}\u0000${colorId}`;
}

/** Column index (0-3) of a frame name inside the sheet. */
export function frameIndex(frame: SpriteFrameName): number {
  const index = SHEET_FRAMES.indexOf(frame);
  return index < 0 ? 0 : index;
}

/** Maps a public frame name onto the sprite engine's `AnimationFrame`. */
export function toAnimationFrame(frame: SpriteFrameName): AnimationFrame {
  return frame as AnimationFrame;
}

/**
 * Serialises one 12×12 grid into run-length-encoded `<rect>`s, offset by
 * `offsetX` user units. Transparent cells (`""`) are skipped entirely.
 */
function gridToRects(grid: readonly (readonly string[])[], offsetX: number): string {
  let out = "";
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y];
    let x = 0;
    while (x < row.length) {
      const fill = row[x];
      if (fill === "") {
        x++;
        continue;
      }
      let run = 1;
      while (x + run < row.length && row[x + run] === fill) run++;
      out += `<rect x="${offsetX + x}" y="${y}" width="${run}" height="1" fill="${fill}"/>`;
      x += run;
    }
  }
  return out;
}

/**
 * Builds the raw SVG markup of the four-frame sheet. Exported for tests and
 * for the (optional) dev gallery; production code should use `spriteSheetUrl`.
 */
export function buildSpriteSheetSvg(animalId: string, colorId: string): string {
  let body = "";
  for (let column = 0; column < SHEET_FRAMES.length; column++) {
    const sprite = getSpriteFrame(
      animalId,
      colorId,
      toAnimationFrame(SHEET_FRAMES[column]),
    );
    body += gridToRects(sprite.grid, column * GRID_SIZE);
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SHEET_WIDTH}" height="${GRID_SIZE}"` +
    ` viewBox="0 0 ${SHEET_WIDTH} ${GRID_SIZE}" shape-rendering="crispEdges">${body}</svg>`
  );
}

/**
 * Memoised `data:` URL of the sprite sheet for one (animal, colour) pair.
 * Building it costs ~0.1 ms after the sprite registry is warm; the URL is then
 * decoded once by the browser and reused by every node sharing that pair.
 */
export function spriteSheetUrl(animalId: string, colorId: string): string {
  const key = cacheKey(animalId, colorId);
  const cached = sheetCache.get(key);
  if (cached !== undefined) return cached;
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    buildSpriteSheetSvg(animalId, colorId),
  )}`;
  if (sheetCache.size >= MAX_CACHED_SHEETS) sheetCache.clear();
  sheetCache.set(key, url);
  return url;
}

/** Drops every memoised sheet. Used by tests and by hot-module reload. */
export function clearSpriteSheetCache(): void {
  sheetCache.clear();
}

/**
 * Warms the sprite registry and pre-builds the sheets for a list of pairs.
 * Called once during the canvas boot phase (behind the "Acomodando las
 * estrellas…" placeholder) so the first `getSpriteFrame` — which builds the
 * whole lazy catalogue, ~180 ms — never lands inside a paint.
 */
export function warmSpriteSheets(pairs: readonly { animalId: string; colorId: string }[]): void {
  for (const pair of pairs) spriteSheetUrl(pair.animalId, pair.colorId);
}
