/**
 * Small pixel geometry used by the kit: Likert gems and the constellation
 * progress strip. Pure and deterministic.
 */

import { mulberry32 } from "@/domain/shared/random";

/**
 * Pixel diamond of odd size `n` (cells) as merged-run SVG path data.
 * `hollow` keeps only the 1-cell outline.
 */
export function diamondPath(n: number, hollow: boolean): string {
  const size = n % 2 === 0 ? n + 1 : n;
  const mid = (size - 1) / 2;
  const parts: string[] = [];
  for (let y = 0; y < size; y += 1) {
    const half = mid - Math.abs(y - mid);
    const start = mid - half;
    const width = half * 2 + 1;
    if (!hollow || half === 0 || y === 0 || y === size - 1) {
      parts.push(`M${start} ${y}h${width}v1h${-width}z`);
    } else {
      parts.push(`M${start} ${y}h1v1h-1z`, `M${start + width - 1} ${y}h1v1h-1z`);
    }
  }
  return parts.join("");
}

/** Gem size (cells) per Likert option: the ends are larger, the centre the smallest. */
export function likertGemSizes(count: number, min = 7, max = 13): number[] {
  const mid = (count - 1) / 2;
  return Array.from({ length: count }, (_, i) => {
    const t = mid === 0 ? 0 : Math.abs(i - mid) / mid;
    const raw = Math.round(min + t * (max - min));
    return raw % 2 === 0 ? raw + 1 : raw;
  });
}

export interface ProgressStar {
  x: number;
  y: number;
  /** 1 or 2 cells. Every fifth star is a little brighter "milestone". */
  size: 1 | 2;
}

/**
 * Lays `count` stars along a gentle seeded zig-zag inside a `width × height`
 * cell band, so the progress bar reads as a constellation drawn left to right.
 */
export function progressStars(count: number, width: number, height: number, seed = 7): ProgressStar[] {
  if (count <= 0) return [];
  const random = mulberry32(seed);
  const margin = 2;
  const usable = Math.max(1, width - margin * 2);
  const mid = height / 2;
  const amplitude = Math.max(0, height / 2 - margin);
  return Array.from({ length: count }, (_, i) => {
    const x = count === 1 ? width / 2 : margin + (usable * i) / (count - 1);
    const wobble = (random() * 2 - 1) * amplitude;
    const size: 1 | 2 = (i + 1) % 5 === 0 ? 2 : 1;
    return { x: Math.round(x), y: Math.round(mid + wobble), size };
  });
}
