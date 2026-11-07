/**
 * Tests for the ánimo message selection logic. Verifies determinism, priority,
 * history filtering, and context matching.
 */
import { describe, expect, it } from "vitest";

import type { AnimoContext, AnimoHistory } from "./animo-context";
import { pickAnimoMessage, updateHistory, type AnimoCatalog, type AnimoMessage } from "./pick-animo-message";

const IDENTITY = {
  estadoIdentidad: "eclosionado" as const,
  aliasCompleto: "zorrito rojo carmín · KMPQ",
  aliasAnimal: "zorrito rojo",
  aliasColor: "carmín",
  aliasSufijo: "KMPQ",
  animalId: "zorrito_rojo",
  colorId: "carmin",
  colorHex: "#C04040",
  mbtiCode: "INFP",
  enneagramCode: "4w5",
  enneagramName: "El Individualista",
  mark: null,
  revelacionVista: true,
  huevitoSeed: null,
};

function msg(id: string, categoria: AnimoMessage["categoria"], contexto: string, estacional: AnimoMessage["estacional"] = null): AnimoMessage {
  return {
    id,
    categoria,
    contexto,
    texto: `Mensaje ${id}`,
    placeholders: [],
    intensidad: "suave",
    estacional,
  };
}

function catalog(messages: AnimoMessage[]): AnimoCatalog {
  return { version: "1.0", mensajes: messages };
}

function context(over: Partial<AnimoContext> = {}): AnimoContext {
  return {
    identity: IDENTITY,
    momento: "tarde",
    fecha: "2026-11-07",
    social: { kind: "none" },
    animo: null,
    estacional: null,
    primera: { kind: "none" },
    estacionalesActivos: true,
    mensajesActivos: true,
    ...over,
  };
}

function history(shown: string[] = [], maxSize = 20): AnimoHistory {
  return { shown, maxSize };
}

describe("pickAnimoMessage", () => {
  it("returns null when messages are disabled", () => {
    const cat = catalog([msg("m1", "generico", "generico")]);
    const ctx = context({ mensajesActivos: false });
    expect(pickAnimoMessage(cat, ctx, history(), "seed")).toBeNull();
  });

  it("returns null when no messages match any context", () => {
    const cat = catalog([msg("m1", "momento_del_dia", "manana")]);
    const ctx = context({ momento: "tarde" });
    expect(pickAnimoMessage(cat, ctx, history(), "seed")).toBeNull();
  });

  it("picks a generic message when no specific context matches", () => {
    const cat = catalog([msg("m1", "generico", "generico")]);
    const ctx = context();
    const result = pickAnimoMessage(cat, ctx, history(), "seed");
    expect(result?.id).toBe("m1");
  });

  it("prioritizes social context over momento del día", () => {
    const cat = catalog([
      msg("social", "contexto_social", "match_nuevo"),
      msg("momento", "momento_del_dia", "tarde"),
    ]);
    const ctx = context({ social: { kind: "match_nuevo", count: 1 }, momento: "tarde" });
    const result = pickAnimoMessage(cat, ctx, history(), "seed");
    expect(result?.id).toBe("social");
  });

  it("prioritizes seasonal context when date matches", () => {
    const cat = catalog([
      msg("est", "estacional", "dia_de_muertos", { inicio: "11-01", fin: "11-02" }),
      msg("gen", "generico", "generico"),
    ]);
    const ctx = context({ fecha: "2026-11-01", estacional: "dia_de_muertos" });
    const result = pickAnimoMessage(cat, ctx, history(), "seed");
    expect(result?.id).toBe("est");
  });

  it("skips seasonal messages when disabled in settings", () => {
    const cat = catalog([
      msg("est", "estacional", "dia_de_muertos", { inicio: "11-01", fin: "11-02" }),
      msg("gen", "generico", "generico"),
    ]);
    const ctx = context({ fecha: "2026-11-01", estacionalesActivos: false });
    const result = pickAnimoMessage(cat, ctx, history(), "seed");
    expect(result?.id).toBe("gen");
  });

  it("skips seasonal messages when date does not match", () => {
    const cat = catalog([
      msg("est", "estacional", "dia_de_muertos", { inicio: "11-01", fin: "11-02" }),
      msg("gen", "generico", "generico"),
    ]);
    const ctx = context({ fecha: "2026-11-05" });
    const result = pickAnimoMessage(cat, ctx, history(), "seed");
    expect(result?.id).toBe("gen");
  });

  it("handles year wraparound for seasonal dates", () => {
    const cat = catalog([
      msg("est", "estacional", "fin_de_anio", { inicio: "12-20", fin: "01-05" }),
    ]);
    const ctxDec = context({ fecha: "2026-12-25" });
    const ctxJan = context({ fecha: "2027-01-03" });
    const ctxOut = context({ fecha: "2027-01-10" });
    expect(pickAnimoMessage(cat, ctxDec, history(), "seed")?.id).toBe("est");
    expect(pickAnimoMessage(cat, ctxJan, history(), "seed")?.id).toBe("est");
    expect(pickAnimoMessage(cat, ctxOut, history(), "seed")).toBeNull();
  });

  it("prioritizes animo context when published", () => {
    const cat = catalog([
      msg("animo", "animo_publicado", "cansancio"),
      msg("gen", "generico", "generico"),
    ]);
    const ctx = context({ animo: "cansancio" });
    const result = pickAnimoMessage(cat, ctx, history(), "seed");
    expect(result?.id).toBe("animo");
  });

  it("prioritizes primera entrada tras eclosion", () => {
    const cat = catalog([
      msg("primera", "primera_entrada", "tras_eclosion"),
      msg("gen", "generico", "generico"),
    ]);
    const ctx = context({ primera: { kind: "tras_eclosion" } });
    const result = pickAnimoMessage(cat, ctx, history(), "seed");
    expect(result?.id).toBe("primera");
  });

  it("matches momento del día correctly", () => {
    const cat = catalog([
      msg("manana", "momento_del_dia", "manana"),
      msg("tarde", "momento_del_dia", "tarde"),
    ]);
    const ctxManana = context({ momento: "manana" });
    const ctxTarde = context({ momento: "tarde" });
    expect(pickAnimoMessage(cat, ctxManana, history(), "seed")?.id).toBe("manana");
    expect(pickAnimoMessage(cat, ctxTarde, history(), "seed")?.id).toBe("tarde");
  });

  it("excludes messages in history", () => {
    const cat = catalog([
      msg("m1", "generico", "generico"),
      msg("m2", "generico", "generico"),
    ]);
    const ctx = context();
    const hist = history(["m1"]);
    const result = pickAnimoMessage(cat, ctx, hist, "seed");
    expect(result?.id).toBe("m2");
  });

  it("falls back to null when all messages are in history", () => {
    const cat = catalog([msg("m1", "generico", "generico")]);
    const ctx = context();
    const hist = history(["m1"]);
    expect(pickAnimoMessage(cat, ctx, hist, "seed")).toBeNull();
  });

  it("is deterministic: same inputs yield same output", () => {
    const cat = catalog([
      msg("m1", "generico", "generico"),
      msg("m2", "generico", "generico"),
      msg("m3", "generico", "generico"),
    ]);
    const ctx = context();
    const hist = history();
    const seed = "person-123:2026-11-07";
    const r1 = pickAnimoMessage(cat, ctx, hist, seed);
    const r2 = pickAnimoMessage(cat, ctx, hist, seed);
    const r3 = pickAnimoMessage(cat, ctx, hist, seed);
    expect(r1?.id).toBe(r2?.id);
    expect(r2?.id).toBe(r3?.id);
  });

  it("varies selection with different seeds", () => {
    const cat = catalog([
      msg("m1", "generico", "generico"),
      msg("m2", "generico", "generico"),
      msg("m3", "generico", "generico"),
      msg("m4", "generico", "generico"),
      msg("m5", "generico", "generico"),
    ]);
    const ctx = context();
    const hist = history();
    const results = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const result = pickAnimoMessage(cat, ctx, hist, `seed-${i}`);
      if (result) results.add(result.id);
    }
    // With 5 messages and 10 seeds, we should see at least 2 different messages
    expect(results.size).toBeGreaterThanOrEqual(2);
  });
});

describe("updateHistory", () => {
  it("adds a message ID to the history", () => {
    const hist = history(["m1", "m2"]);
    const updated = updateHistory(hist, "m3");
    expect(updated.shown).toEqual(["m1", "m2", "m3"]);
  });

  it("removes the oldest message when history is full", () => {
    const hist = history(["m1", "m2", "m3"], 3);
    const updated = updateHistory(hist, "m4");
    expect(updated.shown).toEqual(["m2", "m3", "m4"]);
  });

  it("does not modify the original history", () => {
    const hist = history(["m1", "m2"]);
    const updated = updateHistory(hist, "m3");
    expect(hist.shown).toEqual(["m1", "m2"]);
    expect(updated.shown).toEqual(["m1", "m2", "m3"]);
  });
});
