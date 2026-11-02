import { describe, expect, it } from "vitest";

import { EXPERIENCE, QUIZ_ITEMS, QUIZ_MODULES } from "@/config";
import { completedModules, moduleProgress } from "@/domain/psychometrics/modules";
import type { QuizModuleId } from "@/types/microtest";

import { draftKey, isModuleId, moduleItems, moduleMenu, parseModuleDraft, refinePayload, suggestionFor } from "./refine-flow";

const OPTIONAL = QUIZ_MODULES.map((m) => m.id);

describe("refine flow", () => {
  it("suggests interests first for friendship (ADR-020) and walks the configured order", () => {
    expect(suggestionFor("amistad", [])).toBe("intereses");
    expect(suggestionFor("amistad", ["intereses"])).toBe(EXPERIENCE.refine.order.amistad[1]);
    expect(suggestionFor("romance", OPTIONAL)).toBeNull();
  });

  it("lists every optional module once, flagging the completed ones", () => {
    const menu = moduleMenu("romance", ["valores"]);
    expect(menu.map((m) => m.id).sort()).toEqual([...OPTIONAL].sort());
    expect(menu.find((m) => m.id === "valores")?.done).toBe(true);
    expect(menu.every((m) => m.items > 0)).toBe(true);
  });

  it("only accepts optional module ids", () => {
    expect(isModuleId("intereses")).toBe(true);
    expect(isModuleId("nucleo")).toBe(false);
    expect(isModuleId("x")).toBe(false);
    expect(isModuleId(null)).toBe(false);
  });

  it("restores a draft keeping only the module's own items and sends only them", () => {
    const items = moduleItems("intereses");
    const foreign = QUIZ_ITEMS.find((i) => i.modulo === "nucleo")!.id;
    const raw = JSON.stringify({ likert: { [items[0]!.id]: 4, [foreign]: 2 }, skipped: [foreign] });
    const draft = parseModuleDraft(raw, items);
    expect(draft.likert).toEqual({ [items[0]!.id]: 4 });
    expect(draft.skipped).toEqual([]);
    expect(refinePayload("intereses", items, draft)).toEqual({ module: "intereses", likert: [{ itemId: items[0]!.id, value: 4 }] });
    expect(draftKey("intereses")).not.toBe(draftKey("valores"));
  });
});

describe("module progress", () => {
  it("marks a module complete when every non-sensitive item is answered", () => {
    const target: QuizModuleId = "relacional";
    const own = QUIZ_ITEMS.filter((i) => i.modulo === target && i.tipo_respuesta === "likert_5");
    const required = own.filter((i) => !i.banderas.includes("SENS")).map((i) => i.id);
    expect(required.length).toBeLessThan(own.length);
    expect(completedModules(QUIZ_ITEMS, [target], new Set(required))).toEqual([target]);
    expect(completedModules(QUIZ_ITEMS, [target], new Set(required.slice(1)))).toEqual([]);
    const [progress] = moduleProgress(QUIZ_ITEMS, [target], new Set(required));
    expect(progress).toMatchObject({ answered: required.length, total: own.length, complete: true });
  });

  it("never marks an unanswered module complete, even one made only of sensitive items", () => {
    expect(completedModules(QUIZ_ITEMS, OPTIONAL, new Set())).toEqual([]);
    const sensitiveOnly = OPTIONAL.find((id) =>
      QUIZ_ITEMS.filter((i) => i.modulo === id && i.tipo_respuesta === "likert_5").every((i) => i.banderas.includes("SENS")),
    );
    if (!sensitiveOnly) return;
    const first = QUIZ_ITEMS.find((i) => i.modulo === sensitiveOnly)!.id;
    expect(completedModules(QUIZ_ITEMS, [sensitiveOnly], new Set([first]))).toEqual([sensitiveOnly]);
  });
});
