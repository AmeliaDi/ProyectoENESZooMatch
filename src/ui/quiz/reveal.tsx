"use client";

/**
 * The reveal: your sprite assembles cell by cell from the centre, then your
 * alias, type/wing in kind words and "cómo te vemos" appear. Skippable at any
 * moment; with reduced motion it is shown complete immediately.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import type { QuizSubmittedDto } from "@/contracts/result";
import { EXPERIENCE } from "@/config";
import { GRID_SIZE, getSpriteFrame } from "@/domain/avatars/pixel-sprites";
import { Button } from "@/ui/kit/button";

import { revealOrder } from "./reveal-order";

const ORDER = revealOrder(GRID_SIZE, EXPERIENCE.reveal.seed);
const DELAY_BY_CELL = new Map(ORDER.map((cell, rank) => [cell, rank]));

/** First two sentences of the narrative: "cómo te vemos" stays short. */
function firstSentences(text: string, count: number): string {
  const parts = text.match(/[^.!?]+[.!?]+/g) ?? [text];
  return parts.slice(0, count).join(" ").trim();
}

export function Reveal({
  profile,
  onContinue,
}: {
  profile: QuizSubmittedDto["profile"];
  onContinue: () => void;
}) {
  const sprite = useMemo(() => getSpriteFrame(profile.animal, profile.color, "happy", profile.mark), [profile]);
  const [skipped, setSkipped] = useState(false);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const step = EXPERIENCE.reveal.cellStepMs;
  const totalMs = ORDER.length * step;

  return (
    <section className="zm-reveal" data-skipped={skipped} aria-labelledby="reveal-title">
      <svg
        className="zm-reveal__sprite zm-crisp"
        viewBox={`0 0 ${GRID_SIZE} ${GRID_SIZE}`}
        role="img"
        aria-label={`Tu animalito: ${profile.animalName} ${profile.colorName}`}
      >
        {sprite.grid.flatMap((row, y) =>
          row.map((color, x) => {
            if (!color) return null;
            const rank = DELAY_BY_CELL.get(y * GRID_SIZE + x) ?? 0;
            const style = { animationDelay: `${rank * step}ms` } as CSSProperties;
            return (
              <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={color} style={style} />
            );
          }),
        )}
      </svg>

      <div className="zm-reveal__text" style={{ ["--reveal-after" as string]: `${totalMs}ms` }}>
        <p className="zm-eyebrow">Tu animalito</p>
        <h1 id="reveal-title" ref={headingRef} tabIndex={-1} className="zm-reveal__title">
          {profile.alias}
        </h1>
        <p className="zm-reveal__kind">
          {profile.animalName} {profile.colorName} · {profile.mbtiCode} ·{" "}
          {profile.enneagram.code === "—"
            ? profile.enneagram.arquetipo.toLowerCase()
            : `${profile.enneagram.code}, ${profile.enneagram.arquetipo.toLowerCase()}`}
        </p>
        <p className="zm-reveal__seen">
          <strong>Cómo te vemos.</strong> {firstSentences(profile.narrative, 2)}
        </p>
        <p className="zm-reveal__note">
          Tu silueta sale de tu MBTI; tu color y el emblema del pecho, de tu eneagrama. Es una lectura amable de
          tus respuestas, no una etiqueta fija.
        </p>
      </div>

      <div className="zm-reveal__actions">
        {!skipped ? (
          <Button variant="ghost" onClick={() => setSkipped(true)}>
            Saltar animación
          </Button>
        ) : null}
        <Button variant="primary" iconAfter="next" onClick={onContinue}>
          Ver mi constelación
        </Button>
      </div>
    </section>
  );
}
