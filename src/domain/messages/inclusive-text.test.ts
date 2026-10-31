import { describe, expect, it } from "vitest";

import {
  DEFAULT_INCLUSIVE_MODE,
  INCLUSIVE_MODES,
  articleFor,
  formatInclusive,
  isInclusiveMode,
  pronounFor,
} from "./inclusive-text";

describe("formatInclusive", () => {
  it("renders the four curated modes for dictionary words", () => {
    const template = "Bienvenid{o}, quedate tranquil{o}";

    expect(formatInclusive(template, "femenino")).toBe("Bienvenida, quedate tranquila");
    expect(formatInclusive(template, "masculino")).toBe("Bienvenido, quedate tranquilo");
    expect(formatInclusive(template, "neutro_e")).toBe("Bienvenide, quedate tranquile");
    expect(formatInclusive(template, "neutro_universal")).toBe(
      "Bienvenidx, quedate tranquilx",
    );
  });

  it("supports inline four-form tokens", () => {
    const template = "Eres lind{a|o|e|x} y tienes {una|un|une|unx} buen match";

    expect(formatInclusive(template, "femenino")).toBe("Eres linda y tienes una buen match");
    expect(formatInclusive(template, "masculino")).toBe("Eres lindo y tienes un buen match");
    expect(formatInclusive(template, "neutro_e")).toBe("Eres linde y tienes une buen match");
    expect(formatInclusive(template, "neutro_universal")).toBe(
      "Eres lindx y tienes unx buen match",
    );
  });

  it("falls back progressively for shorter inline alternatives", () => {
    expect(formatInclusive("amig{a|o}", "femenino")).toBe("amiga");
    expect(formatInclusive("amig{a|o}", "neutro_e")).toBe("amigo");
    expect(formatInclusive("amig{a|o}", "neutro_universal")).toBe("amigo");
  });

  it("lets explicit values win over the dictionary and preserves unknown tokens", () => {
    const rendered = formatInclusive(
      "Bienvenid{o}, {alias}. {token_desconocido}",
      "neutro_e",
      { alias: "ajolotito rosa" },
    );

    expect(rendered).toBe("Bienvenide, ajolotito rosa. {token_desconocido}");
  });

  it("is deterministic and defaults to the universal mode", () => {
    const once = formatInclusive("Bienvenid{o}");
    expect(once).toBe(formatInclusive("Bienvenid{o}", DEFAULT_INCLUSIVE_MODE));
    expect(formatInclusive("Bienvenid{o}")).toBe(formatInclusive("Bienvenid{o}"));
  });
});

describe("mode metadata", () => {
  it("exposes exactly the four requested modes", () => {
    expect(INCLUSIVE_MODES.map((mode) => mode.id)).toEqual([
      "femenino",
      "masculino",
      "neutro_e",
      "neutro_universal",
    ]);
  });

  it("returns a pronoun and an article for every mode", () => {
    for (const mode of INCLUSIVE_MODES) {
      expect(pronounFor(mode.id).length).toBeGreaterThan(0);
      expect(articleFor(mode.id).length).toBeGreaterThan(0);
    }
  });

  it("validates mode values", () => {
    expect(isInclusiveMode("neutro_e")).toBe(true);
    expect(isInclusiveMode("otro")).toBe(false);
    expect(isInclusiveMode(null)).toBe(false);
  });
});
