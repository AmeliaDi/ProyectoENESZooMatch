/**
 * Guards for the fase-3 screens that run in Node (no DOM): copy follows the
 * tone guide, pure helpers behave, and no screen reintroduces the legacy
 * palette, emojis, blur or radii.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { EXPERIENCE } from "@/config";

import { cellsFor } from "./admin/pixel-bars";
import { categoryIcon } from "./design/category-icons";
import { dawnStars, sparkleCells } from "./design/dawn";
import { ICON_NAMES } from "./design/icons";
import { CONSTELLATION_COPY } from "./constellation/types";
import { MATRICULA_COPY } from "./entry/matricula-entry";
import { ONBOARDING_PLATES } from "./entry/onboarding";
import { revealOrder } from "./quiz/reveal-order";
import { FEW_PEOPLE_COPY } from "./result/result-view";
import { litStars } from "./result/why-bars";

const FORBIDDEN = /perfect[oa]|destino|garantizad[oa]|alma[s]? gemela|100 ?% compatible|para siempre|media naranja/i;
const EMOJI = /\p{Extended_Pictographic}/u;

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files(path, out);
    else if (/\.(tsx|css)$/.test(name)) out.push(path);
  }
  return out;
}

const SCREEN_FILES = [
  ...files(resolve("src/ui")).filter((f) => !/[\\/]dev[\\/]/.test(f)),
  resolve("src/app/globals.css"),
  resolve("src/app/screens.css"),
  resolve("src/app/card.css"),
];

describe("copy", () => {
  const copy = [
    ...Object.values(MATRICULA_COPY),
    ...ONBOARDING_PLATES.flatMap((p) => [p.title, p.body]),
    FEW_PEOPLE_COPY,
    ...Object.values(CONSTELLATION_COPY),
  ];

  it("has no forbidden words or emojis", () => {
    for (const text of copy) {
      expect(text, text).not.toMatch(FORBIDDEN);
      expect(text, text).not.toMatch(EMOJI);
    }
  });

  it("keeps onboarding to three plates with titles of at most five words", () => {
    expect(ONBOARDING_PLATES).toHaveLength(3);
    for (const plate of ONBOARDING_PLATES) expect(plate.title.split(/\s+/).length).toBeLessThanOrEqual(5);
  });
});

describe("screen sources", () => {
  it("contain no legacy palette, emojis, blur or radii", () => {
    const legacy = /\b(text|bg|border|ring)-(ink|paper|clay|moss|leaf)\b|font-display|backdrop-blur|rounded-|blur\(|radial-gradient|\.grain\b/;
    for (const file of SCREEN_FILES) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(legacy);
      expect(source, file).not.toMatch(EMOJI);
    }
  });
});

describe("pure helpers", () => {
  it("maps every domain category to a real icon and unknown keys to a fallback", () => {
    for (const key of ["personalidad", "afinidad_cultural", "intimidad_afecto", "valores_relacionales", "identidad"]) {
      expect(ICON_NAMES).toContain(categoryIcon(key));
    }
    expect(categoryIcon("valores_empatia")).toBe("valores_relacionales");
    expect(ICON_NAMES).toContain(categoryIcon("???"));
  });

  it("lights stars proportionally and clamps", () => {
    expect(litStars(0)).toBe(0);
    expect(litStars(55)).toBe(6);
    expect(litStars(140)).toBe(10);
  });

  it("scales admin bars and never hides a non-zero value", () => {
    expect(cellsFor(0, 10)).toBe(0);
    expect(cellsFor(1, 1000)).toBe(1);
    expect(cellsFor(10, 10)).toBe(24);
  });

  it("dawn: deterministic, in-bounds, your star is last and biggest", () => {
    const spec = { width: EXPERIENCE.dawn.gridWidth, height: EXPERIENCE.dawn.gridHeight, count: EXPERIENCE.dawn.stars, seed: EXPERIENCE.dawn.seed };
    const stars = dawnStars(spec);
    expect(dawnStars(spec)).toEqual(stars);
    expect(stars).toHaveLength(spec.count);
    expect(stars.at(-1)).toMatchObject({ mine: true, size: 3, order: spec.count - 1 });
    for (const s of stars) {
      expect(s.x + s.size).toBeLessThanOrEqual(spec.width);
      expect(s.y + s.size).toBeLessThanOrEqual(spec.height);
    }
    expect(sparkleCells(2)).toHaveLength(8);
  });

  it("reveal order is a deterministic permutation that starts near the centre", () => {
    const order = revealOrder(16, EXPERIENCE.reveal.seed);
    expect(revealOrder(16, EXPERIENCE.reveal.seed)).toEqual(order);
    expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: 256 }, (_, i) => i));
    const first = order[0] ?? 0;
    const [x, y] = [first % 16, Math.floor(first / 16)];
    expect(Math.abs(x - 7.5) + Math.abs(y - 7.5)).toBeLessThan(6);
  });
});
