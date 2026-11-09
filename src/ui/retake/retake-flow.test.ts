/**
 * Reglas de pantalla de la re-toma (B9.2, ADR-054). Se prueban en Node porque
 * aquí vive lo que no debe fallar en un navegador: qué entra al envío, qué se
 * conserva del borrador y qué se le dice a quien no tiene preguntas pendientes.
 */
import { describe, expect, it } from "vitest";

import { EXPERIENCE } from "@/config";
import type { RetakeViewDto } from "@/contracts/retake";
import { INCLUSIVE_X } from "@/testing/copy-guard";

import { buildSubmission, isAnswered, resumeIndex } from "../quiz/quiz-flow";
import {
  RETAKE_COPY,
  RETAKE_DRAFT_KEY,
  filterOptions,
  introOf,
  isPlan,
  parseRetakeDraft,
  parseRetakeView,
  questionsOf,
  statusFor,
} from "./retake-flow";

type PlanView = Extract<RetakeViewDto, { status: "plan" }>;

const likert = (id: string, sensible: boolean) => ({ id, texto: `Enunciado de ${id}`, tipo: "likert" as const, opciones: null, sensible });
const filtro = (id: string, opciones: string[]) => ({ id, texto: `Enunciado de ${id}`, tipo: "filtro" as const, opciones, sensible: false });

const PLAN: PlanView = {
  status: "plan",
  level: "T2",
  total: 8,
  retired: 0,
  blocks: [
    { factor: "afecto_tiempo", items: [likert("LAM2", false)] },
    { factor: "apego_ansiedad", items: [likert("APE1", true), likert("APE2", true)] },
    { factor: "filtro", items: [filtro("FIL1", ["mujeres", "prefiero no decir"]), filtro("FIL2", ["no binarie", "prefiero no decir"])] },
    { factor: "meta_crianza", items: [likert("VAL6", true), likert("VAL13", true)] },
  ],
};

describe("questionsOf", () => {
  const questions = questionsOf(PLAN);

  it("aplanaba los bloques en orden, sin inventarse títulos", () => {
    expect(questions.map((q) => q.id)).toEqual(["LAM2", "APE1", "APE2", "FIL1", "FIL2", "VAL6", "VAL13"]);
    expect(questions.every((q) => q.texto.startsWith("Enunciado de"))).toBe(true);
  });

  it("traduce el tipo del contrato al control que ya conoce el test", () => {
    expect(questions.find((q) => q.id === "APE1")).toMatchObject({ tipo_respuesta: "likert_5", skippable: true });
    expect(questions.find((q) => q.id === "FIL1")).toMatchObject({ tipo_respuesta: "seleccion_multiple", skippable: false });
  });

  it("las reglas compartidas del quiz responden por aquí", () => {
    const answered = { likert: { LAM2: 3 } as const, filters: { FIL1: ["mujeres"] }, skipped: [] };
    expect(isAnswered(questions[0]!, answered)).toBe(true);
    expect(isAnswered(questions[3]!, answered)).toBe(true);
    expect(isAnswered(questions[1]!, answered)).toBe(false);
    // Sensible y saltada cuenta como contestada: no se le puede obligar a declarar.
    expect(isAnswered(questions[1]!, { ...answered, skipped: ["APE1"] })).toBe(true);
    expect(resumeIndex(questions, answered)).toBe(1);
  });
});

describe("el envío", () => {
  it("separa Likert y filtros, y omite lo que se prefirió no decir", () => {
    const questions = questionsOf(PLAN);
    const draft = {
      likert: { LAM2: 4, APE1: 2, VAL6: 5 } as Record<string, 1 | 2 | 3 | 4 | 5>,
      filters: { FIL1: ["mujeres"], FIL2: ["no binarie"] } as Record<string, string[]>,
      skipped: ["APE2", "VAL13"],
    };
    const payload = buildSubmission(questions, draft);
    expect(payload).not.toBeNull();
    expect(payload!.likert.map((a) => a.itemId).sort()).toEqual(["APE1", "LAM2", "VAL6"]);
    expect(payload!.filters.map((a) => a.itemId).sort()).toEqual(["FIL1", "FIL2"]);
    expect(payload!.filters[0]!.selected.length).toBeGreaterThan(0);
  });

  it("no deja salir un envío incompleto", () => {
    const questions = questionsOf(PLAN);
    expect(buildSubmission(questions, { likert: { LAM2: 4 }, filters: {}, skipped: [] })).toBeNull();
  });
});

describe("parseRetakeDraft", () => {
  it("solo devuelve las preguntas de este plan", () => {
    const raw = JSON.stringify({
      likert: { LAM2: 5, OTRO: 1 },
      filters: { FIL1: ["mujeres"], VACIO: [], FIL2: [] },
      skipped: ["APE1", "FANTASMA"],
    });
    const draft = parseRetakeDraft(raw, questionsOf(PLAN));
    expect(draft.likert).toEqual({ LAM2: 5 });
    expect(draft.filters).toEqual({ FIL1: ["mujeres"] });
    expect(draft.skipped).toEqual(["APE1"]);
  });

  it("un borrador corrupto vuelve vacío, no rompe la pantalla", () => {
    for (const raw of [null, "", "{", "[]", '{"likert":3}']) {
      expect(parseRetakeDraft(raw, questionsOf(PLAN))).toEqual({ likert: {}, filters: {}, skipped: [] });
    }
  });
});

describe("RETAKE_DRAFT_KEY", () => {
  it("vive bajo el prefijo que el cambio de persona borra (ADR-023)", () => {
    expect(RETAKE_DRAFT_KEY.startsWith(`${EXPERIENCE.refine.draftKey}:`)).toBe(true);
    expect(RETAKE_DRAFT_KEY).not.toBe(`${EXPERIENCE.refine.draftKey}:valores`);
  });
});

describe("introOf", () => {
  it("explica por qué vuelve la pregunta, y nada más", () => {
    const text = introOf(PLAN);
    expect(text).toContain(RETAKE_COPY.body);
    expect(text).toContain("Prefiero no decir");
    expect(text).not.toContain("retiramos");
  });

  it("suma los ítems retirados solo cuando existen", () => {
    expect(introOf({ ...PLAN, retired: 2 })).toContain("retiramos 2 preguntas");
    expect(introOf({ ...PLAN, retired: 1 })).toContain("retiramos 1 pregunta");
  });

  it("calla la nota de intimidad si el plan no pregunta nada privado", () => {
    const limpio: PlanView = { ...PLAN, blocks: [{ factor: "afecto_tiempo", items: [likert("LAM2", false)] }], total: 1 };
    expect(introOf(limpio)).not.toContain("identidad");
  });
});

describe("filterOptions", () => {
  it("lee el id del banco pero muestra una etiqueta legible e inclusiva", () => {
    const question = questionsOf(PLAN).find((q) => q.id === "FIL2")!;
    const options = filterOptions(question);
    expect(options.map((o) => o.label)).toEqual(["No binarie", "Prefiero no decir"]);
    expect(options.find((o) => o.value === "prefiero no decir")?.icon).toBe("privacy");
  });
});

describe("statusFor", () => {
  it("cada estado sin plan tiene su motivo y una salida que existe", () => {
    const cases: Array<[RetakeViewDto, string]> = [
      [{ status: "current" }, "al día"],
      [{ status: "unstamped" }, "nada que repetir"],
      [{ status: "unknown" }, "Aún no hay"],
      [{ status: "capped", total: 29 }, "29"],
    ];
    for (const [view, needle] of cases) {
      const copy = statusFor(view as Exclude<RetakeViewDto, { status: "plan" }>);
      expect(copy.title.length).toBeGreaterThan(8);
      expect(`${copy.title} ${copy.body}`).toContain(needle);
      expect(copy.cta.length).toBeLessThan(30);
      expect(["/perfil", "/afinar"]).toContain(copy.href);
    }
  });

  it("ningún estado deja entender que la persona sale del pool", () => {
    for (const view of [{ status: "current" }, { status: "unstamped" }, { status: "unknown" }, { status: "capped", total: 29 }] as const) {
      const copy = statusFor(view);
      expect(copy.body).not.toMatch(/deja de buscar|no puedes|fuera del|eliminad/i);
      expect(copy.body).not.toMatch(INCLUSIVE_X);
    }
  });
});

describe("parseRetakeView", () => {
  it("reconoce lo que la app publica", () => {
    expect(parseRetakeView({ status: "current" })).toEqual({ status: "current" });
    expect(parseRetakeView({ status: "capped", total: 30 })).toEqual({ status: "capped", total: 30 });
    expect(parseRetakeView(PLAN)).toEqual(PLAN);
    expect(isPlan(parseRetakeView(PLAN) ?? { status: "unknown" })).toBe(true);
  });

  it("trata lo desconocido como un fallo de red, no como un plan vacío", () => {
    for (const value of [
      null,
      undefined,
      "plan",
      {},
      { status: "otra-cosa" },
      { status: "capped" },
      { status: "plan" },
      { ...PLAN, blocks: "LAM2" },
      { ...PLAN, blocks: [{ factor: "afecto_tiempo", items: [{ id: "LAM2" }] }] },
      { ...PLAN, retired: "0" },
    ]) {
      expect(parseRetakeView(value)).toBeNull();
    }
  });
});

describe("el texto de la pantalla", () => {
  it("es pronunciable, sin -x y sin promesas", () => {
    const texts = [
      RETAKE_COPY.title,
      RETAKE_COPY.body,
      RETAKE_COPY.sensitive,
      RETAKE_COPY.save,
      RETAKE_COPY.saving,
      RETAKE_COPY.pause,
      introOf(PLAN),
    ];
    for (const text of texts) {
      expect(text).not.toMatch(INCLUSIVE_X);
      expect(text).not.toMatch(/<3|😊|ahora sí|garantiz|vas a encontrar/i);
      expect(text.length).toBeLessThan(320);
    }
    expect(RETAKE_COPY.retired(3)).not.toMatch(INCLUSIVE_X);
  });

  it("no le escribe a la persona un género que el banco no preguntó", () => {
    // La re-toma habla de «quien responde», nunca de «él/ella»: el plan vigente
    // re-pregunta identidad y vínculo, donde cualquier supuesto duele.
    expect(introOf(PLAN)).not.toMatch(/\bel\b|\bella\b|\bsu pareja\(h/i);
  });
});
