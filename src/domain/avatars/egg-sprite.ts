/**
 * ZooMatch — The egg sprite (Fase 3).
 *
 * A pixel-art egg drawn from a cosmetic seed derived from
 * `HMAC(serverSecret, userId)` — never from the latent profile — so the egg
 * cannot hint at, or change with, the animal that will hatch.
 *
 * Crack stages are additive: stage `k` paints cracks `1..k`, so a higher stage
 * is always a superset of a lower one. The golden glow brightens with the
 * stage; motion (breathing, wobble) lives in CSS and is dropped under
 * `prefers-reduced-motion`, where only opacity fades remain.
 */

import { GRID_SIZE } from "./pixel-sprites";

export const EGG_ANIMAL_ID = "huevito";
export const EGG_COLOR_ID = "cascaron";
export const EGG_TOP_ROW = 3;
export const EGG_BOTTOM_ROW = 14;

/** Cosmetic shell palettes: shell, shade (bottom-right), light (top-left), speckle. */
export const EGG_SHELLS: ReadonlyArray<readonly [string, string, string, string]> = [
  ["#F4E3D1", "#D8BCA3", "#FFF7EE", "#C79B7C"],
  ["#F3DCE4", "#D6B0C1", "#FFF1F6", "#C48CA4"],
  ["#E6DEF4", "#C0B3DB", "#F6F2FF", "#9B87C4"],
  ["#DDEBE0", "#B0CBBA", "#F1FAF4", "#87A894"],
  ["#DCE7F4", "#AEC3DB", "#F0F6FF", "#8AA6C4"],
  ["#FBE7CF", "#E0C09A", "#FFF6E8", "#C99A66"],
];

const INK = "#3A2E39";
const GLOW_BY_STAGE = ["#FFF3D0", "#FFE9B5", "#FFDF96", "#FFD478", "#FFC85C"];

export interface EggSpriteData {
  readonly grid: string[][];
  readonly palette: readonly string[];
  readonly glow: string;
  readonly crackStage: number;
  readonly animalId: typeof EGG_ANIMAL_ID;
  readonly colorId: typeof EGG_COLOR_ID;
}

/** Egg half-width per row: narrow at the top, round at the bottom. */
export function eggHalfWidth(row: number): number {
  const rows = EGG_BOTTOM_ROW - EGG_TOP_ROW;
  const t = (row - EGG_TOP_ROW) / rows;
  const profile = 0.44 + 0.56 * Math.sin(Math.PI * (0.2 + 0.74 * t));
  return Math.max(1, Math.round(5.5 * profile));
}

/** Zig-zag crack polylines, one entry per stage, as `[row, col]` pairs. */
const CRACKS: readonly (readonly (readonly [number, number])[])[] = [
  [[9, 6], [10, 7], [11, 6]],
  [
    [9, 6], [10, 7], [11, 6],
    [7, 9], [8, 10],
  ],
  [
    [9, 6], [10, 7], [11, 6],
    [7, 9], [8, 10], [9, 9], [10, 8],
    [12, 5], [13, 6],
  ],
  [
    [9, 6], [10, 7], [11, 6],
    [7, 9], [8, 10], [9, 9], [10, 8],
    [12, 5], [13, 6],
    [5, 7], [6, 6], [7, 7],
    [11, 10], [12, 9],
  ],
];

/** Deterministic PRNG (mulberry32) so the egg needs no platform entropy. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * `seed` is cosmetic-only and `crackStage` counts answered core progress.
 * Same inputs always paint the same grid.
 */
export function getEggSprite(seed: number, crackStage: number, stages: number): EggSpriteData {
  const stage = Math.max(0, Math.min(stages, Math.trunc(Number.isFinite(crackStage) ? crackStage : 0)));
  const shell = EGG_SHELLS[Math.abs(Math.trunc(seed)) % EGG_SHELLS.length]!;
  const [base, shade, light, speckle] = shell;
  const glow = GLOW_BY_STAGE[Math.min(stage, GLOW_BY_STAGE.length - 1)]!;

  const grid: string[][] = Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => ""),
  );

  const random = prng((Math.trunc(seed) ^ 0x5bf03635) >>> 0);
  const speckles = new Set<string>();
  const speckleCount = 3 + (Math.abs(Math.trunc(seed)) % 3);
  for (let i = 0; i < speckleCount; i += 1) {
    const row = EGG_TOP_ROW + 1 + Math.floor(random() * (EGG_BOTTOM_ROW - EGG_TOP_ROW - 1));
    const col = 4 + Math.floor(random() * 8);
    speckles.add(`${row},${col}`);
  }

  const middle = Math.round((GRID_SIZE - 1) / 2);
  for (let row = EGG_TOP_ROW; row <= EGG_BOTTOM_ROW; row += 1) {
    const half = eggHalfWidth(row);
    const start = middle - half;
    const end = start + half * 2;
    for (let col = start; col <= end; col += 1) {
      const edge = col === start || col === end || row === EGG_BOTTOM_ROW;
      const highlighted = !edge && row <= EGG_TOP_ROW + 2 && col <= start + 1;
      const shaded = !edge && row >= EGG_BOTTOM_ROW - 2 && col >= end - 1;
      grid[row]![col] = edge ? INK : highlighted ? light : shaded ? shade : speckles.has(`${row},${col}`) ? speckle : base;
    }
  }

  for (let level = 1; level <= stage; level += 1) {
    for (const [row, col] of CRACKS[level - 1] ?? []) {
      if (grid[row]?.[col]) grid[row]![col] = glow;
    }
  }

  return {
    grid,
    palette: [base, shade, light, speckle, glow, INK],
    glow,
    crackStage: stage,
    animalId: EGG_ANIMAL_ID,
    colorId: EGG_COLOR_ID,
  };
}

/**
 * Crack stage from core progress: `stages` evenly spaced thresholds, and stage
 * 0 while nothing of the core is answered.
 */
export function eggCrackStage(answered: number, total: number, stages: number): number {
  if (total <= 0 || answered <= 0) return 0;
  const ratio = Math.min(1, answered / total);
  return Math.max(0, Math.min(stages, Math.floor(ratio * (stages + 1) - (ratio >= 1 ? 1 : 0))));
}
