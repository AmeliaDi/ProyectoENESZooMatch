"use client";

/**
 * The reveal (Fase 4).
 *
 * Hatched: the sprite assembles cell by cell from the centre, then the frozen
 * identity card appears — full alias, colour, MBTI, Enneagram in kind words and
 * "cómo te vemos". Egg: the cascarón with its crack stage and how much of the
 * core is still missing; no name is shown, because there is none yet.
 *
 * Skippable with one tap, announced through `aria-live`, silent by default, and
 * the animation plays exactly once: `POST /api/identity/revealed` consumes the
 * flag even if the tab closed mid-animation. Under `prefers-reduced-motion`
 * only opacity fades, and the card appears complete immediately.
 */

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import type { QuizSubmittedDto } from "@/contracts/result";
import { EXPERIENCE } from "@/config";
import { GRID_SIZE, getSpriteFrame } from "@/domain/avatars/pixel-sprites";
import { formatIdentity } from "@/domain/identity/format-identity";
import { PixelAnimal } from "@/ui/constellation/PixelAnimal";
import { useReducedMotionPreference } from "@/ui/constellation/hooks";
import { PixelEgg } from "@/ui/kit/pixel-egg";
import { Button } from "@/ui/kit/button";

import { revealOrder } from "./reveal-order";

const ORDER = revealOrder(GRID_SIZE, EXPERIENCE.reveal.seed);
const DELAY_BY_CELL = new Map(ORDER.map((cell, rank) => [cell, rank]));

/** First two sentences of the narrative: "cómo te vemos" stays short. */
function firstSentences(text: string, count: number): string {
  const parts = text.match(/[^.!?]+[.!?]+/g) ?? [text];
  return parts.slice(0, count).join(" ").trim();
}

function Sprite({ profile }: { profile: QuizSubmittedDto["profile"] }) {
  const { identity } = profile;
  const name = formatIdentity(identity);
  const sprite = useMemo(
    () =>
      identity.animalId && identity.colorId
        ? getSpriteFrame(identity.animalId, identity.colorId, "happy", identity.mark)
        : null,
    [identity],
  );

  if (!sprite) {
    return (
      <PixelEgg
        seed={identity.huevitoSeed}
        progressPercent={profile.progressPercent}
        size={176}
        ariaLabel={name.ariaLabel}
      />
    );
  }

  return (
    <svg
      className="zm-reveal__sprite zm-crisp"
      viewBox={`0 0 ${GRID_SIZE} ${GRID_SIZE}`}
      role="img"
      aria-label={name.ariaLabel}
    >
      {sprite.grid.flatMap((row, y) =>
        row.map((color, x) => {
          if (!color) return null;
          const rank = DELAY_BY_CELL.get(y * GRID_SIZE + x) ?? 0;
          const style = { animationDelay: `${rank * EXPERIENCE.reveal.cellStepMs}ms` } as CSSProperties;
          return <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={color} style={style} />;
        }),
      )}
    </svg>
  );
}

/**
 * The one-time flag is consumed as soon as the reveal of a hatched identity
 * mounts. A huevito has no name to reveal, so it never spends the flag.
 */
function useConsumeReveal(hatched: boolean, animated: boolean) {
  const [justRevealed, setJustRevealed] = useState(animated);
  const sent = useRef(false);

  useEffect(() => {
    if (!hatched || sent.current) return;
    sent.current = true;
    fetch("/api/identity/revealed", { method: "POST", cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return;
        const body: unknown = await res.json();
        if (body && typeof body === "object" && "justRevealed" in body) {
          setJustRevealed(body.justRevealed === true);
        }
      })
      .catch(() => undefined);
  }, [hatched]);

  return justRevealed;
}

export function Reveal({
  profile,
  onContinue,
}: {
  profile: QuizSubmittedDto["profile"];
  onContinue: () => void;
}) {
  const { identity } = profile;
  const name = formatIdentity(identity);
  const hatched = identity.estadoIdentidad === "eclosionado";
  const reduced = useReducedMotionPreference();
  const animated = useConsumeReveal(hatched, hatched && !reduced);
  const [skipped, setSkipped] = useState(false);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const step = EXPERIENCE.reveal.cellStepMs;
  const totalMs = ORDER.length * step;
  const play = animated && !skipped;

  if (!hatched) {
    return (
      <section className="zm-reveal" aria-labelledby="reveal-title">
        <Sprite profile={profile} />
        <div className="zm-reveal__text" aria-live="polite">
          <p className="zm-eyebrow">Tu huevito</p>
          <h1 id="reveal-title" ref={headingRef} tabIndex={-1} className="zm-reveal__title">
            Todavía es un huevito
          </h1>
          <p className="zm-reveal__kind">
            Guardamos tus respuestas y le hicimos un nombre fijo a tu perfil apenas termines el test principal.
            Vas {profile.progressPercent} % — te falta un poquito más.
          </p>
          <p className="zm-reveal__note">
            Nadie más puede ver tu huevito ni cruzarse contigo todavía. No hay prisa: cuando quieras, vuelve al
            cuestionario y lo terminas.
          </p>
        </div>
        <div className="zm-reveal__actions">
          <Link href="/cuestionario" className="zm-box zm-btn zm-btn--primary">
            Seguir con el test
          </Link>
          <Button variant="ghost" onClick={onContinue}>
            Volver más tarde
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="zm-reveal" data-skipped={skipped} data-play={play} aria-labelledby="reveal-title">
      {play ? <Sprite profile={profile} /> : <PixelAnimal animalId={identity.animalId ?? ""} colorId={identity.colorId ?? ""} mark={identity.mark} size={176} />}

      <div
        className="zm-reveal__text"
        style={{ ["--reveal-after" as string]: `${totalMs}ms` }}
        aria-live={play ? "polite" : undefined}
      >
        <p className="zm-eyebrow">Tu animalito</p>
        <h1 id="reveal-title" ref={headingRef} tabIndex={-1} className="zm-reveal__title">
          {name.title}
        </h1>
        <p className="zm-reveal__kind">
          {name.shortName} · {profile.mbtiCode} ·{" "}
          {profile.enneagram.code === "—"
            ? profile.enneagram.arquetipo.toLowerCase()
            : `${profile.enneagram.code}, ${profile.enneagram.arquetipo.toLowerCase()}`}
        </p>
        <p className="zm-reveal__seen">
          <strong>Cómo te vemos.</strong> {firstSentences(profile.narrative, 2)}
        </p>
        <p className="zm-reveal__note">
          Este nombre es fijo: ya no cambia, aunque completes más módulos. Tu silueta sale de tu MBTI y tu color de
          tu eneagrama; es una lectura amable de tus respuestas, no una etiqueta que te encierre.
        </p>
      </div>

      <div className="zm-reveal__actions">
        {play ? (
          <Button variant="ghost" onClick={() => setSkipped(true)}>
            Saltar animación
          </Button>
        ) : null}
        <Link href="/perfil" className="zm-box zm-btn zm-btn--secondary">
          Ver mi carta
        </Link>
        <Button variant="primary" iconAfter="next" onClick={onContinue}>
          Ver mi constelación
        </Button>
      </div>
    </section>
  );
}
