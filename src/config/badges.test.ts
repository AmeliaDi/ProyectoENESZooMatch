/**
 * Guard for `data/badges.json`: the shipped catalogue must parse, and the four
 * rules the grid depends on must fail loudly when someone edits the file —
 * unique ids, unique icons, the copy budget of docs/QUIZZES.md §5.3 and the
 * annotation every policy value carries (`docs/TRAZABILIDAD.md` provenance).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { BADGES, badgesSchema } from "./badges";
import raw from "../../data/badges.json";

type Rec = Record<string, unknown>;
const clone = () => structuredClone(raw) as Rec;
const badgeAt = (source: Rec, index: number): Rec => (source.insignias as Rec[])[index]!;
const badgesOf = (source: Rec): Rec[] => source.insignias as Rec[];

describe("badges schema", () => {
  it("accepts the shipped config", () => {
    expect(badgesSchema.safeParse(raw).success).toBe(true);
  });

  it("rejects a second badge with the same id", () => {
    const copy = clone();
    badgeAt(copy, 1)!.id = badgeAt(copy, 0)!.id;
    expect(badgesSchema.safeParse(copy).success).toBe(false);
  });

  it("rejects two badges that share an icon, wherever they sit", () => {
    const copy = clone();
    const list = badgesOf(copy);
    list[list.length - 1]!.icono = list[0]!.icono;
    expect(badgesSchema.safeParse(copy).success).toBe(false);
  });

  it("rejects a name longer than three words", () => {
    const copy = clone();
    badgeAt(copy, 0)!.nombre = "La primera conexión del cielo entero";
    expect(badgesSchema.safeParse(copy).success).toBe(false);
  });

  it("rejects a description longer than the one-line budget", () => {
    const copy = clone();
    badgeAt(copy, 0)!.descripcion = "x".repeat(81);
    expect(badgesSchema.safeParse(copy).success).toBe(false);
  });

  it("rejects a policy value that arrives without its label and source", () => {
    const copy = clone();
    (copy.politica as Rec).ventana_actividad_dias = 30;
    expect(badgesSchema.safeParse(copy).success).toBe(false);
  });

  it("rejects an activity source the read model cannot stamp", () => {
    const copy = clone();
    (copy.politica as Rec).fuentes_actividad = ["ronda_contestada"];
    expect(badgesSchema.safeParse(copy).success).toBe(false);
  });

  it("rejects a threshold nobody would ever reach in this app", () => {
    const copy = clone();
    const condicion = (badgeAt(copy, 0)!.condicion as Rec).min as Rec;
    condicion.valor = 31;
    expect(badgesSchema.safeParse(copy).success).toBe(false);
  });
});

describe("data/badges.json as documentation", () => {
  const INSIGNIAS = readFileSync(join(__dirname, "..", "..", "docs", "INSIGNIAS.md"), "utf8");

  /** The parsed config keeps only `valor`; the annotation lives in the file. */
  const annotatedSources = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.flatMap(annotatedSources);
    if (!value || typeof value !== "object") return [];
    const rec = value as Rec;
    if (typeof rec.fuente === "string") return [rec.fuente];
    return Object.values(rec).flatMap(annotatedSources);
  };

  it("points every annotated value at a section of docs/INSIGNIAS.md that exists", () => {
    const sources = annotatedSources(raw);
    expect(sources.length).toBeGreaterThanOrEqual(BADGES.politica.fuentes_actividad.length);
    for (const source of sources) {
      const section = /§\s?(\d+)/.exec(source)?.[1];
      if (!section) throw new Error(`${source} does not name a section`);
      expect(INSIGNIAS, source).toMatch(new RegExp(`^## ${section}\\.`, "m"));
    }
  });

  it("keeps the derived promise in the copy itself", () => {
    // The grid shows no dates; the note is what tells a person why.
    expect(BADGES.copy.nota_derivada.toLowerCase()).toMatch(/no guardamos/);
    expect(INSIGNIAS).toMatch(/derivad/i);
  });
});
