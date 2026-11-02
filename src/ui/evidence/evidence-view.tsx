"use client";

/**
 * "/evidencia": what each part of ZooMatch rests on and what we do not know
 * yet, in friendly language. Static copy from `data/evidence-summary.json`;
 * the strength label is printed (never conveyed by colour alone).
 */
import Link from "next/link";

import { EVIDENCE_SUMMARY } from "@/config/evidence-summary";
import { AtlasShell } from "@/ui/kit/atlas-shell";
import { Frame } from "@/ui/kit/surfaces";

export function EvidenceView() {
  const s = EVIDENCE_SUMMARY;
  return (
    <AtlasShell plate="Lámina 08 · evidencia">
      <main className="zm-evidence">
        <h1 className="zm-evidence__h">Qué sabemos y qué no</h1>
        <p>{s.intro}</p>

        <Frame title="Cómo se calcula" coord="AR 13h">
          <ol className="zm-settings__steps">
            {s.how.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
        </Frame>

        <Frame title="En qué se apoya cada parte" coord="AR 14h">
          <ul className="zm-evidence__list">
            {s.layers.map((layer) => (
              <li key={layer.title} className="zm-evidence__row" data-strength={layer.strength}>
                <span className="zm-evidence__tag">{s.strength_labels[layer.strength]}</span>
                <strong>{layer.title}</strong>
                <p className="zm-detail__muted">{layer.text}</p>
              </li>
            ))}
          </ul>
        </Frame>

        <Frame title="Qué no sabemos todavía" coord="AR 15h">
          <ul className="zm-evidence__list">
            {s.unknowns.map((line) => (
              <li key={line} className="zm-evidence__row">
                <p>{line}</p>
              </li>
            ))}
          </ul>
        </Frame>

        <p className="zm-detail__muted">{s.closing}</p>
        <p>
          <Link href="/resultado">Volver a mi cielo</Link> · <Link href="/ajustes#como-se-calcula">Ajustes</Link>
        </p>
      </main>
    </AtlasShell>
  );
}
