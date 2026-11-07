/**
 * Tests for the ánimo catalog schema validation. Ensures the catalog meets all
 * constraints: message count, text length, forbidden words, context distribution.
 */
import { describe, expect, it } from "vitest";

import { ANIMO_CATALOG, animoCatalogSchema } from "./animo";

describe("animo catalog schema", () => {
  it("validates the catalog structure", () => {
    expect(() => animoCatalogSchema.parse(ANIMO_CATALOG)).not.toThrow();
  });

  it("has between 150 and 200 messages", () => {
    expect(ANIMO_CATALOG.mensajes.length).toBeGreaterThanOrEqual(150);
    expect(ANIMO_CATALOG.mensajes.length).toBeLessThanOrEqual(200);
  });

  it("has no messages over 120 characters", () => {
    const long = ANIMO_CATALOG.mensajes.filter((m) => m.texto.length > 120);
    expect(long).toEqual([]);
  });

  it("has no duplicate IDs", () => {
    const ids = ANIMO_CATALOG.mensajes.map((m) => m.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("has at least 6 variants per non-generic context", () => {
    const counts = new Map<string, number>();
    for (const msg of ANIMO_CATALOG.mensajes) {
      counts.set(msg.contexto, (counts.get(msg.contexto) ?? 0) + 1);
    }
    for (const [context, count] of counts) {
      if (context !== "generico") {
        expect(count).toBeGreaterThanOrEqual(6);
      }
    }
  });

  it("has no forbidden words in messages", () => {
    const FORBIDDEN = [
      "te extrañamos",
      "debes",
      "tienes que",
      "por qué no",
      "deberías",
      "nunca",
      "siempre",
      "obligación",
      "problema",
      "triste",
      "solo",
      "sola",
      "soledad",
    ];
    for (const msg of ANIMO_CATALOG.mensajes) {
      const lower = msg.texto.toLowerCase();
      for (const word of FORBIDDEN) {
        expect(lower).not.toContain(word);
      }
    }
  });

  it("has valid seasonal date ranges", () => {
    for (const msg of ANIMO_CATALOG.mensajes) {
      if (msg.estacional) {
        expect(msg.estacional.inicio).toMatch(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
        expect(msg.estacional.fin).toMatch(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
      }
    }
  });

  it("has valid placeholders", () => {
    for (const msg of ANIMO_CATALOG.mensajes) {
      expect(msg.placeholders.length).toBeLessThanOrEqual(5);
      for (const ph of msg.placeholders) {
        expect(ph.length).toBeLessThanOrEqual(20);
      }
    }
  });
});
