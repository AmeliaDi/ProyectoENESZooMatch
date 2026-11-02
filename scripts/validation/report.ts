/**
 * docs/VALIDACION_RESULTADOS.md (generated). Verdicts apply the preregistered
 * criteria literally; nothing here is tuned after seeing the numbers.
 */
import type { MatchTrack } from "@/types/microtest";

import type { AblationRow } from "./ablation";
import type { ConfidenceRow } from "./confidence";
import type { CrossvalTrack } from "./crossval";
import type { PrimaryTrack, SeRow } from "./primary";
import { renderSecondary } from "./report-secondary";

export interface ValidationResults {
  readonly population: number;
  readonly fullBank: number;
  readonly seed: number;
  readonly hashes: Record<string, string>;
  readonly primary: readonly PrimaryTrack[];
  readonly holmP: Record<string, number>;
  readonly se: readonly SeRow[];
  readonly cv: readonly CrossvalTrack[];
  readonly ablation: ReadonlyArray<{ track: MatchTrack; rows: ReadonlyArray<AblationRow & { q: number }> }>;
  readonly confidence: ReadonlyArray<{ track: MatchTrack; rows: readonly ConfidenceRow[] }>;
}

export const f3 = (x: number) => (Number.isFinite(x) ? x.toFixed(3) : "—");
export const pc = (x: number) => (Number.isFinite(x) ? `${(100 * x).toFixed(1)} %` : "—");
export const pv = (x: number) => (x < 0.001 ? "< 0.001" : x.toFixed(3));
export const ok = (pass: boolean) => (pass ? "**cumple**" : "**no cumple**");

const AUC_FLOOR = 0.7;
const COVER_ROMANCE = 0.6;
const WILSON_ROMANCE = 0.5;
const COVER_FRIEND = 0.95;
const RHO_NOISE = 0.9;
const RHO_CORE = 0.8;

function h1Table(r: ValidationResults): string[] {
  const rows = r.primary.flatMap((p) =>
    Object.entries(p.h1).map(([h, a]) => {
      const primary = h === "similitud";
      const verdict = primary ? ok(r.holmP[`H1:${p.track}`]! < 0.05 && a.a >= AUC_FLOOR) : ok(a.lo > 0);
      return `| ${p.track} | ${h}${primary ? " (primaria)" : " (H1s)"} | ${f3(a.a)} | ${f3(a.b)} | ${f3(a.delta)} [${f3(a.lo)}, ${f3(a.hi)}] | ${pv(a.p)} | ${primary ? pv(r.holmP[`H1:${p.track}`]!) : "—"} | ${verdict} |`;
    }),
  );
  return [
    "## H1 · Modelo contra línea base (AUC, bootstrap pareado por persona, B = 200)",
    "",
    "| Track | Hipótesis generadora | AUC modelo | AUC línea base | ΔAUC [IC 95 %] | p | p Holm | Veredicto |",
    "|---|---|---|---|---|---|---|---|",
    ...rows,
    "",
  ];
}

function h2Table(r: ValidationResults): string[] {
  const rows = r.primary.flatMap((p) =>
    p.h2.map((e) => {
      const verdict = e.excluded
        ? "excluida por diseño (§4)"
        : p.track === "romance"
          ? ok(e.coverage >= COVER_ROMANCE && e.lo >= WILSON_ROMANCE)
          : ok(e.coverage >= COVER_FRIEND);
      return `| ${p.track} | ${e.group} | ${e.n} | ${pc(e.coverage)} | [${pc(e.lo)}, ${pc(e.hi)}] | ${verdict} |`;
    }),
  );
  return [
    "## H2 · Equidad por subpoblación (cobertura con IC de Wilson al 95 %)",
    "",
    "| Track | Subpoblación | N | Cobertura | IC 95 % | Veredicto |",
    "|---|---|---|---|---|---|",
    ...rows,
    "",
  ];
}

function h3h4(r: ValidationResults): string[] {
  const h3 = r.primary.map((p) => `| ${p.track} | ${f3(p.h3.rho)} | ${ok(p.h3.rho >= RHO_NOISE)} | ${f3(p.h3.jaccard)} | ${ok(p.h3.jaccard >= 0.5)} |`);
  const h4 = r.primary.map(
    (p) =>
      `| ${p.track} | ${p.h4.pairs} | ${f3(p.h4.a)} | ${f3(p.h4.b)} | ${f3(p.h4.delta)} [${f3(p.h4.lo)}, ${f3(p.h4.hi)}] | ${pv(r.holmP[`H4:${p.track}`]!)} | ${ok(r.holmP[`H4:${p.track}`]! < 0.05)} | ${f3(p.h4c)} | ${ok(p.h4c >= RHO_CORE)} |`,
  );
  const optional = r.se.filter((s) => s.optional);
  const widened = optional.filter((s) => s.core > s.full).length;
  const se = optional.map((s) => `| ${s.factor} | ${f3(s.full)} | ${f3(s.core)} | ${f3(s.core / s.full)} |`);
  return [
    "## H3 · Estabilidad ante ruido (±1 Likert en 10 % de los ítems)",
    "",
    "| Track | Spearman de puntajes | H3 | Jaccard del top-K | H3s |",
    "|---|---|---|---|---|",
    ...h3,
    "",
    `## H4 · Solo núcleo contra banco completo (${r.fullBank} personas con banco completo)`,
    "",
    "AUC del modelo con el perfil vuelto a puntuar **solo con el núcleo** contra la línea base calculada con el banco completo; etiqueta «similitud».",
    "",
    "| Track | Pares | AUC solo núcleo | AUC línea base | ΔAUC [IC 95 %] | p Holm | H4 | ρ(núcleo, completo) | H4c |",
    "|---|---|---|---|---|---|---|---|---|",
    ...h4,
    "",
    `### H4b · Los módulos ausentes amplían la incertidumbre: ${widened}/${optional.length} factores con módulo opcional → ${ok(widened === optional.length)}`,
    "",
    "| Factor | EE medio (banco completo) | EE medio (solo núcleo) | Razón |",
    "|---|---|---|---|",
    ...se,
    "",
  ];
}

export function renderValidation(r: ValidationResults): string {
  const hashes = Object.entries(r.hashes).map(([k, v]) => `\`${k}\` ${v}`).join(", ");
  return [
    "# Resultados de la validación sintética (generado)",
    "",
    "> Archivo generado por `npm run data:validate`. No editar a mano. Criterios en `docs/PREREGISTRO.md`.",
    "> **Datos sintéticos: validan el código y la sensibilidad, no el mundo real.**",
    "",
    `- Semilla ${r.seed}; ${r.population} perfiles; ${r.fullBank} con banco completo.`,
    `- Hash SHA-256 (16 hex, LF) de entradas: ${hashes}.`,
    "",
    ...h1Table(r),
    ...h2Table(r),
    ...h3h4(r),
    ...renderSecondary(r),
  ].join("\n");
}
