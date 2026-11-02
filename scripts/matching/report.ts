/**
 * Markdown rendering of the pipeline results (docs/MATCHING_RESULTADOS.md).
 * Generated file: do not edit by hand.
 */
import type { MatchCategoryId } from "@/types/matching-config";

import type { Interval, MorrisRow } from "./metrics";

export interface TrackReport {
  track: string;
  alpha: number;
  pairs: number;
  threshold: number;
  above: number;
  coverage: number;
  matches: number;
  quantiles: Array<{ q: number; real: number; null: number }>;
  coverageCurve: Array<{ q: number; threshold: number; above: number; coverage: number }>;
  betas: Array<{ beta: number; threshold: number; coverage: number; p10: number; median: number; rho: number }>;
  recovery: Array<{ hypothesis: string; model: Interval; baseline: Interval }>;
  ablation: Array<{ label: string; rho: number; jaccard: number; coverage: number; auc: number }>;
  stability: { rho: number; jaccard: number };
  equity: Array<{ group: string; n: number; eligiblePartners: number; coverage: number }>;
  morris: MorrisRow[];
  identityShare: number;
  extrasShare: number;
  identityWeight: number;
  extrasWeight: number;
  maxScore: number;
  referenceHigh: number;
}

export interface ReportInput {
  reports: readonly TrackReport[];
  quality: { honest: number; meanQuality: number; lowQuality: number };
  inputHash: string;
  population: number;
  seed: number;
}

const f = (x: number, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : "—");
const pct = (x: number, d = 1) => `${(100 * x).toFixed(d)} %`;
const ci = (i: Interval) => `${f(i.estimate)} [${f(i.lo)}, ${f(i.hi)}]`;
const table = (head: string[], rows: string[][]) =>
  [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");

function trackSection(r: TrackReport): string {
  const betaRows = r.betas.map((b) => [b.beta === 0 ? "0 (media aritmética)" : String(b.beta), f(b.threshold), pct(b.coverage), f(b.p10), f(b.median), f(b.rho)]);
  const morrisRows = [...r.morris].sort((a, b) => b.muStar - a.muStar).map((m) => [m.id as MatchCategoryId, f(m.muStar), f(m.sigma)]);
  return [
    `## Track: ${r.track}`,
    "",
    `Pares elegibles: ${r.pairs}. Umbral = cuantil ${1 - r.alpha} de la nula: **${f(r.threshold, 4)}**. Pares reales sobre el umbral: ${pct(r.above)}. Matches publicados (top-K): ${r.matches}; cobertura de personas: **${pct(r.coverage)}**. Puntaje máximo observado: ${f(r.maxScore)}; techo de referencia (cuantil 0.999): ${f(r.referenceHigh, 4)}.`,
    "",
    "### Distribución de similitudes (real vs nula por permutación)",
    "",
    table(["Cuantil", "Real", "Nula"], r.quantiles.map((q) => [String(q.q), f(q.real), f(q.null)])),
    "",
    "### Cobertura por umbral",
    "",
    table(["Cuantil nulo", "Umbral", "Pares sobre umbral", "Cobertura"], r.coverageCurve.map((c) => [String(c.q), f(c.threshold), pct(c.above), pct(c.coverage)])),
    "",
    "### Soft-min (β) contra media aritmética (β = 0)",
    "",
    "Cada β se recalibra contra su propia nula. Área más débil = mínima similitud entre las áreas centrales de cada match publicado (más alto = el match exige compatibilidad en todo, no solo en promedio).",
    "",
    table(["β", "Umbral recalibrado", "Cobertura", "Área más débil P10", "Área más débil mediana", "ρ vs β de config"], betaRows),
    "",
    "### Recuperación de la forma generadora (AUC, IC 95 % bootstrap por persona)",
    "",
    "Etiqueta positiva = 10 % superior de pares según la hipótesis generadora evaluada sobre los rasgos verdaderos.",
    "",
    table(["Hipótesis", "Modelo por capas", "Línea base (coseno descriptivo)"], r.recovery.map((x) => [x.hypothesis, ci(x.model), ci(x.baseline)])),
    "",
    "### Ablación",
    "",
    table(["Variante", "ρ con modelo completo", "Jaccard de matches", "Cobertura", "AUC (similitud)"], r.ablation.map((a) => [a.label, f(a.rho), f(a.jaccard), pct(a.coverage), f(a.auc)])),
    "",
    `Fracción media del puntaje explicada (contribuciones exactas): capa 4 (MBTI + Eneagrama, peso ${f(r.identityWeight)}) ${pct(r.identityShare, 2)}; extras (conflicto, apego, afecto, peso ${f(r.extrasWeight)}) ${pct(r.extrasShare, 2)}. La fracción supera al peso porque las ventanas de tolerancia dan similitudes altas mientras el núcleo estricto queda más bajo; como los extras varían poco entre pares, apenas cambian el orden (ver ablación).`,
    "",
    "### Estabilidad ante ruido (±1 Likert en 10 % de los ítems)",
    "",
    `Spearman de puntajes: **${f(r.stability.rho)}**; Jaccard de los matches publicados: **${f(r.stability.jaccard)}**.`,
    "",
    "### Sensibilidad de pesos (Morris, μ* = efecto medio absoluto sobre el orden de pares)",
    "",
    table(["Categoría", "μ*", "σ"], morrisRows),
    "",
    "### Equidad por subpoblación",
    "",
    table(["Subpoblación", "N", "Parejas elegibles (media)", "Cobertura"], r.equity.map((e) => [e.group, String(e.n), f(e.eligiblePartners, 1), pct(e.coverage)])),
  ].join("\n");
}

export function renderReport(input: ReportInput): string {
  return [
    "# Resultados del modelo de matching (generado)",
    "",
    "> Archivo generado por `npm run data:matching`. No editar a mano.",
    "> Datos **sintéticos**: validan el código y la sensibilidad del modelo, no el mundo real.",
    "",
    `- Semilla: ${input.seed}; perfiles: ${input.population}; hash de entradas (config + parámetros): \`${input.inputHash.slice(0, 16)}\`.`,
    `- Calidad de respuesta: ${pct(input.quality.honest)} con calidad 1; media ${f(input.quality.meanQuality)}; ${input.quality.lowQuality} perfiles con calidad < 0.8.`,
    "",
    ...input.reports.flatMap((r) => [trackSection(r), ""]),
  ].join("\n");
}
