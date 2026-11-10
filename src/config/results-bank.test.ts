/**
 * docs/BANCO_RESULTADOS.md is a pointer page: it owns no number. Every headline
 * count in §2 is re-derived here from `data/psychometric-params.json`, and the
 * seal it cites is re-hashed from the file, so re-running the estimator without
 * revisiting the page fails this suite instead of silently leaving a stale claim.
 */
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { PSYCHOMETRIC_PARAMS } from "./psychometric-params";

const read = (path: string) => readFileSync(resolve(path), "utf8");
const DOC = read("docs/BANCO_RESULTADOS.md");

const numerics = (value: unknown): number => {
  if (typeof value === "number") return 1;
  if (Array.isArray(value)) return value.reduce((sum, entry) => sum + numerics(entry), 0);
  if (value && typeof value === "object") return Object.values(value).reduce((sum, entry) => sum + numerics(entry), 0);
  return 0;
};

/** The page writes thousands with a space (`7 075`), so the test compares like that. */
const group = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

const grouped = Object.values(PSYCHOMETRIC_PARAMS.items).reduce<Record<string, number>>((acc, item) => {
  acc[item.etiqueta] = (acc[item.etiqueta] ?? 0) + 1;
  return acc;
}, {});

const scaleList = Object.values(PSYCHOMETRIC_PARAMS.escalas);
const items = Object.values(PSYCHOMETRIC_PARAMS.items);

/** A row of the §2 table, addressed by its label. */
const row = (label: string): string => {
  const line = DOC.split(/\r?\n/).find((candidate) => candidate.startsWith(`| ${label} |`));
  expect(line, `falta el renglón «${label}» en docs/BANCO_RESULTADOS.md`).toBeDefined();
  return line ?? "";
};

describe("docs/BANCO_RESULTADOS.md", () => {
  it("states the counts of the parameter artifact it points at", () => {
    expect(row("factores con parámetro")).toContain(`**${PSYCHOMETRIC_PARAMS.factores.length}**`);
    expect(row("ítems con parámetro GRM")).toContain(`**${items.length}**`);
    expect(row("ítems marcados de carga baja")).toContain(`**${items.filter((item) => item.marcado_baja_carga).length}**`);
    expect(row("escalas con fiabilidad")).toContain(`**${scaleList.length}**`);
    expect(row("escalas con fiabilidad")).toContain(`**${scaleList.filter((s) => s.omega !== null).length}**`);
    expect(row("priors de covarianza entre constructos")).toContain(`**${PSYCHOMETRIC_PARAMS.covarianza_latente.priors.length}**`);
  });

  it("carries the provenance labels of the items, as many as they actually are", () => {
    const line = row("ítems con parámetro GRM");
    for (const [label, count] of Object.entries(grouped)) {
      expect(line, label).toContain(`${count} \`${label}\``);
    }
    const pendiente = PSYCHOMETRIC_PARAMS.covarianza_latente.priors.filter((p) => p.etiqueta === "pendiente_verificacion").length;
    expect(DOC).toContain(`(${pendiente} de los ${PSYCHOMETRIC_PARAMS.covarianza_latente.priors.length})`);
  });

  it("reports the whole numeric footprint of the artifact", () => {
    expect(row("valores numéricos totales del artefacto")).toContain(group(numerics(PSYCHOMETRIC_PARAMS)));
  });

  it("quotes the fit indices and the run conditions from the artifact itself", () => {
    const line = row("ajuste del núcleo (AFC, HEXACO 24 ítems / 6 factores)");
    for (const value of Object.values(PSYCHOMETRIC_PARAMS.ajuste_nucleo)) expect(line, String(value)).toContain(String(value));
    const run = row("condiciones de la corrida");
    expect(run).toContain(String(PSYCHOMETRIC_PARAMS.n_sintetico));
    expect(run).toContain(PSYCHOMETRIC_PARAMS.entrada_sha256.slice(0, 16));
    expect(DOC).toContain(PSYCHOMETRIC_PARAMS.advertencia);
  });

  it("cites the same seal that docs/TRAZABILIDAD.md registers for the artifact", () => {
    const hash = createHash("sha256").update(read("data/psychometric-params.json").replaceAll("\r\n", "\n")).digest("hex").slice(0, 16);
    const matrix = read("docs/TRAZABILIDAD.md").split(/\r?\n/).find((line) => line.startsWith("| data/psychometric-params.json |")) ?? "";
    expect(matrix).toContain(hash);
    expect(row("sello del artefacto")).toContain(hash);
  });

  it("keeps the denial of a per-person desirability score, and its source", () => {
    const sentence = "No es un puntaje de deseabilidad";
    expect(DOC).toContain(sentence);
    expect(read("docs/MATCHING_RESULTADOS.md"), "la cita salió del reporte que la genera").toContain(sentence);
  });

  it("only links files that exist", () => {
    const pages = [DOC, read("docs/PRETEST_COGNITIVO.md")];
    for (const page of pages) {
      const docs = [...page.matchAll(/`(docs\/[A-Z_]+\.md)(?::\d+)?`/g)].map((match) => match[1]!);
      expect(docs.length, "la página no enlaza suficientes documentos").toBeGreaterThanOrEqual(6);
      for (const path of new Set(docs)) expect(existsSync(resolve(path)), path).toBe(true);
      const code = [...page.matchAll(/`((?:src|scripts|data)\/[^`:\s]+)(?::\d+(?:-\d+)?)?`/g)].map((match) => match[1]!);
      for (const path of new Set(code)) expect(existsSync(resolve(path)), path).toBe(true);
    }
  });
});

describe("docs/PRETEST_COGNITIVO.md", () => {
  const PRE = read("docs/PRETEST_COGNITIVO.md");
  const catalogue = ["gustos", "gaming", "vida", "conexion", "picante"].map((category) => {
    const file = JSON.parse(read(`data/quizzes/${category}.json`)) as { quizzes: { items: unknown[] }[] };
    return { category, quizzes: file.quizzes.length, items: file.quizzes.reduce((sum, quiz) => sum + quiz.items.length, 0) };
  });

  it("is an unexecuted protocol, and says so", () => {
    expect(PRE).toContain("cero sesiones ejecutadas");
    expect(PRE).toContain("`pendiente_humana`");
    for (const line of PRE.split(/\r?\n/).filter((candidate) => candidate.startsWith("| ") && /\| 0 \| 0 \| 0 \|/.test(candidate))) {
      expect(line).toContain("pendiente_humana");
    }
    expect(PRE.split(/\r?\n/).filter((line) => /\| 0 \| 0 \| 0 \|/.test(line))).toHaveLength(catalogue.length + 1);
  });

  it("counts the catalogue the way the data files count it", () => {
    for (const entry of catalogue) {
      expect(PRE, entry.category).toContain(`${entry.category} ${entry.quizzes} quizzes / ${entry.items} ítems`);
    }
    expect(PRE).toContain(`**${catalogue.reduce((sum, entry) => sum + entry.quizzes, 0)}**`);
    expect(PRE).toContain(`**${catalogue.reduce((sum, entry) => sum + entry.items, 0)}**`);
    expect(PRE).toContain(`**${items.length}**`);
    expect(PRE).toContain("**150/150**");
  });

  it("keeps the two hard prohibitions", () => {
    expect(PRE).toContain("No se construye un puntaje de deseabilidad social por persona");
    expect(PRE).toContain("Prohibido exportar filas individuales, mensajes, respuestas, matrículas, hashes o PIN");
    expect(read("docs/PENDIENTES_MANUALES.md")).toContain("Prohibido exportar filas individuales, mensajes, respuestas, matrículas, hashes");
  });

  it("is registered as a manual pending item, in both directions", () => {
    const pendientes = read("docs/PENDIENTES_MANUALES.md");
    expect(pendientes).toMatch(/^## M-15 · /m);
    expect(PRE).toContain("M-15");
  });

  it("points the numeric questions at the pilot instead of answering them here", () => {
    for (const value of [194, 347, 783]) expect(PRE, String(value)).toContain(String(value));
    expect(PRE).toContain("docs/VALIDACION.md");
    expect(PRE).toContain("docs/BANCO_RESULTADOS.md");
  });
});
