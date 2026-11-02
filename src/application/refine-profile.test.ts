import { describe, expect, it } from "vitest";

import { CORE_ITEMS, MATCHING_CONFIG, QUIZ_ITEMS } from "@/config";
import { PSYCHOMETRIC_PARAMS } from "@/config/psychometric-params";
import { buildMeasurementModel, scoreLatent } from "@/domain/psychometrics/latent";
import type { LikertValue, QuizModuleId, QuizSubmission } from "@/types/microtest";

import { mergeModule, refineProfile, type RefineDeps } from "./refine-profile";
import { submitQuiz } from "./submit-quiz";
import { MemoryStore, instantScheduler, memoryMatches, memoryNotifications, memoryProfiles } from "./testing/in-memory";

const MODEL = buildMeasurementModel(PSYCHOMETRIC_PARAMS);
const USER = "00000000-0000-4000-8000-00000000000a";
const MODULE: QuizModuleId = "intereses";

const coreOnly = (value: LikertValue): QuizSubmission => ({
  likert: CORE_ITEMS.filter((i) => i.tipo_respuesta === "likert_5").map((i) => ({ itemId: i.id, value })),
  filters: CORE_ITEMS.filter((i) => i.tipo_respuesta === "seleccion_multiple").map((i) => ({ itemId: i.id, selected: ["prefiero no decir"] })),
});

const moduleAnswers = (module: QuizModuleId, value: LikertValue) =>
  QUIZ_ITEMS.filter((i) => i.modulo === module && i.tipo_respuesta === "likert_5").map((i) => ({ itemId: i.id, value }));

function wire(store: MemoryStore): RefineDeps {
  return {
    profiles: memoryProfiles(store),
    matches: memoryMatches(store),
    notifications: memoryNotifications(store),
    scheduler: instantScheduler,
    latentScorer: (responses) => scoreLatent(MODEL, responses, MATCHING_CONFIG.quality),
  };
}

describe("refineProfile", () => {
  it("needs a completed core first", async () => {
    const result = await refineProfile({ userId: USER, module: MODULE, likert: moduleAnswers(MODULE, 4) }, wire(new MemoryStore()));
    expect(result).toEqual({ ok: false, error: "quiz.not_completed" });
  });

  it("merges the module with stored answers, keeps the core and filters, and narrows the posterior", async () => {
    const store = new MemoryStore();
    const deps = wire(store);
    await submitQuiz({ userId: USER, submission: coreOnly(3) }, deps);
    const before = store.results.get(USER)!;
    expect(before.completedModules).toEqual([]);

    const result = await refineProfile({ userId: USER, module: MODULE, likert: moduleAnswers(MODULE, 5) }, deps);
    expect(result.ok).toBe(true);
    const after = store.results.get(USER)!;
    expect(after.completedModules).toEqual([MODULE]);
    expect(after.answers.length).toBe(before.answers.length + moduleAnswers(MODULE, 5).length);
    expect(after.answers.filter((a) => a.selected)).toEqual(before.answers.filter((a) => a.selected));
    expect(after.scored.latent.se.int_cultura!).toBeLessThan(before.scored.latent.se.int_cultura!);
  });

  it("replaces previous answers of the same module instead of duplicating them", async () => {
    const store = new MemoryStore();
    const deps = wire(store);
    await submitQuiz({ userId: USER, submission: coreOnly(3) }, deps);
    await refineProfile({ userId: USER, module: MODULE, likert: moduleAnswers(MODULE, 5) }, deps);
    const once = store.results.get(USER)!.answers.length;
    await refineProfile({ userId: USER, module: MODULE, likert: moduleAnswers(MODULE, 1) }, deps);
    const answers = store.results.get(USER)!.answers;
    expect(answers).toHaveLength(once);
    expect(answers.find((a) => a.itemId === moduleAnswers(MODULE, 1)[0]!.itemId)?.value).toBe(1);
  });

  it("rejects items that belong to another module", () => {
    const foreign = moduleAnswers("valores", 3);
    expect(mergeModule([], { userId: USER, module: MODULE, likert: foreign })).toBeNull();
  });
});
