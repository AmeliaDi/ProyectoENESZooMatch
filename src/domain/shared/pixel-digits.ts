/**
 * 5×7 pixel atlas for highlighted figures (ADR-028). Pure data plus a pure
 * layout function, so the UI component, the `/dev/tipografia` page and the tests
 * all read the same glyphs.
 *
 * Design rules:
 * - every digit is exactly `DIGIT_WIDTH` columns wide (tabular by
 *   construction: "11 %" and "88 %" are the same width);
 * - the zero carries a slash so it never reads as a letter O;
 * - the one has a flag and a foot, the seven a straight stem;
 * - `%` is one digit wide with two 2×2 rings, so it does not smudge;
 * - the minus (U+2212) and the hyphen share one glyph.
 * `#` is a lit cell, `.` an empty one.
 */

export const GLYPH_HEIGHT = 7;
export const DIGIT_WIDTH = 5;
/** Empty columns between two glyphs. */
export const GLYPH_GAP = 1;

const DIGITS: Readonly<Record<string, readonly string[]>> = {
  "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["#####", "...#.", "..#..", "...#.", "....#", "#...#", ".###."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": ["..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."],
};

const MINUS = [".....", ".....", ".....", "#####", ".....", ".....", "....."];
const SPACE = ["...", "...", "...", "...", "...", "...", "..."];

const SYMBOLS: Readonly<Record<string, readonly string[]>> = {
  "%": ["##...", "##..#", "...#.", "..#..", ".#...", "#..##", "...##"],
  ".": [".", ".", ".", ".", ".", ".", "#"],
  ",": ["..", "..", "..", "..", ".#", ".#", "#."],
  ":": [".", ".", "#", ".", ".", "#", "."],
  "/": ["....#", "...#.", "...#.", "..#..", ".#...", ".#...", "#...."],
  "+": [".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
  "\u2212": MINUS,
  "-": MINUS,
  "\u00D7": [".....", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "....."],
  x: [".....", ".....", "#...#", ".#.#.", "..#..", ".#.#.", "#...#"],
  " ": SPACE,
  "\u00A0": SPACE,
  "\u202F": SPACE,
};

export const PIXEL_GLYPHS: Readonly<Record<string, readonly string[]>> = { ...DIGITS, ...SYMBOLS };

/** Characters the atlas can draw (everything else is reported, never guessed). */
export const PIXEL_CHARSET: readonly string[] = Object.keys(PIXEL_GLYPHS);

export function canDrawPixelText(text: string): boolean {
  return [...text].every((char) => char in PIXEL_GLYPHS);
}

/** One horizontal run of lit cells, in glyph-grid units. */
export interface PixelRun {
  x: number;
  y: number;
  width: number;
}

export interface PixelTextLayout {
  width: number;
  height: number;
  runs: readonly PixelRun[];
}

/**
 * Lays out `text` on the 5×7 grid and merges each row into horizontal runs
 * (one SVG `<rect>` per run). Throws on characters the atlas does not draw,
 * so a caller can never silently lose a digit.
 */
export function layoutPixelText(text: string): PixelTextLayout {
  const runs: PixelRun[] = [];
  let cursor = 0;
  const chars = [...text];
  chars.forEach((char, index) => {
    const glyph = PIXEL_GLYPHS[char];
    if (!glyph) throw new Error(`pixel atlas cannot draw "${char}"`);
    const glyphWidth = glyph[0]?.length ?? 0;
    glyph.forEach((row, y) => {
      let x = 0;
      while (x < row.length) {
        if (row[x] !== "#") {
          x += 1;
          continue;
        }
        let width = 1;
        while (row[x + width] === "#") width += 1;
        runs.push({ x: cursor + x, y, width });
        x += width;
      }
    });
    cursor += glyphWidth + (index < chars.length - 1 ? GLYPH_GAP : 0);
  });
  return { width: cursor, height: GLYPH_HEIGHT, runs };
}
