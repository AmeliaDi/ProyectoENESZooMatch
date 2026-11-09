/**
 * Reglas de la re-toma mínima (B9.2, ADR-054). El registro es un duplicado del
 * plan publicado 2.2.0 → 2.3.0, porque lo que se prueba aquí es la *lectura* del
 * plan: qué se pregunta, qué se conserva y qué se retira. Que el archivo publicado
 * diga exactamente esto lo vigila `src/config/retake-plans.test.ts`.
 */
import { describe, expect, it } from "vitest";

import { CORE_ITEMS, MATCHING_CONFIG, QUIZ_ITEMS } from "@/config";
import { PSYCHOMETRIC_PARAMS } from "@/config/psychometric-params";
import type { RetakeViewDto } from "@/contracts/retake";
import { buildMeasurementModel, scoreLatent } from "@/domain/psychometrics/latent";
import type { RetakeRegistry, ShippedRetakePlan } from "@/domain/psychometrics/retake-registry";
import type { Result } from "@/domain/shared";
import type { LikertValue, QuizSubmission } from "@/types/microtest";

import { mergeRetake, pendingOf, retakePlanOf, retakeProfile, retakeView, type RetakeAnswers, type RetakeDeps } from "./retake-profile";
import { refineProfile } from "./refine-profile";
import { submitQuiz } from "./submit-quiz";
import { MemoryStore, instantScheduler, memoryMatches, memoryNotifications, memoryProfiles } from "./testing/in-memory";
import type { AppError } from "./errors";
import type { StoredAnswer } from "./ports";

const MODEL = buildMeasurementModel(PSYCHOMETRIC_PARAMS);
const USER = "00000000-0000-4000-8000-00000000000a";
const SECRET = "zm-test-secret";
const BANK = "2.3.0";
const ORIGIN = "2.2.0";

/** `params_version` legible: `modelo+banco+firma de 12 hex`. */
const seal = (bank: string): string => `${PSYCHOMETRIC_PARAMS.version}+${bank}+abcdef012345`;

const PLAN: ShippedRetakePlan = {
  from: ORIGIN,
  to: BANK,
  level: "T2",
  blocks: [
    { factor: "afecto_tiempo", items: ["LAM2"] },
    { factor: "apego_ansiedad", items: ["APE1", "APE2"] },
    { factor: "filtro", items: ["FIL1", "FIL2", "FIL3"] },
    { factor: "meta_crianza", items: ["VAL6", "VAL13"] },
  ],
  reask: ["VAL6", "FIL1", "VAL13", "FIL2", "FIL3", "APE1", "APE2", "LAM2"],
  retired: [],
  reasons: ["0 ítems nuevos, 6 reescritos, 0 retirados"],
  overCap: false,
};

const REGISTRY: RetakeRegistry = {
  version: "retake-plans-1",
  plans: [PLAN, { ...PLAN, from: "2.1.0", to: BANK, reask: PLAN.reask.slice(0, 4), overCap: true }],
};

const kindOf = new Map(QUIZ_ITEMS.map((item) => [item.id, item.tipo_respuesta]));
const likertIds = (ids: readonly string[]) => ids.filter((id) => kindOf.get(id) === "likert_5");
const filterIds = (ids: readonly string[]) => ids.filter((id) => kindOf.get(id) === "seleccion_multiple");
const coreItemOutside = (plan: ShippedRetakePlan): string =>
  CORE_ITEMS.find((i) => i.tipo_respuesta === "likert_5" && !plan.reask.includes(i.id))!.id;

/** Un envío completo del plan: los Likert con `value` y los filtros con su opción neutra. */
function answerPlan(value: LikertValue, omit: readonly string[] = []): RetakeAnswers {
  const skip = new Set(omit);
  return {
    likert: likertIds(PLAN.reask)
      .filter((id) => !skip.has(id))
      .map((itemId) => ({ itemId, value })),
    filters: filterIds(PLAN.reask)
      .filter((id) => !skip.has(id))
      .map((itemId) => ({ itemId, selected: ["prefiero no decir"] })),
  };
}

/** Estrecha la vista al caso con preguntas; si el estado es otro, el test lo ve explícito. */
function planOf(view: Result<RetakeViewDto, AppError>): Extract<RetakeViewDto, { status: "plan" }> {
  if (!view.ok) throw new Error(`retakeView devolvió el error «${view.error}»`);
  if (view.value.status !== "plan") throw new Error(`esperaba el estado «plan», recibí «${view.value.status}»`);
  return view.value;
}

function wire(store: MemoryStore): RetakeDeps {
  return {
    profiles: memoryProfiles(store),
    matches: memoryMatches(store),
    notifications: memoryNotifications(store),
    scheduler: instantScheduler,
    latentScorer: (responses) => scoreLatent(MODEL, responses, MATCHING_CONFIG.quality),
    secret: SECRET,
    plans: REGISTRY,
    bankVersion: BANK,
  };
}

const coreOnly = (value: LikertValue): QuizSubmission => ({
  likert: CORE_ITEMS.filter((i) => i.tipo_respuesta === "likert_5").map((i) => ({ itemId: i.id, value })),
  filters: CORE_ITEMS.filter((i) => i.tipo_respuesta === "seleccion_multiple").map((i) => ({
    itemId: i.id,
    selected: ["prefiero no decir"],
  })),
});

const relacional = (): { itemId: string; value: LikertValue }[] =>
  QUIZ_ITEMS.filter((i) => i.modulo === "relacional" && i.tipo_respuesta === "likert_5").map((i) => ({
    itemId: i.id,
    value: 4 as LikertValue,
  }));

/** Perfil con el núcleo y el módulo relacional contestados: las 8 preguntas del plan existen. */
async function stamped(store: MemoryStore, bank = ORIGIN) {
  const deps = wire(store);
  await submitQuiz({ userId: USER, submission: coreOnly(3) }, deps);
  await refineProfile({ userId: USER, module: "relacional", likert: relacional() }, deps);
  store.paramsVersions.set(USER, seal(bank));
  return deps;
}

describe("retakeView", () => {
  it("no invita a quien llegó antes del sello", async () => {
    const store = new MemoryStore();
    const deps = wire(store);
    await submitQuiz({ userId: USER, submission: coreOnly(3) }, deps);
    expect(await retakeView(deps, USER)).toEqual({ ok: true, value: { status: "unstamped" } });
  });

  it("no invita cuando el banco guardado ya es el vigente", async () => {
    const store = new MemoryStore();
    const deps = await stamped(store, BANK);
    expect(await retakeView(deps, USER)).toEqual({ ok: true, value: { status: "current" } });
  });

  it("no invita a un banco sin plan publicado", async () => {
    const store = new MemoryStore();
    const deps = await stamped(store, "2.0.0");
    expect(await retakeView(deps, USER)).toEqual({ ok: true, value: { status: "unknown" } });
  });

  it("explica el plan que pasa del presupuesto en lugar de ofrecerlo", async () => {
    const store = new MemoryStore();
    const deps = await stamped(store, "2.1.0");
    expect(await retakeView(deps, USER)).toEqual({ ok: true, value: { status: "capped", total: 4 } });
  });

  it("dice las preguntas reales, en el orden de los bloques", async () => {
    const store = new MemoryStore();
    const deps = await stamped(store);
    const plan = planOf(await retakeView(deps, USER));
    expect(plan.total).toBe(8);
    expect(plan.level).toBe("T2");
    expect(plan.blocks.map((b) => b.factor)).toEqual(["afecto_tiempo", "apego_ansiedad", "filtro", "meta_crianza"]);
    expect(plan.blocks.flatMap((b) => b.items.map((i) => i.id))).toEqual([
      "LAM2",
      "APE1",
      "APE2",
      "FIL1",
      "FIL2",
      "FIL3",
      "VAL6",
      "VAL13",
    ]);
  });

  it("no vuelve a preguntar lo que la persona nunca contestó", async () => {
    const store = new MemoryStore();
    const deps = await stamped(store);
    const record = store.results.get(USER)!;
    store.results.set(USER, { ...record, answers: record.answers.filter((a) => a.itemId !== "FIL2") });
    const plan = planOf(await retakeView(deps, USER));
    expect(plan.total).toBe(7);
    expect(plan.blocks.flatMap((b) => b.items.map((i) => i.id))).not.toContain("FIL2");
  });

  it("distingue el control de cada pregunta y quién puede saltarla", async () => {
    const store = new MemoryStore();
    const deps = await stamped(store);
    const items = new Map(planOf(await retakeView(deps, USER)).blocks.flatMap((b) => b.items.map((i) => [i.id, i])));
    // Un Likert sensible admite «Prefiero no decir»; un filtro ya la trae dentro.
    expect(items.get("APE1")).toMatchObject({ tipo: "likert", sensible: true, opciones: null });
    expect(items.get("LAM2")).toMatchObject({ tipo: "likert", sensible: false });
    expect(items.get("FIL1")).toMatchObject({ tipo: "filtro", sensible: false });
    expect(items.get("FIL1")!.opciones).toContain("personas no binarias");
    expect(items.get("FIL2")!.opciones).toContain("no binarie");
    // El enunciado llega escrito: la pantalla no arma frases con piezas.
    for (const item of items.values()) expect(item.texto.length).toBeGreaterThan(12);
  });
});

describe("retakePlanOf", () => {
  it("pasan el nivel y los retiros del plan, no una interpretación", () => {
    const stored: StoredAnswer[] = [
      { itemId: "APE1", value: 4 },
      { itemId: "VAL6", value: 2 },
      { itemId: "FIL1", selected: ["prefiero no decir"] },
    ];
    const view = retakePlanOf(stored, { ...PLAN, retired: ["VIEJO1", "VIEJO2"] });
    expect(view).toMatchObject({ status: "plan", level: "T2", total: 3, retired: 2 });
  });

  it("sin respuestas del plan no hay plan que mostrar", () => {
    expect(retakePlanOf([{ itemId: "HON1", value: 3 }], PLAN)).toEqual({ status: "current" });
  });

  it("un bloque desaparece entero si nadie contestó sus ítems", () => {
    const stored: StoredAnswer[] = [{ itemId: "LAM2", value: 4 }, { itemId: "APE1", value: 5 }];
    const view = retakePlanOf(stored, PLAN);
    if (view.status !== "plan") throw new Error("esperaba un plan con preguntas");
    expect(view.blocks.map((b) => b.factor)).toEqual(["afecto_tiempo", "apego_ansiedad"]);
  });
});

describe("pendingOf", () => {
  it("respeta el orden del plan y solo toma respuestas guardadas", () => {
    const stored: StoredAnswer[] = [{ itemId: "APE2", value: 4 }, { itemId: "VAL6", value: 2 }, { itemId: "XOTRO", value: 1 }];
    expect(pendingOf(PLAN, stored)).toEqual(["VAL6", "APE2"]);
  });
});

describe("mergeRetake", () => {
  const stored: StoredAnswer[] = [
    { itemId: "LAM2", value: 4 },
    { itemId: "APE1", value: 4 },
    { itemId: "FIL1", selected: ["prefiero no decir"] },
    { itemId: "HON1", value: 2 },
  ];
  const pending = ["LAM2", "APE1", "FIL1"];

  it("cubre las re-preguntadas y deja intactas las demás", () => {
    const merged = mergeRetake(
      stored,
      { likert: [{ itemId: "LAM2", value: 1 }, { itemId: "APE1", value: 5 }], filters: [{ itemId: "FIL1", selected: ["mujeres"] }] },
      pending,
    );
    expect(merged).not.toBeNull();
    expect(merged!.likert.map((a) => [a.itemId, a.value])).toEqual([
      ["HON1", 2],
      ["LAM2", 1],
      ["APE1", 5],
    ]);
    expect(merged!.filters).toEqual([{ itemId: "FIL1", selected: ["mujeres"] }]);
  });

  it("retira la respuesta sensible que se prefirió no volver a contestar", () => {
    const merged = mergeRetake(
      stored,
      { likert: [{ itemId: "LAM2", value: 3 }], filters: [{ itemId: "FIL1", selected: ["prefiero no decir"] }] },
      pending,
    );
    expect(merged!.likert.map((a) => a.itemId)).toEqual(["HON1", "LAM2"]);
  });

  it("rechaza un ítem que no está en el plan", () => {
    expect(mergeRetake(stored, { likert: [{ itemId: "HON1", value: 5 }], filters: [] }, pending)).toBeNull();
  });

  it("rechaza el mismo ítem dos veces", () => {
    expect(
      mergeRetake(stored, { likert: [{ itemId: "LAM2", value: 5 }, { itemId: "LAM2", value: 1 }], filters: [] }, pending),
    ).toBeNull();
  });

  it("no deja una familia a medias: lo no sensible se contesta o se rechaza", () => {
    expect(mergeRetake(stored, { likert: [{ itemId: "APE1", value: 5 }], filters: [] }, ["LAM2"])).toBeNull();
    expect(mergeRetake(stored, { likert: [{ itemId: "LAM2", value: 5 }], filters: [] }, ["LAM2"])?.likert).toHaveLength(3);
  });

  it("no mezcla controles: un Likert no responde un filtro ni al revés", () => {
    expect(mergeRetake(stored, { likert: [{ itemId: "FIL1", value: 3 }], filters: [] }, ["FIL1"])).toBeNull();
    expect(mergeRetake(stored, { likert: [], filters: [{ itemId: "LAM2", selected: ["monogamia"] }] }, ["LAM2"])).toBeNull();
  });
});

describe("retakeProfile", () => {
  it("sin plan no hay escritura posible", async () => {
    const store = new MemoryStore();
    const deps = wire(store);
    await submitQuiz({ userId: USER, submission: coreOnly(3) }, deps);
    expect(await retakeProfile({ userId: USER, ...answerPlan(5) }, deps)).toEqual({ ok: false, error: "quiz.retake_none" });
  });

  it("re-estima por la misma ruta del test y reemplaza solo lo del plan", async () => {
    const store = new MemoryStore();
    const deps = await stamped(store);
    const before = store.results.get(USER)!;
    const outside = coreItemOutside(PLAN);

    const result = await retakeProfile({ userId: USER, ...answerPlan(2) }, deps);
    expect(result.ok).toBe(true);
    const after = store.results.get(USER)!;
    const valueOf = (answers: readonly StoredAnswer[], id: string) => answers.find((a) => a.itemId === id)?.value;

    for (const id of likertIds(PLAN.reask)) expect(valueOf(after.answers, id)).toBe(2);
    expect(valueOf(after.answers, outside)).toBe(valueOf(before.answers, outside));
    expect(after.answers.filter((a) => a.selected).map((a) => a.itemId).sort()).toEqual(
      before.answers.filter((a) => a.selected).map((a) => a.itemId).sort(),
    );
    // Nadie sale del pool por re-tomar: la fila sigue viva y el recálculo corrió.
    expect(store.pool().some((p) => p.userId === USER)).toBe(true);
  });

  it("rechaza un envío que deja una pregunta obligatoria del plan sin cubrir", async () => {
    const store = new MemoryStore();
    const deps = await stamped(store);
    const result = await retakeProfile({ userId: USER, ...answerPlan(4, ["FIL1"]) }, deps);
    expect(result).toEqual({ ok: false, error: "request.invalid" });
    expect(store.results.get(USER)!.answers.find((a) => a.itemId === "FIL1")?.selected).toEqual(["prefiero no decir"]);
  });

  it("un perfil cuyas respuestas no tocan el plan no recibe preguntas", async () => {
    const store = new MemoryStore();
    const deps = wire(store);
    await submitQuiz({ userId: USER, submission: coreOnly(3) }, deps);
    const record = store.results.get(USER)!;
    const touched = new Set(PLAN.reask);
    store.results.set(USER, { ...record, answers: record.answers.filter((a) => !touched.has(a.itemId)) });
    store.paramsVersions.set(USER, seal(ORIGIN));
    expect(await retakeView(deps, USER)).toEqual({ ok: true, value: { status: "current" } });
    expect(await retakeProfile({ userId: USER, ...answerPlan(5) }, deps)).toEqual({
      ok: false,
      error: "quiz.retake_none",
    });
  });
});
