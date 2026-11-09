/**
 * The daily pulse of the sky. Five strips share one day axis, each scaled to
 * its own largest day: a strip is a shape of activity, not a comparison of
 * magnitudes between events, and the number printed beside it says which.
 */
import type { MetricsPoint } from "@/contracts/admin-metrics";

import { sumOf } from "./k-anon";

export const SERIES_LEVELS = 4;

/** The events, in the order the life of an account goes through them. */
export const SERIES_EVENTS = [
  { key: "altas", label: "Altas" },
  { key: "encuestas", label: "Encuestas" },
  { key: "eclosiones", label: "Eclosiones" },
  { key: "pausas", label: "En pausa" },
  { key: "bajas", label: "Bajas" },
] as const;

export type SeriesKey = (typeof SERIES_EVENTS)[number]["key"];

/**
 * Pixels filled for one day: `ceil`, so the busiest day of a strip is always
 * a whole column and a day with a single event is never an empty cell. A zero
 * max (a window with nothing in it) draws nothing instead of dividing by zero.
 */
export function levelFor(value: number, max: number, levels = SERIES_LEVELS): number {
  if (max <= 0 || value <= 0) return 0;
  return Math.min(levels, Math.max(1, Math.ceil((value / max) * levels)));
}

export function totalOf(points: readonly MetricsPoint[], key: SeriesKey): number {
  return sumOf(points.map((p) => p[key]));
}

export function maxOf(points: readonly MetricsPoint[], key: SeriesKey): number {
  return points.reduce((highest, p) => Math.max(highest, p[key]), 0);
}

/** One week of the window, oldest first: the rows a screen reader gets. */
export function weekly(points: readonly MetricsPoint[], size = 7): Array<Omit<MetricsPoint, "day"> & { desde: string; hasta: string }> {
  const groups: Array<Omit<MetricsPoint, "day"> & { desde: string; hasta: string }> = [];
  for (let start = 0; start < points.length; start += size) {
    const slice = points.slice(start, start + size);
    groups.push({
      desde: slice[0]?.day ?? "",
      hasta: slice[slice.length - 1]?.day ?? "",
      altas: totalOf(slice, "altas"),
      encuestas: totalOf(slice, "encuestas"),
      eclosiones: totalOf(slice, "eclosiones"),
      pausas: totalOf(slice, "pausas"),
      bajas: totalOf(slice, "bajas"),
    });
  }
  return groups;
}

const COLUMN = 2;
const ROW = 2;

export function PixelSeries({ points, desde, hasta }: { points: readonly MetricsPoint[]; desde: string | null; hasta: string | null }) {
  const days = points.length;
  return (
    <div className="zm-series">
      <p className="zm-detail__muted">
        {days === 0
          ? "Sin días en esta ventana."
          : `${days} días · del ${desde ?? points[0]?.day} al ${hasta ?? points[days - 1]?.day}, en UTC.`}
      </p>
      <ul className="zm-series__list">
        {SERIES_EVENTS.map((event) => {
          const max = maxOf(points, event.key);
          return (
            <li key={event.key} className="zm-series__row">
              <span className="zm-series__label">{event.label}</span>
              <svg
                className="zm-series__strip zm-crisp"
                data-tone={event.key}
                aria-hidden="true"
                viewBox={`0 0 ${Math.max(days, 1) * COLUMN} ${SERIES_LEVELS * ROW}`}
                preserveAspectRatio="none"
              >
                {points.map((point, i) => {
                  const level = levelFor(point[event.key], max);
                  if (level === 0) return null;
                  return (
                    <rect
                      key={point.day}
                      x={i * COLUMN}
                      y={(SERIES_LEVELS - level) * ROW}
                      width={1}
                      height={level * ROW}
                      data-level={level}
                    />
                  );
                })}
              </svg>
              <span className="zm-series__total zm-num">{totalOf(points, event.key)}</span>
            </li>
          );
        })}
      </ul>
      <table className="zm-contrast-table zm-admin__table">
        <caption className="zm-sr-only">Actividad por semana</caption>
        <thead>
          <tr>
            <th scope="col">Semana</th>
            {SERIES_EVENTS.map((event) => (
              <th key={event.key} scope="col">{event.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weekly(points).map((group) => (
            <tr key={group.desde}>
              <th scope="row">{group.desde === group.hasta ? group.desde : `${group.desde} a ${group.hasta}`}</th>
              {SERIES_EVENTS.map((event) => (
                <td key={event.key}>{group[event.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
