import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { COLOR_ROLES, DESIGN_TOKENS, THEME_MODES } from "@/config";
import { designTokensSchema } from "@/config/design";


import { BAYER_4, bayerMaskDataUri, bayerTileCells, DITHER_LEVELS } from "./bayer";
import { contrastRatio, parseHex } from "./contrast";
import { modeVariables } from "./css-tokens";
import { ICON_GRID, ICON_NAMES, iconDrawing, iconPaths } from "./icons";
import { diamondPath, likertGemSizes, progressStars } from "./shapes";
import { generateNebula, generateStars, twinkleLevel } from "./sky";

// Raw JSON read from disk (not imported) so the schema can be fed corrupt copies.
const rawTokens = JSON.parse(readFileSync(join(process.cwd(), "data/design-tokens.json"), "utf8")) as {
  touchTargetMin: number;
  modes: Record<string, { colors: Record<string, string> }>;
};

const ATLAS_CSS = readFileSync(join(process.cwd(), "src/app/atlas.css"), "utf8").replace(/\r/g, "");

function declarations(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of block.matchAll(/(--zm-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    const [, name, value] = match;
    if (name && value) out[name] = value.trim();
  }
  return out;
}

function roleDeclarations(block: string): Record<string, string> {
  const roles = new Set(COLOR_ROLES.map((role) => `--zm-${role}`));
  return Object.fromEntries(Object.entries(declarations(block)).filter(([name]) => roles.has(name)));
}

function modeBlock(mode: string): string {
  const start = ATLAS_CSS.indexOf(`/* mode:${mode} */`);
  const end = ATLAS_CSS.indexOf(`/* end:${mode} */`);
  expect(start, `marker mode:${mode}`).toBeGreaterThanOrEqual(0);
  expect(end, `marker end:${mode}`).toBeGreaterThan(start);
  return ATLAS_CSS.slice(start, end);
}

describe("design tokens", () => {
  it("validate and expose the four designed modes", () => {
    expect(THEME_MODES).toEqual(["night", "day", "night-hc", "day-hc"]);
    for (const mode of THEME_MODES) {
      expect(Object.keys(DESIGN_TOKENS.modes[mode].colors).sort()).toEqual([...COLOR_ROLES].sort());
    }
  });

  it("reject corrupt tokens", () => {
    const badHex = structuredClone(rawTokens);
    const nightColors = badHex.modes.night?.colors;
    if (nightColors) nightColors.fg = "#fff";
    expect(designTokensSchema.safeParse(badHex).success).toBe(false);

    const smallTouch = structuredClone(rawTokens);
    smallTouch.touchTargetMin = 40;
    expect(designTokensSchema.safeParse(smallTouch).success).toBe(false);

    const offGrid = structuredClone(rawTokens);
    offGrid.touchTargetMin = 45;
    expect(designTokensSchema.safeParse(offGrid).success).toBe(false);

    const missingRole = structuredClone(rawTokens);
    const dayColors = missingRole.modes.day?.colors;
    if (dayColors) delete dayColors.star;
    expect(designTokensSchema.safeParse(missingRole).success).toBe(false);
  });

  it.each(THEME_MODES)("%s meets every declared contrast pair", (mode) => {
    const { colors, highContrast } = DESIGN_TOKENS.modes[mode];
    const { contrast } = DESIGN_TOKENS;
    const failures: string[] = [];
    for (const pair of DESIGN_TOKENS.contrastPairs) {
      const min =
        pair.kind === "text"
          ? highContrast ? contrast.textHighContrast : contrast.text
          : highContrast ? contrast.uiHighContrast : contrast.ui;
      for (const bg of pair.bg) {
        const ratio = contrastRatio(colors[pair.fg], colors[bg]);
        if (ratio < min) failures.push(`${pair.fg} on ${bg}: ${ratio.toFixed(2)} < ${min}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it.each(THEME_MODES)("%s keeps stars visible but quieter than text", (mode) => {
    const { colors, highContrast } = DESIGN_TOKENS.modes[mode];
    const { contrast } = DESIGN_TOKENS;
    const star = contrastRatio(colors.star, colors.sky);
    const text = contrastRatio(colors.fg, colors.sky);
    expect(star).toBeGreaterThanOrEqual(highContrast ? contrast.uiHighContrast : contrast.ui);
    expect(star).toBeLessThanOrEqual(text * contrast.starMaxShareOfText);
    expect(colors.star).not.toBe(colors.fg);
  });
});

describe("contrast", () => {
  it("matches WCAG reference values", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
    expect(contrastRatio("#777777", "#FFFFFF")).toBeCloseTo(4.48, 2);
    expect(contrastRatio("#123456", "#ABCDEF")).toBeCloseTo(contrastRatio("#ABCDEF", "#123456"), 10);
  });

  it("rejects malformed colours", () => {
    expect(() => parseHex("#FFF")).toThrow();
    expect(parseHex("#0a0B0c")).toEqual([10, 11, 12]);
  });
});

describe("atlas.css stays in sync with design-tokens.json", () => {
  it.each(THEME_MODES)("mode block %s", (mode) => {
    expect(roleDeclarations(modeBlock(mode))).toEqual(modeVariables(DESIGN_TOKENS, mode));
  });

  it("prefers-color-scheme: light fallback equals the day mode", () => {
    const start = ATLAS_CSS.indexOf("@media (prefers-color-scheme: light)");
    expect(start).toBeGreaterThanOrEqual(0);
    const block = ATLAS_CSS.slice(start, ATLAS_CSS.indexOf("}\n}", start));
    expect(roleDeclarations(block)).toEqual(modeVariables(DESIGN_TOKENS, "day"));
  });

  it.each(DITHER_LEVELS)("--zm-dither-%i is the generated Bayer tile", (level) => {
    expect(declarations(ATLAS_CSS)[`--zm-dither-${level}`]).toBe(bayerMaskDataUri(level / 100));
  });
});

describe("bayer", () => {
  it("is a permutation of 0..15", () => {
    expect(BAYER_4.flat().sort((a, b) => a - b)).toEqual(Array.from({ length: 16 }, (_, i) => i));
  });

  it("lights exactly coverage × 16 cells and nests levels", () => {
    expect(bayerTileCells(0)).toHaveLength(0);
    expect(bayerTileCells(0.25)).toHaveLength(4);
    expect(bayerTileCells(0.5)).toHaveLength(8);
    expect(bayerTileCells(0.75)).toHaveLength(12);
    expect(bayerTileCells(1)).toHaveLength(16);
    const key = ([x, y]: readonly [number, number]) => `${x},${y}`;
    const quarter = new Set(bayerTileCells(0.25).map(key));
    const half = new Set(bayerTileCells(0.5).map(key));
    for (const cell of quarter) expect(half.has(cell)).toBe(true);
  });
});

describe("icons", () => {
  it("has 32 UI icons plus 5 category icons, all unique 12×12 drawings", () => {
    expect(ICON_NAMES).toHaveLength(37);
    const seen = new Set<string>();
    for (const name of ICON_NAMES) {
      const rows = iconDrawing(name);
      expect(rows, name).toHaveLength(ICON_GRID);
      for (const row of rows) expect(row, name).toMatch(/^[#+.]{12}$/);
      const key = rows.join("");
      expect(seen.has(key), `${name} duplicates another icon`).toBe(false);
      seen.add(key);
    }
  });

  it("produces non-empty memoized paths on the grid", () => {
    for (const name of ICON_NAMES) {
      const paths = iconPaths(name);
      expect(paths.line.length, name).toBeGreaterThan(0);
      expect(iconPaths(name)).toBe(paths);
      expect(paths.line).not.toMatch(/\d\.\d/);
    }
  });
});

describe("shapes", () => {
  function cells(path: string): Set<string> {
    const out = new Set<string>();
    for (const match of path.matchAll(/M(\d+) (\d+)h(-?\d+)/g)) {
      const x = Number(match[1]);
      const y = Number(match[2]);
      const w = Number(match[3]);
      for (let i = 0; i < w; i += 1) out.add(`${x + i},${y}`);
    }
    return out;
  }

  it.each([5, 7, 9, 13])("diamond %i is horizontally and vertically symmetric", (n) => {
    for (const hollow of [false, true]) {
      const set = cells(diamondPath(n, hollow));
      for (const key of set) {
        const [x = 0, y = 0] = key.split(",").map(Number);
        expect(set.has(`${n - 1 - x},${y}`)).toBe(true);
        expect(set.has(`${x},${n - 1 - y}`)).toBe(true);
      }
    }
  });

  it("rounds even diamonds up to odd sizes", () => {
    expect(diamondPath(6, false)).toBe(diamondPath(7, false));
  });

  it("likert gems are odd, symmetric and smallest in the centre", () => {
    const sizes = likertGemSizes(5);
    expect(sizes).toEqual([...sizes].reverse());
    for (const size of sizes) expect(size % 2).toBe(1);
    expect(Math.min(...sizes)).toBe(sizes[2]);
  });

  it("progress stars are deterministic and inside the band", () => {
    const a = progressStars(56, 200, 16);
    expect(progressStars(56, 200, 16)).toEqual(a);
    expect(a).toHaveLength(56);
    for (const star of a) {
      expect(star.x).toBeGreaterThanOrEqual(0);
      expect(star.x + star.size).toBeLessThanOrEqual(200);
      expect(star.y).toBeGreaterThanOrEqual(0);
      expect(star.y + star.size).toBeLessThanOrEqual(16);
    }
    expect(progressStars(0, 200, 16)).toEqual([]);
  });
});

describe("sky", () => {
  const spec = DESIGN_TOKENS.sky;

  it("stars are deterministic and fit inside the tile", () => {
    const stars = generateStars(spec);
    expect(generateStars(spec)).toEqual(stars);
    expect(stars.length).toBeGreaterThan(0);
    for (const star of stars) {
      expect(star.x + star.size).toBeLessThanOrEqual(spec.tileCells);
      expect(star.y + star.size).toBeLessThanOrEqual(spec.tileCells);
    }
  });

  it("nebula cells stay inside the grid and are deterministic", () => {
    const cells = generateNebula(spec, 80, 60);
    expect(generateNebula(spec, 80, 60)).toEqual(cells);
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      expect(cell.x).toBeLessThan(80);
      expect(cell.y).toBeLessThan(60);
    }
  });

  it("twinkle levels are discrete and in range", () => {
    const levels = spec.twinkleLevels.length;
    for (const star of generateStars(spec).slice(0, 200)) {
      for (const t of [0, 333, 1200, 5000, 99_999]) {
        const level = twinkleLevel(star, t, levels);
        expect(Number.isInteger(level)).toBe(true);
        expect(level).toBeGreaterThanOrEqual(0);
        expect(level).toBeLessThan(levels);
        if (star.periodMs === 0) expect(level).toBe(0);
      }
    }
  });
});
