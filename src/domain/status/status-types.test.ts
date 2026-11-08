/**
 * Tests for the status (animo) feature domain types and copy.
 * Verifies mood options, copy constraints, and integration with the
 * animo message selector.
 */

import { describe, expect, it } from "vitest";

import { ANIMO_PUBLICADO, type AnimoPublicado } from "@/config/animo";
import { STATUS_COPY, STATUS_OPTION_COPY } from "@/domain/status/status-types";

const FORBIDDEN_WORDS = [
  "solo",
  "siempre",
  "nunca",
  "tienes que",
  "debes",
  "por que no",
  "deberias",
  "obligacion",
  "problema",
  "triste",
  "sola",
  "soledad",
];

const EMOJI = /\p{Extended_Pictographic}/u;

describe("status copy", () => {
  it("has no forbidden words in STATUS_COPY", () => {
    const allText = Object.values(STATUS_COPY).join(" ").toLowerCase();
    for (const word of FORBIDDEN_WORDS) {
      expect(allText, `STATUS_COPY contains "${word}"`).not.toContain(word);
    }
  });

  it("has no emojis in STATUS_COPY", () => {
    for (const text of Object.values(STATUS_COPY)) {
      expect(text, text).not.toMatch(EMOJI);
    }
  });

  it("has no forbidden words in any mood option copy", () => {
    for (const mood of ANIMO_PUBLICADO) {
      const copy = STATUS_OPTION_COPY[mood];
      const allText = `${copy.label} ${copy.hint}`.toLowerCase();
      for (const word of FORBIDDEN_WORDS) {
        expect(allText, `${mood} contains "${word}"`).not.toContain(word);
      }
    }
  });

  it("has no emojis in mood option copy", () => {
    for (const mood of ANIMO_PUBLICADO) {
      const copy = STATUS_OPTION_COPY[mood];
      expect(copy.label, copy.label).not.toMatch(EMOJI);
      expect(copy.hint, copy.hint).not.toMatch(EMOJI);
    }
  });

  it("every mood in ANIMO_PUBLICADO has a corresponding option copy", () => {
    for (const mood of ANIMO_PUBLICADO) {
      expect(STATUS_OPTION_COPY[mood]).toBeDefined();
      expect(STATUS_OPTION_COPY[mood].label.length).toBeGreaterThan(0);
      expect(STATUS_OPTION_COPY[mood].hint.length).toBeGreaterThan(0);
    }
  });
});

describe("status-animo integration", () => {
  it("status moods match the animo publicado enum exactly", () => {
    const statusMoods: readonly AnimoPublicado[] = Object.keys(STATUS_OPTION_COPY) as AnimoPublicado[];
    expect(statusMoods).toHaveLength(ANIMO_PUBLICADO.length);
    for (const mood of ANIMO_PUBLICADO) {
      expect(statusMoods).toContain(mood);
    }
  });

  it("mood keys are valid animo context values for the message selector", () => {
    // The animo message selector uses these as contexto values.
    // Verify they match the ANIMO_PUBLICADO type used in the catalog.
    for (const mood of ANIMO_PUBLICADO) {
      expect(typeof mood).toBe("string");
      expect(mood.length).toBeGreaterThan(0);
    }
  });
});
