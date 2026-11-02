/**
 * Secondary and exploratory sections of docs/VALIDACION_RESULTADOS.md.
 */
import { EQUIVALENCE } from "./ablation";
import type { ValidationResults } from "./report";
import { f3, ok, pc, pv } from "./report";

const BETA_GAP = 0.01;
const SKILL_MIN = 0;
const ECE_MAX = 0.05;
const DECILE_RHO = 0.9;

function cvSection(r: ValidationResults): string[] {
  const out = [
    "## H5 · Validación cruzada anidada y agrupada por persona (5 × 4 pliegues, β ajustado adentro)",
    "",
    "| Track | Etiqueta | Pliegue | β elegido | AUC β ajustado | AUC β config | AUC línea base |",
    "|---|---|---|---|---|---|---|",
  ];
  const verdicts: string[] = [];
  for (const c of r.cv) {
    for (const f of c.folds) out.push(`| ${c.track} | ${c.label} | ${f.fold + 1} | ${f.beta} | ${f3(f.tuned)} | ${f3(f.config)} | ${f3(f.baseline)} |`);
    const beats = c.folds.every((f) => f.tuned > f.baseline);
    const gap = c.folds.reduce((s, f) => s + Math.abs(f.tuned - f.config), 0) / c.folds.length;
    verdicts.push(`| ${c.track} | ${c.label} | ${ok(beats)} | ${f3(gap)} | ${ok(gap <= BETA_GAP)} |`);
  }
  return [
    ...out,
    "",
    "| Track | Etiqueta | (a) supera a la línea base en 5/5 | (b) media \\|AUC ajustado − AUC config\\| | (b) |",
    "|---|---|---|---|---|",
    ...verdicts,
    "",
  ];
}

function calibrationSection(r: ValidationResults): string[] {
  const rows = r.cv.map((c) => {
    const k = c.calibration;
    return `| ${c.track} | ${c.label} | ${f3(k.brier)} | ${f3(k.brierBase)} | ${f3(k.skill)} ${ok(k.skill > SKILL_MIN)} | ${f3(k.ece)} ${ok(k.ece <= ECE_MAX)} | ${f3(k.decileRho)} ${ok(k.decileRho >= DECILE_RHO)} |`;
  });
  const first = r.cv[0]!;
  const bins = first.calibration.bins.map((b, i) => `| ${i + 1} | ${f3(b.meanPredicted)} | ${f3(b.observed)} | ${b.n} |`);
  return [
    "## H6 · Calibración (Platt ajustado en entrenamiento, evaluado fuera de pliegue)",
    "",
    "| Track | Etiqueta | Brier | Brier tasa base | Skill (H6a) | ECE 10 bins (H6b) | ρ deciles (H6c) |",
    "|---|---|---|---|---|---|---|",
    ...rows,
    "",
    `Curva de fiabilidad (${first.track}, ${first.label}; bins de igual frecuencia):`,
    "",
    "| Bin | Probabilidad media predicha | Tasa observada | n |",
    "|---|---|---|---|",
    ...bins,
    "",
  ];
}

function confidenceSection(r: ValidationResults): string[] {
  const rows = r.confidence.flatMap((c) =>
    c.rows.map((x) => `| ${c.track} | ${x.rule} | ${x.alta} | ${x.media} | ${pc(x.rateAlta)} | ${pc(x.rateMedia)} | ${ok(x.alta > 0 && x.rateAlta > x.rateMedia)} |`),
  );
  return [
    "## H6b · Confianza «alta» contra «media» entre los matches publicados (etiqueta «similitud»)",
    "",
    "| Track | Regla | n alta | n media | Match verdadero (alta) | Match verdadero (media) | Veredicto |",
    "|---|---|---|---|---|---|---|",
    ...rows,
    "",
  ];
}

function ablationSection(r: ValidationResults): string[] {
  const out = [
    "## H7 · Ablación por capa (exploratoria; BH q = 0.10)",
    "",
    `ΔAUC = AUC(modelo completo) − AUC(sin la capa). Positivo = la capa ayuda a recuperar la etiqueta. Equivalencia: IC dentro de ±${EQUIVALENCE}.`,
    "",
    "| Track | Sin… | ΔAUC similitud [IC 95 %] | q BH | ΔAUC ventana | Lectura |",
    "|---|---|---|---|---|---|",
  ];
  for (const a of r.ablation) {
    for (const x of a.rows) {
      if (!x.applies) {
        out.push(`| ${a.track} | ${x.label} | — | — | — | no entra en este track |`);
        continue;
      }
      const s = x.similitud;
      const equivalent = s.lo >= -EQUIVALENCE && s.hi <= EQUIVALENCE;
      const reading = equivalent ? "equivalente a 0 (solo extra)" : x.q < 0.1 ? (s.delta > 0 ? "aporta" : "estorba") : "no concluyente";
      out.push(`| ${a.track} | ${x.label} | ${f3(s.delta)} [${f3(s.lo)}, ${f3(s.hi)}] | ${pv(x.q)} | ${f3(x.ventana)} | ${reading} |`);
    }
  }
  return [
    ...out,
    "",
    "Nota: con la etiqueta «similitud» (circular) quitar cualquier categoría con peso tiende a bajar el AUC por construcción; la columna «ventana» es la lectura independiente.",
    "",
  ];
}

export function renderSecondary(r: ValidationResults): string[] {
  return [...cvSection(r), ...calibrationSection(r), ...confidenceSection(r), ...ablationSection(r)];
}
