/**
 * Contrast gate (ADR-027). Runs inside `npm run test`, so `npm run check`
 * fails on any regression of: text on a bright star behind the veil, line
 * minimum, % on weak / dimmed stars, sprite outline on both skies, gold
 * scale. Thresholds: text 4.5, large text 3, UI / graphics 3 (7 / 4.5 in
 * high contrast).
 */

import { describe, expect, it } from "vitest";

import { CATALOG_COLORS, DESIGN_TOKENS, GLOW_TIERS, THEME_MODES } from "@/config";
import { OUTLINE_COLOR, getAllColorIds, getSpriteFrame } from "@/domain/avatars/pixel-sprites";
import { AFFINITY_LABEL_MIN_OPACITY, EDGE_OPACITY_MIN } from "@/ui/constellation/render-helpers";

import { contrastRatio, mixHex } from "./contrast";
import { auditAll, auditMode } from "./contrast-audit";

const INPUTS = {
  lineOpacityMin: EDGE_OPACITY_MIN,
  labelOpacityMin: AFFINITY_LABEL_MIN_OPACITY,
  spriteOutline: OUTLINE_COLOR,
};

describe("contrast audit", () => {
  it.each(THEME_MODES)("%s passes every audited pair", (mode) => {
    const failures = auditMode(mode, INPUTS)
      .filter((row) => row.ratio < row.min)
      .map((row) => `${row.label}: ${row.ratio.toFixed(2)} < ${row.min}`);
    expect(failures).toEqual([]);
  });

  it("improves every pair the visual audit flagged", () => {
    for (const row of auditAll(INPUTS)) {
      if (row.before === undefined) continue;
      if (row.before >= row.min) continue;
      expect(row.ratio, `${row.mode} ${row.label}`).toBeGreaterThan(row.before);
    }
  });

  it("composites alpha the way the browser does", () => {
    expect(mixHex("#FFFFFF", "#000000", 1)).toBe("#FFFFFF");
    expect(mixHex("#FFFFFF", "#000000", 0)).toBe("#000000");
    expect(mixHex("#FFFFFF", "#000000", 0.5)).toBe("#808080");
  });
});

describe("gold scale", () => {
  it.each(THEME_MODES)("%s climbs in contrast against the sky step by step", (mode) => {
    const { colors } = DESIGN_TOKENS.modes[mode];
    const steps = (["oro-100", "oro-200", "oro-300", "oro-400", "oro-500", "oro-600", "oro-700"] as const).map((step) =>
      contrastRatio(colors[step], colors.sky),
    );
    for (let i = 1; i < steps.length; i += 1) expect(steps[i] ?? 0).toBeGreaterThan(steps[i - 1] ?? 0);
  });

  it("uses the gold token as one step of the scale and a gold focus by day", () => {
    for (const mode of THEME_MODES) {
      const { colors } = DESIGN_TOKENS.modes[mode];
      const scale = [colors["oro-300"], colors["oro-400"], colors["oro-500"], colors["oro-600"], colors["oro-700"]];
      expect(scale, mode).toContain(colors.gold);
      expect(scale, mode).toContain(colors.focus);
    }
  });
});

describe("halo tokens", () => {
  it("keeps halos on the pixel grid and switches them off in high contrast", () => {
    for (const mode of THEME_MODES) {
      const { effects, highContrast } = DESIGN_TOKENS.modes[mode];
      for (const tier of GLOW_TIERS) {
        expect(effects.glow[tier].radiusPx % DESIGN_TOKENS.pixel.logicalPx).toBe(0);
        if (highContrast) expect(effects.glow[tier].opacity).toBe(0);
        else expect(effects.glow[tier].opacity).toBeGreaterThan(0);
      }
    }
  });

  it("orders the halos suave < foco ≤ hito and shares radii between night and day", () => {
    for (const mode of ["night", "day"] as const) {
      const { glow } = DESIGN_TOKENS.modes[mode].effects;
      expect(glow.suave.radiusPx).toBeLessThan(glow.foco.radiusPx);
      expect(glow.foco.radiusPx).toBeLessThanOrEqual(glow.hito.radiusPx);
      expect(glow.suave.opacity).toBeLessThan(glow.foco.opacity);
    }
    for (const tier of GLOW_TIERS) {
      expect(DESIGN_TOKENS.modes.day.effects.glow[tier].radiusPx).toBe(DESIGN_TOKENS.modes.night.effects.glow[tier].radiusPx);
    }
  });
});

describe("sprites on both skies", () => {
  const skies = [DESIGN_TOKENS.modes.night.colors.sky, DESIGN_TOKENS.modes.day.colors.sky];

  it("the outline ink clears 3:1 against the night and the day sky", () => {
    for (const sky of skies) expect(contrastRatio(OUTLINE_COLOR, sky)).toBeGreaterThanOrEqual(DESIGN_TOKENS.contrast.ui);
  });

  it("every silhouette edge cell is outline ink (or a protected face / heart / emblem cell)", () => {
    const outside = (grid: string[][], r: number, c: number) => (grid[r]?.[c] ?? "") === "";
    for (const colorId of getAllColorIds().slice(0, 3)) {
      for (const animalId of ["gatito", "ajolotito", "abejita", "tiburoncito", "buhito"]) {
        const { grid, palette } = getSpriteFrame(animalId, colorId, "idle_1");
        const body = new Set(palette.slice(0, 3));
        for (let r = 0; r < grid.length; r += 1) {
          for (let c = 0; c < (grid[r]?.length ?? 0); c += 1) {
            const cell = grid[r]?.[c] ?? "";
            if (!body.has(cell)) continue;
            const onEdge = outside(grid, r - 1, c) || outside(grid, r + 1, c) || outside(grid, r, c - 1) || outside(grid, r, c + 1);
            expect(onEdge, `${animalId}/${colorId} body tone on the edge at ${r},${c}`).toBe(false);
          }
        }
      }
    }
  });

  it("keeps the base tone at 3:1 on both skies (outline and body both separate the shape)", () => {
    for (const color of CATALOG_COLORS) {
      for (const sky of skies) expect(contrastRatio(color.hex, sky), color.id).toBeGreaterThanOrEqual(DESIGN_TOKENS.contrast.ui);
    }
  });
});
