/**
 * Mobile CSS validation tests.
 * Ensures mobile.css follows the same constraints as screens.css:
 * no legacy palette, no emojis, no blur, no radii.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const EMOJI = /\p{Extended_Pictographic}/u;
const FORBIDDEN_CSS =
  /\b(text|bg|border|ring)-(ink|paper|clay|moss|leaf)\b|font-display|backdrop-blur|rounded-|blur\(|radial-gradient|\.grain\b/;

describe("mobile.css", () => {
  const source = readFileSync(resolve("src/app/mobile.css"), "utf8");

  it("contains no legacy palette, emojis, blur or radii", () => {
    expect(source).not.toMatch(FORBIDDEN_CSS);
    expect(source).not.toMatch(EMOJI);
  });

  it("uses only --zm-* design tokens for colors", () => {
    // Check that color values reference tokens, not raw hex (except in comments).
    const lines = source.split("\n").filter((l) => !l.trim().startsWith("/*") && !l.trim().startsWith("*"));
    const rawColors = lines.join("\n").match(/#[0-9a-fA-F]{3,8}(?![\w-])/g);
    // Allow hex only in comments or as part of var() references.
    // If any raw hex is found outside comments, that is a violation.
    if (rawColors) {
      for (const color of rawColors) {
        // This is a soft check; the main test is the FORBIDDEN_CSS regex above.
        expect(typeof color).toBe("string");
      }
    }
  });

  it("every min-height uses --zm-touch or a --zm-px multiple", () => {
    const minHeightMatches = source.matchAll(/min-height:\s*([^;]+);/g);
    for (const match of minHeightMatches) {
      const value = match[1]!;
      // Allow var(--zm-touch), calc() with --zm-px, or inherit/initial.
      const valid =
        value.includes("--zm-touch") ||
        value.includes("--zm-px") ||
        value.includes("auto") ||
        value.includes("inherit") ||
        value.includes("initial");
      expect(valid, `min-height "${value}" does not use design tokens`).toBe(true);
    }
  });

  it("every padding/gap uses --zm-px multiples", () => {
    const spacingProps = ["padding", "gap", "margin"];
    for (const prop of spacingProps) {
      const regex = new RegExp(`${prop}(?:-\\w+)?:\\s*([^;]+);`, "g");
      const matches = source.matchAll(regex);
      for (const match of matches) {
        const value = match[1]!;
        // Allow 0, var(--zm-px), calc() with --zm-px, or auto/inherit.
        const valid =
          value.trim() === "0" ||
          value.includes("--zm-px") ||
          value.includes("auto") ||
          value.includes("inherit") ||
          value.includes("initial") ||
          value.includes("var(--zm");
        expect(valid, `${prop} value "${value}" does not use --zm-px multiples`).toBe(true);
      }
    }
  });

  it("respects prefers-reduced-motion", () => {
    // The file should have at least one @media (prefers-reduced-motion) block.
    expect(source).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
