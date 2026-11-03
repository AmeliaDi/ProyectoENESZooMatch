/**
 * One reading as a pixel track between two poles: faint cells = uncertainty
 * band, the bright cell = estimate. No percentiles are printed (celebrate, do
 * not rank); the text says which pole it leans to and how sure we are, so
 * nothing depends on colour alone.
 */
import type { ScaleReadingDto } from "@/contracts/profile";

export const TRACK_CELLS = 24;

const CONFIDENCE_COPY: Record<ScaleReadingDto["confidence"], string> = {
  clara: "estimación clara",
  tentativa: "estimación tentativa",
  abierta: "aún sin datos",
};

export function cellOf(position: number, cells = TRACK_CELLS): number {
  return Math.min(cells - 1, Math.max(0, Math.floor(position * cells)));
}

export function leaningText(reading: ScaleReadingDto): string {
  if (reading.confidence === "abierta") return "Contesta este módulo para afinarlo";
  if (reading.leaning === "bajo") return `Más cerca de: ${reading.low}`;
  if (reading.leaning === "alto") return `Más cerca de: ${reading.high}`;
  return "En equilibrio entre ambos polos";
}

export function ScaleRow({ reading }: { reading: ScaleReadingDto }) {
  const marker = cellOf(reading.position);
  const [from, to] = [cellOf(reading.range[0]), cellOf(reading.range[1])];
  const open = reading.confidence === "abierta";
  return (
    <li className="zm-scale" data-confidence={reading.confidence}>
      <div className="zm-scale__head">
        <span className="zm-scale__label">{reading.label}</span>
        <span className="zm-scale__confidence">{CONFIDENCE_COPY[reading.confidence]}</span>
      </div>
      <svg
        className="zm-scale__track zm-crisp"
        viewBox={`0 0 ${TRACK_CELLS * 2} 4`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <rect className="zm-scale__mid" x={TRACK_CELLS - 0.5} y={0} width={1} height={4} />
        {Array.from({ length: TRACK_CELLS }, (_, i) => (
          <rect
            key={i}
            x={i * 2}
            y={1}
            width={1}
            height={2}
            data-band={!open && i >= from && i <= to}
            data-on={!open && i === marker}
          />
        ))}
      </svg>
      <div className="zm-scale__poles" aria-hidden="true">
        <span>{reading.low}</span>
        <span>{reading.high}</span>
      </div>
      <p className="zm-scale__reading">{leaningText(reading)}</p>
    </li>
  );
}
