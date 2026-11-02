/**
 * Enneagram chest emblems and subtype marks, stamped on the LEFT HALF grid
 * before mirroring (so they stay horizontally symmetric).
 *
 * Emblems: 2 half-columns × 3 rows at half-cols 6-7, rows 9-11 → a 4×3 glyph
 * on the chest axis. Marks: one half-cell each (2 px after mirroring).
 *
 * Both only repaint FILLED body cells and never eyes, blush, sparkles or
 * hearts, so the silhouette mask is unchanged — which keeps the engine's
 * mask-distinctness guarantee intact for every (animal, colour, mark).
 */
import type { EmblemKey, SubtypeMark } from "./avatar-spec";

/** Grid char for emblem/mark pixels; rendered with `emblem_tone`. */
export const EMBLEM_CHAR = "G";

const ROW0 = 9;
const COL0 = 6;
const PROTECTED = new Set([".", "E", "P", "I", "W", "R"]);

/**
 * Rows of [outer, inner] half-cells; `X` = emblem pixel. Mirrored → 4 wide.
 * The emblem double-codes the type that the colour family already shows, so
 * the type stays readable without relying on hue (colour-vision deficiency).
 */
export const EMBLEM_GLYPHS: Readonly<Record<EmblemKey, readonly string[]>> = {
  "1": [".X", ".X", ".X"], // brújula: aguja vertical
  "2": ["X.", "XX", ".X"], // corazoncito
  "3": [".X", "XX", ".X"], // estrella
  "4": ["X.", "X.", ".X"], // luna creciente (cuenco)
  "5": [".X", "X.", ".X"], // lente (anillo)
  "6": ["XX", "XX", ".X"], // escudo
  "7": ["X.", ".X", "X."], // chispa (aspa)
  "8": ["X.", "XX", ".."], // corona
  "9": [".X", "XX", "X."], // hojita
  neutro: ["..", ".X", ".."], // aura suave: un punto tranquilo
};

/** [row, half-column] per mark. */
export const MARK_CELLS: Readonly<Record<SubtypeMark, readonly (readonly [number, number])[]>> = {
  sx: [[4, 7]], // alto y central
  so: [[8, 2]], // a los lados
  sp: [[12, 4]], // a ras de suelo
};

function paint(half: string[][], r: number, c: number): void {
  const row = half[r];
  const current = row?.[c];
  if (!row || current === undefined || PROTECTED.has(current)) return;
  row[c] = EMBLEM_CHAR;
}

export function stampEmblem(half: string[][], emblem: EmblemKey | null, mark: SubtypeMark | null): void {
  if (emblem) {
    EMBLEM_GLYPHS[emblem].forEach((pattern, dr) => {
      [...pattern].forEach((cell, dc) => {
        if (cell === "X") paint(half, ROW0 + dr, COL0 + dc);
      });
    });
  }
  if (mark) for (const [r, c] of MARK_CELLS[mark]) paint(half, r, c);
}
