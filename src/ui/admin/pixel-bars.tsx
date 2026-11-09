/**
 * Minimal pixel bar chart for aggregated admin metrics: integer cells,
 * crisp edges, labelled values (so nothing is colour-only), and a table is
 * always rendered next to it for screen readers.
 */

export interface BarDatum {
  label: string;
  value: number;
}

/** The three tones the console uses; every other colour would break the palette guard. */
export type BarTone = "neutral" | "romance" | "amistad";

const CELLS = 24;

export function cellsFor(value: number, max: number, cells = CELLS): number {
  if (max <= 0 || value <= 0) return 0;
  return Math.max(1, Math.round((value / max) * cells));
}

export function PixelBars({ data, tone = "neutral" }: { data: readonly BarDatum[]; tone?: BarTone }) {
  const max = Math.max(0, ...data.map((d) => d.value));
  return (
    <ul className="zm-bars" data-tone={tone} aria-hidden="true">
      {data.map((d) => {
        const on = cellsFor(d.value, max);
        return (
          <li key={d.label} className="zm-bars__row">
            <span className="zm-bars__label">{d.label}</span>
            <svg className="zm-bars__track zm-crisp" viewBox={`0 0 ${CELLS * 2} 2`} preserveAspectRatio="none">
              {Array.from({ length: CELLS }, (_, i) => (
                <rect key={i} x={i * 2} y={0} width={1} height={2} data-on={i < on} />
              ))}
            </svg>
            <span className="zm-bars__value zm-num">{d.value}</span>
          </li>
        );
      })}
    </ul>
  );
}
