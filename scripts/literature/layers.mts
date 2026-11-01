/** Prints the computed layer-admission table and item budget (no network, no credits). */
import { budgetSummary, decisionTable, evaluateCandidate, loadLayerFiles } from "./lib/layers.ts";

const { criteria, data } = loadLayerFiles("data/literature/layer-criteria.json", "data/literature/layer-candidates.json");
const evaluations = data.candidates.map((c) => evaluateCandidate(c, criteria));
const mismatches = evaluations.filter((e) => data.candidates.find((c) => c.id === e.id)?.decisionDeclarada !== e.decision);

console.log(decisionTable(data, evaluations));
console.log("");
console.log(JSON.stringify(budgetSummary(data, criteria, evaluations), null, 2));
if (mismatches.length > 0) {
  console.error(`Decisión declarada distinta de la calculada: ${mismatches.map((m) => m.id).join(", ")}`);
  process.exit(1);
}
