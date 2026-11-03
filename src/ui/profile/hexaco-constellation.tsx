"use client";

/**
 * HEXACO as a six-star constellation (ADR-030). Each spoke is a factor; the
 * star sits at the estimate and the faint segment is the uncertainty band.
 * Tapping a factor shows its everyday line. The table below the drawing is
 * the text alternative (screen readers and anyone who prefers words).
 */
import { useId, useState } from "react";

import type { ScaleReadingDto } from "@/contracts/profile";

import { HEX_CENTER, HEX_GRID, hexStars, polygonPoints } from "./hexaco-geometry";
import { leaningText } from "./scale-row";

const CONFIDENCE_WORDS: Record<ScaleReadingDto["confidence"], string> = {
  clara: "clara",
  tentativa: "tentativa",
  abierta: "aún sin datos",
};

function describe(scales: readonly ScaleReadingDto[]): string {
  return scales.map((s) => `${s.label}: ${leaningText(s).toLowerCase()}`).join(". ");
}

function Drawing({ scales, selected }: { scales: readonly ScaleReadingDto[]; selected: string | null }) {
  const stars = hexStars(scales);
  return (
    <svg className="zm-hex__svg zm-crisp" viewBox={`0 0 ${HEX_GRID} ${HEX_GRID}`} aria-hidden="true">
      <polygon className="zm-hex__frame" points={polygonPoints(stars.map((s) => s.vertex))} />
      {stars.map((s) => (
        <line key={`${s.key}-spoke`} className="zm-hex__spoke" x1={HEX_CENTER.x} y1={HEX_CENTER.y} x2={s.vertex.x} y2={s.vertex.y} />
      ))}
      <polygon className="zm-hex__shape" points={polygonPoints(stars.map((s) => s.star))} />
      {stars.map((s) => (
        <g key={s.key} data-open={s.open} data-selected={selected === s.key}>
          {!s.open ? <line className="zm-hex__band" x1={s.bandFrom.x} y1={s.bandFrom.y} x2={s.bandTo.x} y2={s.bandTo.y} /> : null}
          <rect className="zm-hex__star" x={s.star.x - 1} y={s.star.y - 1} width={3} height={3} />
        </g>
      ))}
    </svg>
  );
}

export function HexacoConstellation({ scales }: { scales: readonly ScaleReadingDto[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const hintId = useId();
  const current = scales.find((s) => s.key === selected) ?? null;
  return (
    <figure className="zm-hex">
      <Drawing scales={scales} selected={selected} />
      <figcaption className="zm-sr-only">Constelación de seis rasgos. {describe(scales)}</figcaption>
      <ul className="zm-hex__keys" aria-label="Toca un rasgo para leer qué significa">
        {scales.map((s) => (
          <li key={s.key}>
            <button
              type="button"
              className="zm-box zm-chip zm-hex__key"
              aria-pressed={selected === s.key}
              aria-controls={hintId}
              onClick={() => setSelected(selected === s.key ? null : s.key)}
            >
              {s.label}
            </button>
          </li>
        ))}
      </ul>
      <p id={hintId} className="zm-detail__muted zm-hex__hint" aria-live="polite">
        {current ? `${current.hint ?? current.label}. ${leaningText(current)} (${CONFIDENCE_WORDS[current.confidence]}).` : "Toca un rasgo para leer qué significa."}
      </p>
      <details className="zm-hex__alt">
        <summary className="zm-hex__alt-summary">Ver como tabla</summary>
      <table className="zm-hex__table">
        <caption className="zm-sr-only">Tus seis rasgos en palabras</caption>
        <thead>
          <tr>
            <th scope="col">Rasgo</th>
            <th scope="col">Hacia dónde te inclinas</th>
            <th scope="col">Estimación</th>
          </tr>
        </thead>
        <tbody>
          {scales.map((s) => (
            <tr key={s.key}>
              <th scope="row">{s.label}</th>
              <td>{leaningText(s)}</td>
              <td>{CONFIDENCE_WORDS[s.confidence]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </details>
    </figure>
  );
}
