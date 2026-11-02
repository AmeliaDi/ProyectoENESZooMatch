/**
 * Accessibility and distinguishability of the avatar layer: every palette tone
 * keeps ≥ 3:1 (WCAG 1.4.11, non-text) against the night sky AND the day paper,
 * the emblem stays legible on every body tone, and no two (MBTI, type, wing,
 * mark) combinations collapse into the same sprite.
 */
import { describe, expect, it } from "vitest";

import { AVATAR_CONFIG, CATALOG_COLORS, DESIGN_TOKENS } from "@/config";

import { EMBLEM_GLYPHS } from "./emblems";
import { EMBLEM_COLOR, getSpriteFrame } from "./pixel-sprites";

const UI_CONTRAST = DESIGN_TOKENS.contrast.ui;

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe("palette contrast", () => {
  const night = DESIGN_TOKENS.modes.night.colors.sky;
  const day = DESIGN_TOKENS.modes.day.colors.sky;

  it("keeps every base tone at ≥ 3:1 on both skies", () => {
    for (const color of CATALOG_COLORS) {
      expect(contrast(color.hex, night), `${color.id} night`).toBeGreaterThanOrEqual(UI_CONTRAST);
      expect(contrast(color.hex, day), `${color.id} day`).toBeGreaterThanOrEqual(UI_CONTRAST);
    }
  });

  it("keeps the emblem at ≥ 3:1 on every body tone", () => {
    for (const color of CATALOG_COLORS) {
      expect(contrast(EMBLEM_COLOR, color.hex), color.id).toBeGreaterThanOrEqual(UI_CONTRAST);
    }
  });
});

describe("emblems", () => {
  it("gives every type a different glyph", () => {
    const glyphs = Object.values(EMBLEM_GLYPHS).map((rows) => rows.join("|"));
    expect(new Set(glyphs).size).toBe(glyphs.length);
  });

  it("renders the emblem on the chest without touching the silhouette", () => {
    const mask = (colorId: string) =>
      getSpriteFrame("ajolotito", colorId, "idle_1").grid.map((r) => r.map((c) => (c ? "x" : ".")).join("")).join("|");
    expect(mask("ennea-3")).toBe(mask("ennea-8"));
    expect(getSpriteFrame("ajolotito", "ennea-3", "idle_1").grid.flat()).toContain(EMBLEM_COLOR);
  });
});

describe("distinguishability", () => {
  const fingerprint = (animalId: string, colorId: string, mark: "sp" | "so" | "sx" | null) =>
    JSON.stringify(getSpriteFrame(animalId, colorId, "idle_1", mark).grid);

  it("never renders two (species, type, wing, mark) combinations identically", () => {
    const animals = Object.values(AVATAR_CONFIG.species_pools.pools).map((pool) => pool[0]!);
    const marks = [null, "sp", "so", "sx"] as const;
    const seen = new Map<string, string>();
    for (const animalId of animals) {
      for (const color of CATALOG_COLORS) {
        for (const mark of marks) {
          const key = `${animalId}/${color.id}/${mark}`;
          const print = fingerprint(animalId, color.id, mark);
          expect(seen.get(print), key).toBeUndefined();
          seen.set(print, key);
        }
      }
    }
    expect(seen.size).toBe(animals.length * CATALOG_COLORS.length * marks.length);
  });
});
