/**
 * Quality of one track over the pairs somebody can still open. The axis is
 * the one the database builds, `z = (similitud − umbral) / (referencia − umbral)`,
 * so romance and friendship are comparable without inventing constants here:
 * `z = 0` is the track's own cut and `z = 1` its `reference_high`.
 *
 * Two columns live outside the boxes: `bajoUmbral` (pairs that exist but do
 * not clear the cut) and `sobreEje` (pairs past `z = 3`). With the 12 boxes
 * between them they partition `filas`, which is what the reconciliation test
 * checks — a chart that silently drops pairs would look fuller, not wronger.
 */
import type { TrackQuality } from "@/contracts/admin-metrics";

import { cellsFor } from "./pixel-bars";
import { safe } from "./k-anon";

/** Box width on the `z` axis — the same `0.25` the SQL calls `v_width`. */
export const BIN_WIDTH = 0.25;
/** Boxes before the overflow column, so the axis runs to `z = 3`. */
export const BIN_COUNT = 12;
/** `z = 1` is the left edge of this box: where the track's reference falls. */
export const REFERENCE_BIN = Math.round(1 / BIN_WIDTH);
/** Height of the tallest column, in pixel rows. */
export const HISTOGRAM_ROWS = 5;

const COLUMN = 2;
const ROW = 2;

/** True while the axis can be built at all; the config promises this, a payload may not. */
export function hasAxis(threshold: number, reference: number): boolean {
  return reference > threshold;
}

/**
 * Which box a similarity belongs to, exactly as `floor((sim − umbral) /
 * (referencia − umbral) / 0.25)::int` does. `-1` means "off the axis": under
 * the cut, or an axis that cannot be divided by. Returning `-1` for a broken
 * axis is what keeps a zero denominator out of the chart.
 */
export function binIndexOf(sim: number, threshold: number, reference: number): number {
  if (!hasAxis(threshold, reference) || sim < threshold) return -1;
  return Math.min(BIN_COUNT, Math.floor((sim - threshold) / (reference - threshold) / BIN_WIDTH));
}

/** Similarity range one box covers, for the label beside it. */
export function binLabel(i: number, threshold: number, reference: number): string {
  if (!hasAxis(threshold, reference)) return "eje no disponible";
  const step = (reference - threshold) * BIN_WIDTH;
  return `${(threshold + i * step).toFixed(4)} – ${(threshold + (i + 1) * step).toFixed(4)}`;
}

/** The similarity percentiles as text; `null` is a sample nobody answered, not a zero. */
export function simText(value: number | null): string {
  return value === null ? "—" : value.toFixed(4);
}

export interface HistogramColumn {
  key: string;
  label: string;
  count: number;
  tick: "umbral" | "referencia" | null;
}

/** The plotted columns, in axis order: under the cut, the 12 boxes, past the axis. */
export function histogramColumns(track: TrackQuality, threshold: number, reference: number): HistogramColumn[] {
  const filled = new Map(track.bins.map((bin) => [bin.i, bin.n]));
  const boxes: HistogramColumn[] = Array.from({ length: BIN_COUNT }, (_, i) => ({
    key: `b${i}`,
    label: binLabel(i, threshold, reference),
    count: filled.get(i) ?? 0,
    tick: i === 0 ? "umbral" : i === REFERENCE_BIN ? "referencia" : null,
  }));
  return [
    { key: "bajoUmbral", label: `Bajo el umbral (< ${threshold.toFixed(4)})`, count: track.bajoUmbral, tick: null },
    ...boxes,
    { key: "sobreEje", label: `Fuera del eje (z ≥ ${BIN_COUNT * BIN_WIDTH})`, count: track.sobreEje, tick: null },
  ];
}

/** Pairs of a track, counting every column of the chart once. */
export function plottedPairs(track: TrackQuality): number {
  return track.bajoUmbral + track.sobreEje + track.bins.reduce((sum, bin) => sum + bin.n, 0);
}

/** The last `z` the boxes reach, as a similarity: `z = 3` over the track's axis. */
export function axisEnd(threshold: number, reference: number): number {
  return threshold + BIN_COUNT * BIN_WIDTH * (reference - threshold);
}

/**
 * One line that says what the boxes mean, in the units the calibration uses.
 * A payload without a usable `reference_high` says so out loud: an axis cannot
 * be built from it, and a flat chart would look like a world without pairs.
 */
export function axisCaption(track: TrackQuality, threshold: number, reference: number | null): string {
  if (track.filas === 0) return "Sin parejas vivas en esta pista.";
  if (reference === null || !hasAxis(threshold, reference)) {
    return `${track.filas} parejas vivas · el payload no trae una referencia usable, así que no hay eje.`;
  }
  return `${track.filas} parejas vivas · eje de ${threshold.toFixed(4)} (corte) a ${axisEnd(threshold, reference).toFixed(4)}, con la referencia en ${reference.toFixed(4)}.`;
}

export function PixelHistogram({
  track,
  threshold,
  reference,
  tone,
}: {
  track: TrackQuality;
  threshold: number;
  reference: number | null;
  tone: "romance" | "amistad";
}) {
  const referencePoint = reference ?? threshold;
  const columns = histogramColumns(track, threshold, referencePoint);
  // A cell under the k floor is drawn as nothing, so it cannot set the scale either.
  const heights = columns.map((column) => safe(column.count));
  const max = Math.max(0, ...heights.map((h) => h.value));
  return (
    <div className="zm-hist">
      <p className="zm-detail__muted">{axisCaption(track, threshold, reference)}</p>
      <svg
        className="zm-hist__plot zm-crisp"
        data-tone={tone}
        aria-hidden="true"
        viewBox={`0 0 ${columns.length * COLUMN} ${HISTOGRAM_ROWS * ROW}`}
        preserveAspectRatio="none"
      >
        {heights.map((height, i) => {
          const on = cellsFor(height.value, max, HISTOGRAM_ROWS);
          return Array.from({ length: HISTOGRAM_ROWS }, (_, row) => (
            <rect
              key={`${columns[i]?.key}.${row}`}
              x={i * COLUMN}
              y={(HISTOGRAM_ROWS - 1 - row) * ROW}
              width={1}
              height={ROW}
              data-on={row < on}
            />
          ));
        })}
      </svg>
      <ul className="zm-hist__ticks" aria-hidden="true">
        {columns.map((column) => (
          <li key={column.key} className="zm-hist__tick" data-tick={column.tick ?? undefined}>
            {column.tick ?? ""}
          </li>
        ))}
      </ul>
      <p className="zm-detail__muted">
        Media <span className="zm-num">{simText(track.media)}</span> · mediana{" "}
        <span className="zm-num">{simText(track.p50)}</span> · p90{" "}
        <span className="zm-num">{simText(track.p90)}</span> · máx{" "}
        <span className="zm-num">{simText(track.max)}</span>
      </p>
      <table className="zm-contrast-table zm-admin__table">
        <caption className="zm-sr-only">
          {`Parejas de ${tone} por tramo de similitud sobre el eje normalizado`}
        </caption>
        <thead>
          <tr>
            <th scope="col">Tramo</th>
            <th scope="col">Parejas</th>
          </tr>
        </thead>
        <tbody>
          {columns.map((column) => (
            <tr key={column.key}>
              <th scope="row">{column.label}</th>
              <td>{safe(column.count).text}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
