import { describe, expect, it } from "vitest";

import rawMatching from "../../data/matching-config.json";
import rawQuiz from "../../data/microtest.json";
import {
  CATALOG,
  CATALOG_ANIMALS,
  ENNEAGRAM_DATA,
  LIKERT_SCALE,
  MATCHING_CONFIG,
  QUIZ_ITEMS,
} from "./index";
import { deepFreeze, loadConfig } from "./load";
import { matchingConfigSchema } from "./matching";
import { quizSchema } from "./quiz";

function clone<T>(value: T): T {
  return structuredClone(value);
}

describe("config loading", () => {
  it("validates every bundled data file", () => {
    expect(QUIZ_ITEMS.length).toBeGreaterThan(0);
    expect(LIKERT_SCALE).toHaveLength(5);
    expect(CATALOG_ANIMALS.length).toBe(CATALOG.metadatos.total_animales);
    expect(Object.keys(MATCHING_CONFIG.tracks.romance.core).length).toBeGreaterThan(0);
    expect(ENNEAGRAM_DATA).toBeDefined();
  });

  it("freezes loaded objects deeply", () => {
    expect(Object.isFrozen(MATCHING_CONFIG)).toBe(true);
    expect(Object.isFrozen(MATCHING_CONFIG.tracks.romance.core)).toBe(true);
    expect(Object.isFrozen(QUIZ_ITEMS)).toBe(true);
    expect(Object.isFrozen(CATALOG_ANIMALS[0])).toBe(true);
  });

  it("rejects core weights that do not sum to 1", () => {
    const bad = clone(rawMatching);
    bad.tracks.romance.core.personalidad += 0.1;
    expect(() => loadConfig("matching-config", matchingConfigSchema, bad)).toThrow(/must sum to 1/);
  });

  it("rejects identity-layer weights above their cap", () => {
    const bad = clone(rawMatching);
    bad.tracks.romance.tail.mbti = 0.05;
    expect(() => loadConfig("matching-config", matchingConfigSchema, bad)).toThrow(/mbti\+eneagrama/);
  });

  it("rejects a floor on a tail category (extras are never dealbreakers)", () => {
    const bad = clone(rawMatching);
    (bad.tracks.romance.floors as Record<string, number>).apego = 0.3;
    expect(() => loadConfig("matching-config", matchingConfigSchema, bad)).toThrow(/floor on non-core apego/);
  });

  it("requires provenance labels on every annotated constant", () => {
    const bad = clone(rawMatching);
    (bad.group.beta as { etiqueta: string }).etiqueta = "porque_si";
    expect(() => loadConfig("matching-config", matchingConfigSchema, bad)).toThrow();
  });

  it("rejects duplicate quiz item ids", () => {
    const bad = clone(rawQuiz);
    const first = bad.items[0];
    if (first === undefined) throw new Error("fixture has no items");
    bad.items.push(clone(first));
    expect(() => loadConfig("microtest", quizSchema, bad)).toThrow(/duplicate item/);
  });

  it("names the failing file in the error", () => {
    expect(() => loadConfig("matching-config", matchingConfigSchema, {})).toThrow(
      /data\/matching-config\.json/,
    );
  });

  it("deepFreeze returns the same reference", () => {
    const value = { nested: { list: [1, 2] } };
    expect(deepFreeze(value)).toBe(value);
    expect(Object.isFrozen(value.nested.list)).toBe(true);
  });
});
