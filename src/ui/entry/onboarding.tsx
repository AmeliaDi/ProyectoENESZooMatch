"use client";

import { useEffect, useRef, useState } from "react";

import { EXPERIENCE, QUIZ_ITEMS } from "@/config";
import type { IconName } from "@/ui/design/icons";
import { Button } from "@/ui/kit/button";
import { Icon } from "@/ui/kit/icon";

const MINUTES = Math.max(1, Math.round((QUIZ_ITEMS.length * EXPERIENCE.quiz.secondsPerItem) / 60));

interface Plate {
  icon: IconName;
  title: string;
  body: string;
}

export const ONBOARDING_PLATES: readonly Plate[] = [
  {
    icon: "quiz",
    title: "Qué es el test",
    body: `${QUIZ_ITEMS.length} frases cortas, unos ${MINUTES} minutos. No hay respuestas buenas ni malas; puedes pausar y volver cuando quieras.`,
  },
  {
    icon: "privacy",
    title: "Qué significa anónimo",
    body: "Nadie ve tu matrícula ni tus respuestas. Te ven solo como un animalito con un alias que tú no tienes que inventar.",
  },
  {
    icon: "info",
    title: "Qué es (y qué no)",
    body: "Es un proyecto estadístico: estima afinidades, no predice relaciones. Nunca es una medida de tu valor.",
  },
];

export function hasSeenOnboarding(): boolean {
  try {
    return window.localStorage.getItem(EXPERIENCE.onboarding.storageKey) === "1";
  } catch {
    return true;
  }
}

function markSeen(): void {
  try {
    window.localStorage.setItem(EXPERIENCE.onboarding.storageKey, "1");
  } catch {
    // Private mode: it will simply show again next time.
  }
}

/** Three plates of the atlas, skippable at any point; focus moves with them. */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const plate = ONBOARDING_PLATES[index] ?? ONBOARDING_PLATES[0]!;
  const last = index === ONBOARDING_PLATES.length - 1;

  useEffect(() => {
    titleRef.current?.focus();
  }, [index]);

  function finish() {
    markSeen();
    onDone();
  }

  return (
    <section className="zm-onboarding" aria-roledescription="presentación" aria-label="Cómo funciona">
      <div className="zm-box zm-box--frame zm-onboarding__plate" key={index}>
        <Icon name={plate.icon} scale={3} filled />
        <p className="zm-eyebrow">
          Lámina {index + 1} de {ONBOARDING_PLATES.length}
        </p>
        <h1 ref={titleRef} tabIndex={-1} className="zm-onboarding__title">
          {plate.title}
        </h1>
        <p className="zm-onboarding__body">{plate.body}</p>
        <ol className="zm-onboarding__dots" aria-hidden="true">
          {ONBOARDING_PLATES.map((_, dot) => (
            <li key={dot} data-on={dot <= index} />
          ))}
        </ol>
      </div>
      <div className="zm-onboarding__actions">
        <Button variant="ghost" onClick={finish}>
          Saltar
        </Button>
        {index > 0 ? (
          <Button variant="secondary" icon="back" onClick={() => setIndex(index - 1)}>
            Atrás
          </Button>
        ) : null}
        <Button
          variant="primary"
          iconAfter={last ? "check" : "next"}
          onClick={() => (last ? finish() : setIndex(index + 1))}
        >
          {last ? "Empezar el test" : "Siguiente"}
        </Button>
      </div>
    </section>
  );
}
