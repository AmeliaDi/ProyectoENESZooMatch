import { describe, expect, it } from "vitest";

import { MICROTEST_ITEMS } from "@/domain/matching";
import { AVATAR_CONFIG } from "@/config";

import { coreRequiredItemIds, isCoreComplete, pendingCoreModules } from "./core-complete";

const REQUIRED = coreRequiredItemIds(MICROTEST_ITEMS);

describe("isCoreComplete", () => {
  it("reports incomplete when no answers exist", () => {
    const result = isCoreComplete(MICROTEST_ITEMS, new Set());
    expect(result.complete).toBe(false);
    expect(result.missingItemIds).toEqual(REQUIRED);
    expect(result.answeredRequired).toBe(0);
    expect(result.totalRequired).toBe(REQUIRED.length);
  });

  it("reports complete when every required item is answered", () => {
    const result = isCoreComplete(MICROTEST_ITEMS, new Set(REQUIRED));
    expect(result.complete).toBe(true);
    expect(result.missingItemIds).toEqual([]);
    expect(result.answeredRequired).toBe(REQUIRED.length);
  });

  it("ignores extra answers outside the required set", () => {
    const allIds = MICROTEST_ITEMS.map((i) => i.id);
    const result = isCoreComplete(MICROTEST_ITEMS, new Set(allIds));
    expect(result.complete).toBe(true);
    expect(result.totalRequired).toBe(REQUIRED.length);
  });

  it("returns exactly the missing ids when partially answered", () => {
    const half = REQUIRED.slice(0, Math.floor(REQUIRED.length / 2));
    const result = isCoreComplete(MICROTEST_ITEMS, new Set(half));
    expect(result.complete).toBe(false);
    expect(result.missingItemIds).toEqual(REQUIRED.slice(half.length));
    expect(result.answeredRequired).toBe(half.length);
  });

  it("excludes SENS items from the required set", () => {
    const sensIds = MICROTEST_ITEMS.filter((i) => i.banderas.includes("SENS")).map((i) => i.id);
    for (const id of sensIds) expect(REQUIRED).not.toContain(id);
  });

  it("excludes non-likert items (hard filters) from the required set", () => {
    const filterIds = MICROTEST_ITEMS.filter((i) => i.tipo_respuesta !== "likert_5").map((i) => i.id);
    for (const id of filterIds) expect(REQUIRED).not.toContain(id);
  });

  it("only includes items from hatch_required_modules", () => {
    const modules = new Set(AVATAR_CONFIG.identity.hatch_required_modules.valor);
    const requiredItems = MICROTEST_ITEMS.filter((i) => REQUIRED.includes(i.id));
    for (const item of requiredItems) expect(modules.has(item.modulo)).toBe(true);
  });

  it("returns false for an empty items array", () => {
    const result = isCoreComplete([], new Set(["a", "b"]));
    expect(result.complete).toBe(false);
    expect(result.totalRequired).toBe(0);
  });
});

describe("pendingCoreModules", () => {
  it("returns all modules when nothing is answered", () => {
    const pending = pendingCoreModules(MICROTEST_ITEMS, new Set());
    expect(pending.length).toBeGreaterThan(0);
  });

  it("returns empty when everything is answered", () => {
    const allIds = new Set(MICROTEST_ITEMS.map((i) => i.id));
    expect(pendingCoreModules(MICROTEST_ITEMS, allIds)).toEqual([]);
  });
});