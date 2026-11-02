"use client";

/**
 * Browser-only upgrade of sprite sheets from SVG to PNG.
 *
 * Browsers re-rasterise an SVG `<image>` every time the sky repaints; with
 * 100 stars that alone halved the frame rate in measurements. Rasterising each
 * sheet once into a PNG at its native 64×16 grid (no smoothing, so pixels are
 * bit-identical) removes that cost. The SVG URL stays as the immediate
 * fallback, so the first paint never waits.
 */

import { GRID_SIZE } from "@/domain/avatars/pixel-sprites";

import { SHEET_WIDTH, spriteSheetUrl } from "./sprite-sheet";
import type { SpriteMark } from "./types";

const pngCache = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

function key(animalId: string, colorId: string, mark: SpriteMark | null): string {
  return `${animalId}\u0000${colorId}\u0000${mark ?? ""}`;
}

/** PNG URL if already rasterised, otherwise the SVG sheet. */
export function cachedSheetUrl(animalId: string, colorId: string, mark: SpriteMark | null = null): string {
  return pngCache.get(key(animalId, colorId, mark)) ?? spriteSheetUrl(animalId, colorId, mark);
}

/** Rasterises a sheet once; resolves to the PNG URL (or the SVG on failure). */
export function rasterSheetUrl(animalId: string, colorId: string, mark: SpriteMark | null = null): Promise<string> {
  const k = key(animalId, colorId, mark);
  const done = pngCache.get(k);
  if (done) return Promise.resolve(done);
  const inflight = pending.get(k);
  if (inflight) return inflight;
  const svg = spriteSheetUrl(animalId, colorId, mark);
  const job = (async (): Promise<string> => {
    try {
      const image = new Image();
      image.src = svg;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = SHEET_WIDTH;
      canvas.height = GRID_SIZE;
      const context = canvas.getContext("2d");
      if (!context) return svg;
      context.imageSmoothingEnabled = false;
      context.drawImage(image, 0, 0, SHEET_WIDTH, GRID_SIZE);
      const png = canvas.toDataURL("image/png");
      pngCache.set(k, png);
      return png;
    } catch {
      return svg;
    } finally {
      pending.delete(k);
    }
  })();
  pending.set(k, job);
  return job;
}
