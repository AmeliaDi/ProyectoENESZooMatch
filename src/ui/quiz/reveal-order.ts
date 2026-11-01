/**
 * Order in which the cells of the 16×16 sprite uncover during the reveal:
 * a seeded shuffle biased from the centre outwards, so the animal "se arma"
 * from its heart. Pure and deterministic.
 */

import { mulberry32 } from "@/domain/shared/random";

export function revealOrder(grid: number, seed: number): number[] {
  const random = mulberry32(seed);
  const centre = (grid - 1) / 2;
  return Array.from({ length: grid * grid }, (_, index) => {
    const x = index % grid;
    const y = Math.floor(index / grid);
    const distance = Math.hypot(x - centre, y - centre) / (centre * Math.SQRT2);
    return { index, key: distance * 0.75 + random() * 0.25 };
  })
    .sort((a, b) => a.key - b.key || a.index - b.index)
    .map((cell) => cell.index);
}
