/**
 * Transparency blocks shared by "Tu carta" and the detail sheet: how to read
 * the drawings and what we still do not know. Plain words, no promises.
 */
import Link from "next/link";

import type { ProfileDto } from "@/contracts/profile";
import { Frame } from "@/ui/kit/surfaces";

const SUBTYPE_WORDS: Record<"sp" | "so" | "sx", string> = {
  sp: "autoconservación: cuidar lo propio y lo seguro",
  so: "social: tu lugar en los grupos",
  sx: "uno a uno: los lazos intensos",
};

export const READING_GUIDE_COPY = {
  howTitle: "Cómo leer esto",
  how: "Cada estrella marca hacia dónde te inclinas comparado con otras personas que hicieron el test. El tramo tenue alrededor es el margen de duda: más respuestas lo hacen más corto.",
  unknownTitle: "Qué no sabemos todavía",
  unknown: "El modelo se calibró con datos simulados, no con parejas o amistades reales. La afinidad es una estimación que ordena posibilidades; no predice cómo les irá ni mide el valor de nadie.",
} as const;

export function ReadingGuide() {
  return (
    <Frame title={READING_GUIDE_COPY.howTitle} coord="AR 09h">
      <p className="zm-detail__muted">{READING_GUIDE_COPY.how}</p>
      <h3 className="zm-detail__h">{READING_GUIDE_COPY.unknownTitle}</h3>
      <p className="zm-detail__muted">{READING_GUIDE_COPY.unknown}</p>
      <p className="zm-detail__fine">
        <Link href="/evidencia">Lo que dice la evidencia</Link> · <Link href="/ajustes#como-se-calcula">Cómo se calcula</Link>
      </p>
    </Frame>
  );
}

export function EnneagramPlate({ profile }: { profile: ProfileDto }) {
  const { enneagram } = profile;
  const mark = profile.identity.mark;
  return (
    <Frame title="Tu eneagrama" coord="AR 05h">
      {enneagram.exploring ? (
        <p className="zm-detail__muted">
          Aún afinando: tus respuestas reparten su peso entre varios tipos, así que preferimos no elegir uno por ti.
          Tu animalito lleva un tono neutro mientras tanto.
        </p>
      ) : (
        <>
          <p className="zm-card__virtue-title">
            <span className="zm-num">{enneagram.code}</span> · {enneagram.name}
          </p>
          <p className="zm-detail__muted">{enneagram.archetype}. Habla de motivaciones, no de capacidades.</p>
        </>
      )}
      {mark ? <p className="zm-detail__fine">Subtipo: {SUBTYPE_WORDS[mark]}.</p> : null}
    </Frame>
  );
}
