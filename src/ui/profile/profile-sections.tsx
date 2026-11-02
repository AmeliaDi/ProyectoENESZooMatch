"use client";

/**
 * The readings, one collapsible atlas plate per area. HEXACO opens by
 * default (it is the core of the affinity); the rest stay folded so the card
 * is calm on mobile. Native <details> keeps keyboard and screen readers happy.
 */
import type { ProfileDto } from "@/contracts/profile";
import { Icon } from "@/ui/kit/icon";

import { ScaleRow } from "./scale-row";

const OPEN_BY_DEFAULT = new Set(["hexaco"]);

export function ProfileSections({ profile }: { profile: ProfileDto }) {
  const { open, total } = profile.openScales;
  return (
    <section className="zm-card__sections" aria-labelledby="carta-lecturas">
      <h2 id="carta-lecturas" className="zm-card__h">
        Tus lecturas
      </h2>
      {open > 0 ? (
        <p className="zm-box zm-quiz__note">
          {open} de {total} escalas siguen sin datos porque su módulo es opcional. Si un día quieres afinar tu perfil,
          contestar más reduce la duda; sin prisa y sin presión.
        </p>
      ) : null}
      {profile.sections.map((section) => (
        <details key={section.id} className="zm-box zm-box--frame zm-card__section" open={OPEN_BY_DEFAULT.has(section.id)}>
          <summary className="zm-card__summary">
            <Icon name="next" />
            <span>{section.title}</span>
          </summary>
          <p className="zm-detail__muted">{section.blurb}</p>
          <ul className="zm-scales">
            {section.scales.map((scale) => (
              <ScaleRow key={scale.key} reading={scale} />
            ))}
          </ul>
        </details>
      ))}
    </section>
  );
}
