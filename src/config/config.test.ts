import { describe, expect, it } from "vitest";

import rawChat from "../../data/chat-config.json";
import rawMatching from "../../data/matching-config.json";
import rawQuiz from "../../data/microtest.json";
import rawRetention from "../../data/retention-config.json";
import { chatConfigSchema } from "./chat";
import {
  CATALOG,
  CATALOG_ANIMALS,
  ENNEAGRAM_DATA,
  LIKERT_SCALE,
  MATCHING_CONFIG,
  QUIZ_ITEMS,
  RETENTION_CONFIG,
  retentionConfigSchema,
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
    expect(RETENTION_CONFIG.abandoned_incomplete_days.valor).toBe(3);
  });

  it("rejects retention config when soft-delete grace window is shorter than abandonment window", () => {
    const bad = clone(rawRetention);
    bad.soft_delete_grace_days.valor = 1;
    bad.abandoned_incomplete_days.valor = 5;
    expect(() => loadConfig("retention-config", retentionConfigSchema, bad)).toThrow(
      /soft_delete_grace_days must be >= abandoned_incomplete_days/,
    );
  });

  it("lets the coincidence card be switched off in config, and only within the offer", () => {
    const off = clone(rawChat);
    off.conversation.rounds.coincidences = 0;
    expect(loadConfig("chat-config", chatConfigSchema, off).conversation.rounds.coincidences).toBe(0);

    const tooMany = clone(rawChat);
    tooMany.conversation.rounds.coincidences = tooMany.conversation.rounds.suggestions + 1;
    expect(() => loadConfig("chat-config", chatConfigSchema, tooMany)).toThrow(/coincidences must fit suggestions/);
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

  it("has no non-compensatory floor on any track (ADR-043)", () => {
    for (const [name, track] of Object.entries(MATCHING_CONFIG.tracks)) {
      expect(Object.keys(track.floors), `${name}: floors are vetoes on estimated latents`).toEqual([]);
    }
  });

  it("keeps enumerated sensitive factors out of every scored category (ADR-043)", () => {
    const sensitive = ["val_espiritualidad", "soc_politica", "act_igualdad"];
    for (const [id, category] of Object.entries(MATCHING_CONFIG.categories)) {
      for (const factor of sensitive) {
        expect(Object.keys(category.factors), `${id} scores ${factor}`).not.toContain(factor);
      }
    }
    const bad = clone(rawMatching);
    (bad.categories.estilo.factors as Record<string, number>).soc_politica = 1.0;
    expect(() => loadConfig("matching-config", matchingConfigSchema, bad)).toThrow(/enumerated sensitive/);
  });

  it("never floors a category whose factors are measured by a single item", () => {
    const itemsByFactor = new Map<string, number>();
    for (const item of QUIZ_ITEMS) {
      if (item.factor === undefined) continue;
      itemsByFactor.set(item.factor, (itemsByFactor.get(item.factor) ?? 0) + 1);
    }
    for (const [name, track] of Object.entries(MATCHING_CONFIG.tracks)) {
      for (const categoryId of Object.keys(track.floors) as (keyof typeof MATCHING_CONFIG.categories)[]) {
        for (const factor of Object.keys(MATCHING_CONFIG.categories[categoryId].factors)) {
          expect(itemsByFactor.get(factor) ?? 0, `${name}: floor on ${categoryId}/${factor} (1 item ⇒ veto on noise)`).toBeGreaterThanOrEqual(2);
        }
      }
    }
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
