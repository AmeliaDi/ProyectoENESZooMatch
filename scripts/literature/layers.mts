/** Prints the computed layer-admission table, writes it into docs/CAPAS_EVIDENCIA.md §2 (no network, no credits). */
import { readFileSync, writeFileSync } from "node:fs";

import { budgetSummary, decisionTable, evaluateCandidate, extrasWeight, loadLayerFiles, syncDecisionTable } from "./lib/layers.ts";

const DOC = "docs/CAPAS_EVIDENCIA.md";
const { criteria, data } = loadLayerFiles("data/literature/layer-criteria.json", "data/literature/layer-candidates.json");
const evaluations = data.candidates.map((c) => evaluateCandidate(c, criteria));
const mismatches = evaluations.filter((e) => data.candidates.find((c) => c.id === e.id)?.decisionDeclarada !== e.decision);

const table = decisionTable(data, evaluations);
console.log(table);
console.log("");
console.log(JSON.stringify({ ...budgetSummary(data, criteria, evaluations), extrasWeight: extrasWeight(data, evaluations) }, null, 2));
const doc = readFileSync(DOC, "utf8");
const updated = syncDecisionTable(doc, table);
if (updated !== doc) writeFileSync(DOC, updated);
console.log(`${DOC} §2 ${updated === doc ? "ya estaba al día" : "reescrito desde el registry"}`);
if (mismatches.length > 0) {
  console.error(`Decisión declarada distinta de la calculada: ${mismatches.map((m) => m.id).join(", ")}`);
  process.exit(1);
}
