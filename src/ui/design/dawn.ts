/**
 * Entry-scene geometry: a handful of seeded stars that light up one by one
 * ("el cielo amanece"), ending with YOUR star, which is always the last and
 * the brightest. Pure and deterministic so it can be tested in Node and
 * rendered identically on server and client.
 */

import { mulberry32 } from "@/domain/shared/random";

export interface DawnStar {
  x: number;
  y: number;
  size: 1 | 2 | 3;
  /** Order in which the star lights up, 0-based. */
  order: number;
  mine: boolean;
}

export interface DawnSpec {
  width: number;
  height: number;
  count: number;
  seed: number;
}

/** Integer cells on a `width × height` grid, the last one is "tu estrella". */
export function dawnStars({ width, height, count, seed }: DawnSpec): DawnStar[] {
  const random = mulberry32(seed);
  const stars: DawnStar[] = [];
  for (let order = 0; order < count - 1; order += 1) {
    const sizeRoll = random();
    stars.push({
      x: Math.floor(random() * (width - 3)),
      y: Math.floor(random() * (height - 3)),
      size: sizeRoll > 0.85 ? 2 : 1,
      order,
      mine: false,
    });
  }
  // Your star sits in the upper-right third so it never fights the text.
  stars.push({
    x: Math.floor(width * 0.72),
    y: Math.floor(height * 0.28),
    size: 3,
    order: count - 1,
    mine: true,
  });
  return stars;
}

/** Pixel "+" sparkle around your star: arm cells relative to its centre. */
export function sparkleCells(arm: number): Array<[number, number]> {
  const cells: Array<[number, number]> = [];
  for (let i = 1; i <= arm; i += 1) {
    cells.push([i, 0], [-i, 0], [0, i], [0, -i]);
  }
  return cells;
}
