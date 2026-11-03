/**
 * The detail sheet's per-layer view (ADR-030):
 *  - "Por capa": your affinity with this person as constellation lines whose
 *    thickness (1–3) is the layer's real share of the score and whose band
 *    word (alta/media/baja) says how close you are there. Gold only on the
 *    strongest line. No numbers.
 *  - "Lo que eligió compartir": their opted-in readings as bands, or a calm
 *    note when they share nothing (the default).
 */
import type { LayerAffinityBand, SharedProfileDto, SharedScaleDto } from "@/contracts/result";

const BAND_WORDS: Record<LayerAffinityBand["band"], string> = { alta: "conectan mucho", media: "conectan bastante", baja: "aquí difieren" };
const STRENGTH_WORDS = ["", "aporta poco", "aporta", "aporta mucho"] as const;
const LINE_CELLS = 12;

function leaning(scale: SharedScaleDto): string {
  if (scale.confidence === "abierta") return "aún sin datos";
  if (scale.leaning === "bajo") return `más cerca de: ${scale.low}`;
  if (scale.leaning === "alto") return `más cerca de: ${scale.high}`;
  return "en equilibrio";
}

function LayerLine({ layer, top }: { layer: LayerAffinityBand; top: boolean }) {
  const lit = layer.band === "alta" ? LINE_CELLS : layer.band === "media" ? (LINE_CELLS * 2) / 3 : LINE_CELLS / 3;
  return (
    <li className="zm-layer" data-strength={layer.strength} data-top={top}>
      <span className="zm-layer__label">{layer.label}</span>
      <svg className="zm-layer__line zm-crisp" viewBox={`0 0 ${LINE_CELLS * 2} 3`} aria-hidden="true">
        <rect className="zm-layer__track" x={0} y={1} width={LINE_CELLS * 2} height={1} />
        <rect className="zm-layer__lit" x={0} y={3 - layer.strength} width={lit * 2} height={layer.strength} />
      </svg>
      <span className="zm-layer__words">
        {BAND_WORDS[layer.band]} · {STRENGTH_WORDS[layer.strength]}
      </span>
    </li>
  );
}

export function LayerAffinity({ layers, idPrefix }: { layers: readonly LayerAffinityBand[]; idPrefix: string }) {
  if (layers.length === 0) return null;
  return (
    <section aria-labelledby={`${idPrefix}-layers`}>
      <h3 id={`${idPrefix}-layers`} className="zm-detail__h">
        Por capa
      </h3>
      <p className="zm-detail__fine">El grosor de cada línea es lo que esa capa aporta a su afinidad.</p>
      <ul className="zm-layers">
        {layers.map((layer, i) => (
          <LayerLine key={layer.category} layer={layer} top={i === 0} />
        ))}
      </ul>
    </section>
  );
}

export function SharedReadings({ shared, idPrefix }: { shared: SharedProfileDto | undefined; idPrefix: string }) {
  const sections = shared?.sections ?? [];
  const nothing = !shared || (sections.length === 0 && !shared.mbti && !shared.enneagram);
  return (
    <section aria-labelledby={`${idPrefix}-shared`}>
      <h3 id={`${idPrefix}-shared`} className="zm-detail__h">
        Lo que eligió compartir
      </h3>
      {nothing ? (
        <p className="zm-detail__muted">Por ahora comparte solo su alias, su animalito y su color. Está bien así.</p>
      ) : (
        <>
          {shared.mbti || shared.enneagram ? (
            <p className="zm-detail__muted">
              {[shared.mbti ? `Ejes ${shared.mbti.code}` : null, shared.enneagram ? `Eneagrama ${shared.enneagram.code} · ${shared.enneagram.name}` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : null}
          {sections.map((section) => (
            <details key={section.id} className="zm-shared">
              <summary className="zm-shared__summary">{section.title}</summary>
              <ul className="zm-shared__list">
                {section.scales.map((scale) => (
                  <li key={scale.key}>
                    <strong>{scale.label}:</strong> {leaning(scale)}
                  </li>
                ))}
              </ul>
            </details>
          ))}
          <p className="zm-detail__fine">Siempre en bandas, nunca en números. Puede dejar de compartir cuando quiera.</p>
        </>
      )}
    </section>
  );
}
