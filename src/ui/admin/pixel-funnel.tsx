/**
 * Participation funnel. The four steps are a sequence — each one is a subset
 * of the person before it — and the last two lines branch from `presentes`
 * instead of following each other, because a person can hold both an
 * intimacy affinity and a friendship one. Every step counts only accounts
 * that are still in the sky.
 */
import type { Funnel } from "@/contracts/admin-metrics";

import { cellsFor } from "./pixel-bars";

export const FUNNEL_STEPS = [
  { key: "registradas", label: "Registradas" },
  { key: "conEncuesta", label: "Con encuesta completa" },
  { key: "eclosionados", label: "Con identidad fijada" },
  { key: "presentes", label: "Presentes" },
] as const;

export const FUNNEL_BRANCHES = [
  { key: "conRomance", label: "con afinidad de romance" },
  { key: "conAmistad", label: "con afinidad de amistad" },
] as const;

export type FunnelKey = (typeof FUNNEL_STEPS)[number]["key"] | (typeof FUNNEL_BRANCHES)[number]["key"];

/** Percent of the top of the funnel; an empty sky is 0, never `NaN`. */
export function shareOf(value: number, top: number): number {
  if (top <= 0) return 0;
  return Math.round((value / top) * 100);
}

/**
 * What survived from the step before, or `null` when there was no step before
 * to survive from. `null` prints as a dash: a rate of nobody is not a rate
 * of zero, and the panel must not claim everybody left.
 */
export function stepRate(value: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round((value / previous) * 100);
}

/** Cells in a step bar: the top of the funnel is always a full row. */
export const FUNNEL_CELLS = 20;

export interface FunnelRow {
  key: FunnelKey;
  label: string;
  count: number;
  /** The population this row is a slice of: the step before it, or `presentes` for a branch. */
  of: number | null;
}

/** The four steps and then the two branches, so the bars and the table read one list. */
export function funnelRows(funnel: Funnel): FunnelRow[] {
  const steps = FUNNEL_STEPS.map((step, i) => ({
    key: step.key,
    label: step.label,
    count: funnel[step.key],
    of: i === 0 ? null : funnel[FUNNEL_STEPS[i - 1]!.key],
  }));
  const branches = FUNNEL_BRANCHES.map((branch) => ({
    key: branch.key,
    label: `Presentes ${branch.label}`,
    count: funnel[branch.key],
    of: funnel.presentes,
  }));
  return [...steps, ...branches];
}

export function PixelFunnel({ funnel }: { funnel: Funnel }) {
  const top = funnel.registradas;
  const rows = funnelRows(funnel);
  const steps = rows.slice(0, FUNNEL_STEPS.length);
  return (
    <div className="zm-funnel">
      <ul className="zm-funnel__list" aria-hidden="true">
        {steps.map((row) => {
          const rate = stepRate(row.count, row.of ?? 0);
          const lost = row.of === null ? null : row.of - row.count;
          return (
            <li key={row.key} className="zm-funnel__row">
              <span className="zm-funnel__label">{row.label}</span>
              <svg className="zm-funnel__track zm-crisp" viewBox={`0 0 ${FUNNEL_CELLS * 2} 2`} preserveAspectRatio="none">
                {Array.from({ length: FUNNEL_CELLS }, (_, cell) => (
                  <rect key={cell} x={cell * 2} y={0} width={1} height={2} data-on={cell < cellsFor(row.count, top, FUNNEL_CELLS)} />
                ))}
              </svg>
              <span className="zm-funnel__count zm-num">{row.count}</span>
              <span className="zm-funnel__share zm-num">{shareOf(row.count, top)} %</span>
              <span className="zm-funnel__step zm-num">
                {row.of === null || rate === null ? "—" : `${rate} %${lost !== null && lost > 0 ? ` · −${lost}` : ""}`}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="zm-funnel__branches">
        De las <span className="zm-num">{funnel.presentes}</span> presentes:{" "}
        {FUNNEL_BRANCHES.map((branch, i) => (
          <span key={branch.key}>
            {i > 0 ? " y " : ""}
            <span className="zm-num">{funnel[branch.key]}</span> {branch.label} (
            <span className="zm-num">{shareOf(funnel[branch.key], funnel.presentes)} %</span>)
          </span>
        ))}
        .
      </p>
      <table className="zm-contrast-table zm-admin__table">
        <caption className="zm-sr-only">Embudo de participación</caption>
        <thead>
          <tr>
            <th scope="col">Paso</th>
            <th scope="col">Personas</th>
            <th scope="col">% del inicio</th>
            <th scope="col">% del paso anterior</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row">{row.label}</th>
              <td>{row.count}</td>
              <td>{shareOf(row.count, top)} %</td>
              <td>{row.of === null ? "—" : `${stepRate(row.count, row.of) ?? "—"} %`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
