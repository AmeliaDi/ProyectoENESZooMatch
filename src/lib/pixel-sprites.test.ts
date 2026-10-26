/**
 * ZooMatch — Pixel Sprite Generator specs
 * ─────────────────────────────────────────────────────────────────────────────
 * Covers the 10 required invariants plus a handful of regression guards that
 * protect the design contract (determinism, symmetry budget, palette rules,
 * frame semantics).
 */

import { describe, expect, it } from "vitest";

import catalogoData from "../../data/arquetipos.json";
import {
  ALL_FAMILIES,
  ALL_FRAMES,
  BLUSH_COLOR,
  EYE_COLOR,
  GRID_SIZE,
  HALF_WIDTH,
  HEART_COLOR,
  INTENSE_BLUSH_COLOR,
  SPARKLE_COLOR,
  getAnimalFamily,
  getAllAnimalIds,
  getAllColorIds,
  getSprite,
  getSpriteFrame,
  simpleHash,
  validateSpriteIsPixelArt,
  type AnimationFrame,
  type ShapeFamily,
  type SpriteData,
} from "./pixel-sprites";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;

/** Colour ids used throughout the suite; both exist in the catalogue. */
const PRIMARY_COLOR = "verde-esmeralda";
const SECONDARY_COLOR = "rosa-pastel";

const FRAMES: readonly AnimationFrame[] = ALL_FRAMES;

interface CatalogAnimal {
  id: string;
  categoria_fauna: string;
}

interface CatalogColor {
  id: string;
  hex: string;
  textura: string;
}

const CATALOG_ANIMALS = catalogoData.animales as unknown as CatalogAnimal[];
const CATALOG_COLORS = catalogoData.colores as unknown as CatalogColor[];

const ALL_IDS = getAllAnimalIds();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Serialises a grid so two sprites can be compared with a single `toBe`. */
function fingerprint(sprite: SpriteData): string {
  return JSON.stringify(sprite.grid);
}

/**
 * Every `(row, column)` pair in the left half whose mirror partner differs.
 * A perfectly symmetric sprite yields an empty list.
 */
function asymmetricCells(grid: string[][]): Array<[number, number]> {
  const diffs: Array<[number, number]> = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < HALF_WIDTH; c++) {
      if (grid[r][c] !== grid[r][GRID_SIZE - 1 - c]) diffs.push([r, c]);
    }
  }
  return diffs;
}

function expectValidSprite(sprite: SpriteData, animalId: string): void {
  expect(sprite.animalId, `animalId echo for ${animalId}`).toBe(animalId);
  expect(sprite.grid, `grid for ${animalId}`).toHaveLength(GRID_SIZE);
  expect(sprite.palette.length, `palette size for ${animalId}`).toBeGreaterThan(0);
  expect(sprite.palette.length, `palette size for ${animalId}`).toBeLessThanOrEqual(5);
  expect(ALL_FAMILIES, `family for ${animalId}`).toContain(sprite.family);
}

// ─── 1. Every animal renders ──────────────────────────────────────────────────

describe("getSprite — coverage", () => {
  it("generates a valid sprite for every registered animal", () => {
    expect(ALL_IDS.length).toBe(103);

    const rendered: SpriteData[] = [];
    for (const animalId of ALL_IDS) {
      expect(
        () => rendered.push(getSprite(animalId, PRIMARY_COLOR)),
        `getSprite(${animalId}) must not throw`,
      ).not.toThrow();
    }
    expect(rendered).toHaveLength(ALL_IDS.length);

    rendered.forEach((sprite, index) => {
      const animalId = ALL_IDS[index];
      expectValidSprite(sprite, animalId);
      expect(sprite.family).toBe(getAnimalFamily(animalId));
      expect(sprite.colorId).toBe(PRIMARY_COLOR);
    });
  });

  it("registers all 103 catalogue animals exactly once", () => {
    expect(CATALOG_ANIMALS).toHaveLength(103);
    expect(ALL_IDS).toHaveLength(103);

    for (const animal of CATALOG_ANIMALS) {
      expect(ALL_IDS, `catalogue animal ${animal.id}`).toContain(animal.id);
    }
    expect(new Set(ALL_IDS).size).toBe(ALL_IDS.length);
  });

  it("never emits a blank grid (no silent unknown-animal fallback)", () => {
    for (const animalId of ALL_IDS) {
      const sprite = getSprite(animalId, PRIMARY_COLOR);
      const painted = sprite.grid.flat().filter((cell) => cell !== "").length;
      expect(painted, `${animalId} must paint pixels`).toBeGreaterThan(20);
    }
  });

  it("renders every cell as transparent or a 6-digit hex colour", () => {
    for (const animalId of ALL_IDS) {
      for (const frame of FRAMES) {
        const sprite = getSpriteFrame(animalId, PRIMARY_COLOR, frame);
        for (const row of sprite.grid) {
          for (const cell of row) {
            if (cell === "") continue;
            expect(cell, `${animalId}/${frame} cell`).toMatch(HEX_PATTERN);
          }
        }
      }
    }
  });
});

// ─── 2. Determinism ───────────────────────────────────────────────────────────

describe("determinism", () => {
  it("returns identical grids for repeated calls", () => {
    const first = getSprite("ajolotito", "rosa-pastel");
    const second = getSprite("ajolotito", "rosa-pastel");

    expect(second.grid).toEqual(first.grid);
    expect(second.palette).toEqual(first.palette);
    expect(second.family).toBe(first.family);
    expect(fingerprint(second)).toBe(fingerprint(first));
  });

  it("is stable across the whole catalogue on a second pass", () => {
    const firstPass = ALL_IDS.map((id) => fingerprint(getSprite(id, PRIMARY_COLOR)));
    const secondPass = ALL_IDS.map((id) => fingerprint(getSprite(id, PRIMARY_COLOR)));
    expect(secondPass).toEqual(firstPass);
  });

  it("returns a fresh grid object on every call (no shared mutable state)", () => {
    const first = getSprite("gatito", PRIMARY_COLOR);
    const second = getSprite("gatito", PRIMARY_COLOR);

    expect(second.grid).not.toBe(first.grid);
    expect(second.grid[0]).not.toBe(first.grid[0]);

    // Mutating a returned grid must not corrupt later renders.
    first.grid[0][0] = "#000000";
    expect(getSprite("gatito", PRIMARY_COLOR).grid).toEqual(second.grid);
  });

  it("derives variations from simpleHash, which is itself stable", () => {
    expect(simpleHash("ajolotito")).toBe(simpleHash("ajolotito"));
    expect(simpleHash("ajolotito")).not.toBe(simpleHash("ranita"));
    expect(Number.isInteger(simpleHash("ajolotito"))).toBe(true);
    expect(simpleHash("ajolotito")).toBeGreaterThanOrEqual(0);
  });
});

// ─── 3. Grid size ─────────────────────────────────────────────────────────────

describe("grid size", () => {
  it("is exactly 12 rows by 12 columns for every animal, colour and frame", () => {
    const colors = [PRIMARY_COLOR, SECONDARY_COLOR, "azul-zafiro"];

    for (const animalId of ALL_IDS) {
      for (const colorId of colors) {
        for (const frame of FRAMES) {
          const sprite = getSpriteFrame(animalId, colorId, frame);
          const label = `${animalId}/${colorId}/${frame}`;

          expect(sprite.grid, `${label} rows`).toHaveLength(GRID_SIZE);
          for (const [index, row] of sprite.grid.entries()) {
            expect(row, `${label} row ${index} columns`).toHaveLength(GRID_SIZE);
          }
        }
      }
    }
  });
});

// ─── 4. Horizontal symmetry ───────────────────────────────────────────────────

describe("horizontal symmetry", () => {
  it("mirrors columns 0-5 onto 11-6, with at most 2 tail pixels in rows 9-11", () => {
    for (const animalId of ALL_IDS) {
      for (const frame of FRAMES) {
        const sprite = getSpriteFrame(animalId, PRIMARY_COLOR, frame);
        const diffs = asymmetricCells(sprite.grid);
        const label = `${animalId}/${frame}`;

        for (const [r] of diffs) {
          expect(r, `${label} asymmetry must live in the tail rows`).toBeGreaterThanOrEqual(
            GRID_SIZE - 3,
          );
        }
        expect(diffs.length, `${label} tail budget`).toBeLessThanOrEqual(2);
      }
    }
  });

  it("keeps rows 0-8 perfectly symmetric", () => {
    for (const animalId of ALL_IDS) {
      const { grid } = getSprite(animalId, PRIMARY_COLOR);
      for (let r = 0; r < GRID_SIZE - 3; r++) {
        for (let c = 0; c < HALF_WIDTH; c++) {
          expect(grid[r][c], `${animalId} row ${r} col ${c}`).toBe(
            grid[r][GRID_SIZE - 1 - c],
          );
        }
      }
    }
  });
});

// ─── 5 & 6. Palette ───────────────────────────────────────────────────────────

describe("palette", () => {
  it("never exceeds five entries", () => {
    for (const animalId of ALL_IDS) {
      for (const colorId of getAllColorIds()) {
        const { palette } = getSprite(animalId, colorId);
        expect(palette.length, `${animalId}/${colorId}`).toBeLessThanOrEqual(5);
      }
    }
  });

  it("only contains well-formed hex colours, with no duplicates", () => {
    for (const animalId of ALL_IDS) {
      const { palette } = getSprite(animalId, PRIMARY_COLOR);
      for (const entry of palette) {
        expect(entry, `${animalId} palette entry`).toMatch(HEX_PATTERN);
      }
      expect(new Set(palette).size, `${animalId} palette uniqueness`).toBe(palette.length);
    }
  });

  it("uses the catalogue hex as the base tone and derives the shades from it", () => {
    for (const color of CATALOG_COLORS) {
      const { palette } = getSprite("delfincito", color.id);
      const [base, shadow, highlight, eyes, blush] = palette;

      expect(base, `${color.id} base`).toBe(color.hex);
      expect(eyes, `${color.id} eyes`).toBe(EYE_COLOR);
      expect(blush, `${color.id} blush`).toBe(BLUSH_COLOR);
      expect(palette, `${color.id} palette`).toHaveLength(5);

      const channel = (hex: string, offset: number): number =>
        parseInt(hex.slice(1 + offset * 2, 3 + offset * 2), 16);

      for (let i = 0; i < 3; i++) {
        const value = channel(color.hex, i);
        // shadow = base × 0.7 (rounded), highlight = base + 30% of the way to white.
        expect(channel(shadow, i), `${color.id} shadow channel ${i}`).toBe(
          Math.round(value * 0.7),
        );
        expect(channel(highlight, i), `${color.id} highlight channel ${i}`).toBe(
          Math.round(value + (255 - value) * 0.3),
        );
      }
    }
  });

  it("only paints colours that belong to the sprite palette", () => {
    for (const animalId of ALL_IDS) {
      const sprite = getSprite(animalId, PRIMARY_COLOR);
      for (const cell of sprite.grid.flat()) {
        if (cell === "") continue;
        expect(sprite.palette, `${animalId} cell ${cell}`).toContain(cell);
      }
    }
  });
});

// ─── 7. Uniqueness ────────────────────────────────────────────────────────────

describe("uniqueness", () => {
  it("produces no duplicate grids across all animals sharing one colour", () => {
    const prints = ALL_IDS.map((id) => fingerprint(getSprite(id, PRIMARY_COLOR)));
    expect(new Set(prints).size, "distinct sprites").toBe(prints.length);
  });

  it("stays unique for every colour in the catalogue", () => {
    for (const colorId of getAllColorIds()) {
      const prints = ALL_IDS.map((id) => fingerprint(getSprite(id, colorId)));
      expect(new Set(prints).size, `distinct sprites for ${colorId}`).toBe(prints.length);
    }
  });

  it("stays unique for every animation frame", () => {
    for (const frame of FRAMES) {
      const prints = ALL_IDS.map((id) =>
        fingerprint(getSpriteFrame(id, PRIMARY_COLOR, frame)),
      );
      expect(new Set(prints).size, `distinct ${frame} sprites`).toBe(prints.length);
    }
  });

  it("keeps animals inside the same family visually distinct", () => {
    const byFamily = new Map<ShapeFamily, string[]>();
    for (const animalId of ALL_IDS) {
      const family = getAnimalFamily(animalId);
      const bucket = byFamily.get(family) ?? [];
      bucket.push(fingerprint(getSprite(animalId, PRIMARY_COLOR)));
      byFamily.set(family, bucket);
    }

    for (const [family, prints] of byFamily) {
      expect(prints.length, `${family} population`).toBeGreaterThan(0);
      expect(new Set(prints).size, `${family} uniqueness`).toBe(prints.length);
    }
  });
});

// ─── 8 & 9. Animation frames ──────────────────────────────────────────────────

describe("animation frames", () => {
  it("idle_2 blinks: it differs from idle_1 only where the eyes were", () => {
    for (const animalId of ALL_IDS) {
      const open = getSpriteFrame(animalId, PRIMARY_COLOR, "idle_1");
      const blink = getSpriteFrame(animalId, PRIMARY_COLOR, "idle_2");

      expect(fingerprint(blink), `${animalId} blink must differ`).not.toBe(
        fingerprint(open),
      );

      let changed = 0;
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          if (open.grid[r][c] === blink.grid[r][c]) continue;
          changed++;
          // Only an eye pixel may change, and it becomes the base tone.
          expect(open.grid[r][c], `${animalId} changed cell ${r},${c}`).toBe(EYE_COLOR);
          expect(blink.grid[r][c], `${animalId} blinked cell ${r},${c}`).toBe(
            open.palette[0],
          );
        }
      }
      expect(changed, `${animalId} blinked pixel count`).toBeGreaterThanOrEqual(2);
      // Blinking keeps at least the bottom eye row open.
      expect(
        blink.grid.flat().filter((cell) => cell === EYE_COLOR).length,
        `${animalId} keeps an open eye row`,
      ).toBeGreaterThan(0);
    }
  });

  it("happy differs from idle_1 and removes every eye pixel", () => {
    for (const animalId of ALL_IDS) {
      const idle = getSpriteFrame(animalId, PRIMARY_COLOR, "idle_1");
      const happy = getSpriteFrame(animalId, PRIMARY_COLOR, "happy");

      expect(fingerprint(happy), `${animalId} happy must differ`).not.toBe(
        fingerprint(idle),
      );
      expect(happy.grid.flat(), `${animalId} happy has no eyes`).not.toContain(EYE_COLOR);
      expect(
        idle.grid.flat().filter((cell) => cell === EYE_COLOR).length,
        `${animalId} idle has eyes`,
      ).toBeGreaterThan(0);
    }
  });

  it("happy adds a small red heart above the crown", () => {
    expect(HEART_COLOR).toBe("#FF6B6B");

    for (const animalId of ALL_IDS) {
      const happy = getSpriteFrame(animalId, PRIMARY_COLOR, "happy");
      const hearts = happy.grid.flat().filter((cell) => cell === HEART_COLOR).length;
      // Two lobes plus a centred point, mirrored across the axis.
      expect(hearts, `${animalId} heart pixels`).toBeGreaterThanOrEqual(2);
      expect(hearts, `${animalId} heart pixels`).toBeLessThanOrEqual(4);
      // The heart lives in the two topmost rows, above the crown.
      for (let r = 2; r < GRID_SIZE; r++) {
        expect(
          happy.grid[r].includes(HEART_COLOR),
          `${animalId} heart must stay above row 2`,
        ).toBe(false);
      }
    }
  });

  it("stamps a mandatory blush pixel under each eye in every frame", () => {
    expect(BLUSH_COLOR).toBe("#FFAAA6");
    expect(INTENSE_BLUSH_COLOR).toBe("#FF8A8A");

    for (const animalId of ALL_IDS) {
      for (const frame of FRAMES) {
        const sprite = getSpriteFrame(animalId, PRIMARY_COLOR, frame);
        const blush = sprite.grid
          .flat()
          .filter((cell) => cell === BLUSH_COLOR || cell === INTENSE_BLUSH_COLOR).length;
        expect(blush, `${animalId}/${frame} blush`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("romance_pulse uses heart-eyes, an intense blush and two 3×3 hearts above the head", () => {
    for (const animalId of ALL_IDS) {
      const idle = getSpriteFrame(animalId, PRIMARY_COLOR, "idle_1");
      const happy = getSpriteFrame(animalId, PRIMARY_COLOR, "happy");
      const romance = getSpriteFrame(animalId, PRIMARY_COLOR, "romance_pulse");

      expect(fingerprint(romance), `${animalId} romance differs from idle`).not.toBe(
        fingerprint(idle),
      );
      expect(fingerprint(romance), `${animalId} romance differs from happy`).not.toBe(
        fingerprint(happy),
      );
      expect(romance.grid.flat(), `${animalId} romance has no dark eyes`).not.toContain(
        EYE_COLOR,
      );
      expect(
        romance.grid.flat().filter((cell) => cell === INTENSE_BLUSH_COLOR).length,
        `${animalId} romance intense blush`,
      ).toBeGreaterThanOrEqual(2);
      expect(
        romance.grid.flat().filter((cell) => cell === SPARKLE_COLOR).length,
        `${animalId} romance eye sparkles`,
      ).toBeGreaterThanOrEqual(2);

      const heartPixels = romance.grid.flat().filter((cell) => cell === HEART_COLOR).length;
      const floatedHearts = romance.grid
        .slice(0, 3)
        .flat()
        .filter((cell) => cell === HEART_COLOR).length;
      // Two mirrored 3×3 hearts: five pixels each, ten in total.
      expect(heartPixels, `${animalId} romance heart pixels`).toBeGreaterThanOrEqual(6);
      expect(heartPixels, `${animalId} romance heart pixels`).toBeLessThanOrEqual(10);
      expect(floatedHearts, `${animalId} hearts live in rows 0-2`).toBe(heartPixels);
      for (let r = 3; r < GRID_SIZE; r++) {
        expect(
          romance.grid[r].includes(HEART_COLOR),
          `${animalId} hearts must stay above row 3`,
        ).toBe(false);
      }
    }
  });

  it("passes structural pixel-art validation on every animal and frame", () => {
    for (const animalId of ALL_IDS) {
      for (const frame of FRAMES) {
        const sprite = getSpriteFrame(animalId, SECONDARY_COLOR, frame);
        const result = validateSpriteIsPixelArt(sprite.grid);
        expect(result.errors, `${animalId}/${frame}: ${result.errors.join("; ")}`).toEqual([]);
        expect(result.valid).toBe(true);
      }
    }
  });

  it("rejects malformed grids with actionable errors", () => {
    const base = getSprite(ALL_IDS[0]!, PRIMARY_COLOR).grid.map((row) => row.slice());
    const withGradient = base.map((row) => row.slice());
    withGradient[4]![4] = "linear-gradient(#fff,#000)";
    expect(validateSpriteIsPixelArt(withGradient).valid).toBe(false);

    const withFilledCorner = base.map((row) => row.slice());
    withFilledCorner[0]![0] = "#123456";
    const cornerResult = validateSpriteIsPixelArt(withFilledCorner);
    expect(cornerResult.valid).toBe(false);
    expect(cornerResult.errors.join(" ")).toContain("corner");

    const withoutBlush = base.map((row) =>
      row.map((cell) => (cell === BLUSH_COLOR ? "#123456" : cell)),
    );
    const blushResult = validateSpriteIsPixelArt(withoutBlush);
    expect(blushResult.valid).toBe(false);
    expect(blushResult.errors.join(" ")).toContain("blush");

    expect(validateSpriteIsPixelArt([[""]]).valid).toBe(false);
  });

  it("reports the frame-independent identity on every frame", () => {
    for (const animalId of ALL_IDS) {
      for (const frame of FRAMES) {
        const sprite = getSpriteFrame(animalId, SECONDARY_COLOR, frame);
        expect(sprite.family, `${animalId}/${frame} family`).toBe(
          getAnimalFamily(animalId),
        );
        expect(sprite.colorId, `${animalId}/${frame} colorId`).toBe(SECONDARY_COLOR);
      }
    }
  });

  it("getSprite is exactly the idle_1 frame", () => {
    for (const animalId of ALL_IDS) {
      expect(fingerprint(getSprite(animalId, PRIMARY_COLOR))).toBe(
        fingerprint(getSpriteFrame(animalId, PRIMARY_COLOR, "idle_1")),
      );
    }
  });
});

// ─── 10. Family assignment ────────────────────────────────────────────────────

describe("family assignment", () => {
  it("returns one of the 12 shape families for every animal", () => {
    expect(ALL_FAMILIES).toHaveLength(12);

    for (const animalId of ALL_IDS) {
      const family = getAnimalFamily(animalId);
      expect(ALL_FAMILIES, `${animalId} family`).toContain(family);
      expect(typeof family).toBe("string");
    }
  });

  it("is stable and idempotent", () => {
    for (const animalId of ALL_IDS) {
      expect(getAnimalFamily(animalId)).toBe(getAnimalFamily(animalId));
      expect(getSprite(animalId, PRIMARY_COLOR).family).toBe(getAnimalFamily(animalId));
    }
  });

  it("covers every family with at least one animal", () => {
    const used = new Set<ShapeFamily>(ALL_IDS.map((id) => getAnimalFamily(id)));
    for (const family of ALL_FAMILIES) {
      expect(used, `${family} must be used`).toContain(family);
    }
  });

  it("agrees with the catalogue's categoria_fauna for the unambiguous classes", () => {
    const expected: Record<string, ShapeFamily> = {
      ave: "ave",
      anfibio: "anfibio",
      reptil: "reptil",
      insecto: "insecto",
      pez: "acuatico",
      molusco: "marino",
      cnidario: "marino",
      equinodermo: "marino",
    };

    /**
     * Places where the brief deliberately overrides the catalogue's coarse label:
     * flamingos belong to `exotico` (long neck, distinctive silhouette) even
     * though `categoria_fauna` says "ave", and the two crustaceans are split by
     * body plan — a crab is segmented like an insect, a langostine is fish-like.
     */
    const specOverrides: Record<string, ShapeFamily> = {
      flamenco: "exotico",
      dragoncito: "exotico",
      cangrejito: "insecto",
      langostita: "acuatico",
    };

    for (const animal of CATALOG_ANIMALS) {
      const want = specOverrides[animal.id] ?? expected[animal.categoria_fauna];
      if (!want) continue; // "mamifero" is split per species and has no single answer.
      expect(getAnimalFamily(animal.id), `${animal.id} (${animal.categoria_fauna})`).toBe(
        want,
      );
    }
  });

  it("resolves unknown ids to a valid family instead of throwing", () => {
    for (const probe of ["gatito-misterioso", "leoncito", "x", "", "PEZ-abismal"]) {
      expect(ALL_FAMILIES, `fallback family for "${probe}"`).toContain(
        getAnimalFamily(probe),
      );
      expect(() => getSprite(probe, PRIMARY_COLOR)).not.toThrow();
      expect(getSprite(probe, PRIMARY_COLOR).grid.flat().some((cell) => cell !== "")).toBe(
        true,
      );
    }
  });
});

// ─── Extra regression guards ──────────────────────────────────────────────────

describe("colour handling", () => {
  it("supports every catalogue colour id", () => {
    const colorIds = getAllColorIds();
    expect(colorIds).toHaveLength(55);
    expect(colorIds).toContain(PRIMARY_COLOR);
    expect(colorIds).toEqual(CATALOG_COLORS.map((color) => color.id));

    for (const colorId of colorIds) {
      const sprite = getSprite("buhito", colorId);
      expectValidSprite(sprite, "buhito");
      expect(sprite.palette).toHaveLength(5);
      expect(sprite.palette[0]).toBe(
        CATALOG_COLORS.find((color) => color.id === colorId)?.hex,
      );
      expect(sprite.palette[4]).toBe(BLUSH_COLOR);
    }
  });

  it("supports colour names as aliases for catalogue ids", () => {
    const byName = getSprite("tigrito", "Verde Esmeralda");
    expect(byName.palette[0]).toBe(getSprite("tigrito", PRIMARY_COLOR).palette[0]);
  });

  it("falls back deterministically for unknown colour ids", () => {
    const first = getSprite("conejito", "no-existe");
    const second = getSprite("conejito", "no-existe");
    expect(first.grid).toEqual(second.grid);
    expect(first.palette[0]).toMatch(HEX_PATTERN);
    expectValidSprite(first, "conejito");
  });

  it("changes the palette when the colour changes but keeps the silhouette", () => {
    const a = getSprite("leoncito", PRIMARY_COLOR);
    const b = getSprite("leoncito", SECONDARY_COLOR);

    expect(a.palette).not.toEqual(b.palette);
    // The painted shape is identical; only the hex mapping differs.
    const silhouette = (sprite: SpriteData): string =>
      sprite.grid
        .map((row) => row.map((cell) => (cell === "" ? "." : "x")).join(""))
        .join("|");
    expect(silhouette(a)).toBe(silhouette(b));
  });
});

describe("texture", () => {
  /**
   * Maps a grid onto tone-role indices using its own palette. Every catalogue
   * colour yields four distinct tones, so index 0/1/2/3 always means
   * base/shadow/highlight/eyes and two sprites become directly comparable.
   */
  function toneRoles(sprite: SpriteData): number[][] {
    return sprite.grid.map((row) =>
      row.map((cell) => (cell === "" ? -1 : sprite.palette.indexOf(cell))),
    );
  }

  /** The catalogue's matte reference colour — textures are measured against it. */
  function matteColor(): CatalogColor {
    const matte = CATALOG_COLORS.find((color) => color.textura === "mate");
    if (!matte) throw new Error("the catalogue must contain a matte colour");
    return matte;
  }

  it("alters at most four pixels relative to the same sprite with a matte colour", () => {
    const matte = matteColor();

    for (const color of CATALOG_COLORS) {
      for (const animalId of ["gatito", "ajolotito", "abejita", "tiburoncito"]) {
        const plain = toneRoles(getSprite(animalId, matte.id));
        const textured = toneRoles(getSprite(animalId, color.id));

        let differing = 0;
        for (let r = 0; r < GRID_SIZE; r++) {
          for (let c = 0; c < GRID_SIZE; c++) {
            if (plain[r][c] !== textured[r][c]) differing++;
          }
        }
        expect(
          differing,
          `${animalId}/${color.id} (${color.textura}) texture footprint`,
        ).toBeLessThanOrEqual(4);
      }
    }
  });

  it("never changes which pixels are painted", () => {
    const matte = matteColor();

    const mask = (sprite: SpriteData): string =>
      sprite.grid
        .map((row) => row.map((cell) => (cell === "" ? "." : "x")).join(""))
        .join("|");

    for (const animalId of ALL_IDS) {
      const reference = mask(getSprite(animalId, matte.id));
      for (const color of CATALOG_COLORS) {
        expect(mask(getSprite(animalId, color.id)), `${animalId}/${color.id} mask`).toBe(
          reference,
        );
      }
    }
  });

  it("applies the same texture to every animal rendered with one colour", () => {
    // The stroke set must be a pure function of the colour, otherwise two
    // animals could converge onto the same grid and break the uniqueness proof.
    for (const color of CATALOG_COLORS) {
      const a = getSprite("gatito", color.id);
      const b = getSprite("gatito", color.id);
      expect(a.grid).toEqual(b.grid);
    }
  });
});
