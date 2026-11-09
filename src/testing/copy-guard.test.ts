/**
 * Copy surfaces that no other guard reads.
 *
 * The rest of the suite protects the screens it knows about; this file walks the
 * text that is generated in code or shipped as data — the archetype narrative,
 * the MBTI dynamics, the derived conversation starters, the quiz bank and the
 * constellation labels — so a sentence cannot be predictive just because it
 * lives somewhere a test never opened.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { CAUSAL_EFFECT, FORBIDDEN_COPY, INCLUSIVE_X, OUTCOME_CLAIMS, jsonStrings, stringLiterals } from "./copy-guard";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

/** Narrative the product writes about a person: a style, never a promise. */
const PRODUCT_SURFACES = [
  "src/domain/identity/profile-generator.ts",
  "src/domain/explainability/mbti-dynamics.ts",
  "src/domain/messages/notification-copy.ts",
  "src/domain/quiz/quizzes.ts",
  "src/ui/constellation/types.ts",
  "src/ui/result/result-view.tsx",
  "data/explanation-copy.json",
  "data/self-reading.json",
];

/**
 * What a person says about themself (bank items and their answer anchors). The
 * product is not speaking here, so the word list does not apply — "quiero
 * hacerlo todo perfecto" is measurement, not marketing. The outcome phrases
 * still do: no text the app shows may promise what a relationship will become.
 */
const PARTICIPANT_SURFACES = ["data/microtest.json", "data/arquetipos.json"];

function textsOf(path: string): string[] {
  return path.endsWith(".json")
    ? jsonStrings(JSON.parse(read(path)))
    : stringLiterals(read(path).replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, ""));
}

/** The quiz banks that ship, as far as the generator is concerned. */
const QUIZ_SURFACES = readdirSync(resolve(process.cwd(), "data/quizzes"))
  .filter((name) => name.endsWith(".json"))
  .map((name) => `data/quizzes/${name}`);

describe("copy guards cover every generated sentence", () => {
  it("finds the text of each source it claims to read", () => {
    for (const path of [...PRODUCT_SURFACES, ...PARTICIPANT_SURFACES])
      expect(textsOf(path).length, path).toBeGreaterThan(20);
  });

  it("keeps the forbidden words out of the copy the product writes", () => {
    for (const path of PRODUCT_SURFACES) {
      for (const text of textsOf(path)) expect(text, `${path}: ${text}`).not.toMatch(FORBIDDEN_COPY);
    }
  });

  it("writes the inclusive marker only where a person chose it", () => {
    const chosen = "src/domain/messages/inclusive-text.ts";
    const swept = [...PRODUCT_SURFACES, ...PARTICIPANT_SURFACES, ...QUIZ_SURFACES];

    expect(swept).not.toContain(chosen);
    for (const path of swept) {
      for (const text of textsOf(path)) expect(text, `${path}: ${text}`).not.toMatch(INCLUSIVE_X);
    }

    // The opt-in mode is the one place the marker is allowed to exist, so the
    // guarantee is that it is not the default anyone lands on.
    const dictionary = stringLiterals(read(chosen));
    expect(dictionary.some((word) => INCLUSIVE_X.test(word))).toBe(true);
  });

  it("promises no relational outcome anywhere a person can read", () => {
    for (const path of [...PRODUCT_SURFACES, ...PARTICIPANT_SURFACES]) {
      for (const text of textsOf(path)) expect(text, `${path}: ${text}`).not.toMatch(OUTCOME_CLAIMS);
    }
  });

  it("describes a style instead of causing a feeling, in the rendered narrative", () => {
    for (const path of PRODUCT_SURFACES.filter((p) => p.startsWith("src/domain/identity"))) {
      for (const text of textsOf(path)) expect(text, `${path}: ${text}`).not.toMatch(CAUSAL_EFFECT);
    }
    const animals = JSON.parse(read("data/arquetipos.json")).animales as Array<{
      plantillas_narrativas?: { cuidado?: string };
    }>;
    for (const animal of animals) {
      const cuidado = animal.plantillas_narrativas?.cuidado;
      if (cuidado) expect(cuidado, `arquetipos cuidado: ${cuidado}`).not.toMatch(CAUSAL_EFFECT);
    }
  });

  it("reads the quiz banks that ship", () => {
    expect(QUIZ_SURFACES.length).toBeGreaterThan(0);
    for (const path of QUIZ_SURFACES) {
      for (const text of textsOf(path)) {
        expect(text, `${path}: ${text}`).not.toMatch(OUTCOME_CLAIMS);
      }
    }
  });
});
