/** Prints the computed layer-admission table, writes it into docs/CAPAS_EVIDENCIA.md §2 (no network, no credits). */
import { readFileSync, writeFileSync } from "node:fs";

import {
  budgetSummary,
  decisionTable,
  evaluateCandidate,
  extrasWeight,
  licensingGaps,
  loadLayerFiles,
  syncDecisionTable,
} from "./lib/layers.ts";

const DOC = "docs/CAPAS_EVIDENCIA.md";
const { criteria, data, counts, config } = loadLayerFiles(
  "data/literature/layer-criteria.json",
  "data/literature/layer-candidates.json",
  "data/microtest.json",
  "data/matching-config.json",
);
const evaluations = data.candidates.map((c) => evaluateCandidate(c, criteria, counts, config));
const mismatches = evaluations.filter((e) => data.candidates.find((c) => c.id === e.id)?.decisionDeclarada !== e.decision);

const table = decisionTable(data, evaluations, counts);
console.log(table);
console.log("");
console.log(JSON.stringify({ ...budgetSummary(data, criteria, evaluations, counts), extrasWeight: extrasWeight(data, evaluations) }, null, 2));

const blocks = evaluations.filter((e) => e.sensitive.length > 0);
console.log("");
if (blocks.length === 0) {
  console.log("criterio 5: ninguna ficha puntúa datos sensibles sin justificarlos");
} else {
  console.log("BLOQUEOS POR DATO SENSIBLE (" + blocks.length + "):");
  console.log(blocks.map((e) => "  " + e.sensitive.join("\n  ")).join("\n"));
}

const gaps = licensingGaps(data, evaluations, config);
console.log("");
if (gaps.length === 0) {
  console.log("licenciamiento: toda categoría con peso tiene una ficha admitida");
} else {
  const lines = gaps.map((g) => {
    const quien = g.sinFicha ? "ninguna ficha reclama sus factores" : "fichas: " + g.fichas.join(", ");
    return "  " + g.categoria + ": peso " + g.pesoMaximo + " > licenciado " + g.licenciado + " — " + quien;
  });
  console.log("ADEUDOS DE LICENCIAMIENTO (" + gaps.length + "):");
  console.log(lines.join("\n"));
}

const doc = readFileSync(DOC, "utf8");
const updated = syncDecisionTable(doc, table);
if (updated !== doc) writeFileSync(DOC, updated);
console.log(`${DOC} §2 ${updated === doc ? "ya estaba al día" : "reescrito desde el registry"}`);
if (mismatches.length > 0) {
  console.error(`Decisión declarada distinta de la calculada: ${mismatches.map((m) => m.id).join(", ")}`);
  process.exit(1);
}
