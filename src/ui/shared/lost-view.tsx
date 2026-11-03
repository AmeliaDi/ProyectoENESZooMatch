"use client";

/**
 * Illustrated fallbacks for 404 and runtime errors: the lost little animal on
 * the usual pixel sky, plain words, a way home. Easter egg: tapping the
 * animal a few times makes it smile and say hello (and chime, if the person
 * turned sound on). Nothing is stored, nothing is tracked.
 */

import Link from "next/link";
import { useState, type ReactNode } from "react";

import { EXPERIENCE } from "@/config";
import { PixelAnimal } from "@/ui/constellation/PixelAnimal";
import { emitFeedback } from "@/ui/feedback/feedback";
import { AtlasShell } from "@/ui/kit/atlas-shell";
import { Icon } from "@/ui/kit/icon";
import { EmptyState, ErrorState } from "@/ui/kit/states";

const { animalId, colorId, artPx, easterEggTaps } = EXPERIENCE.notFound;

export const LOST_COPY = {
  notFoundTitle: "Esta estrella no está en el mapa",
  notFoundBody: "Puede que el enlace haya cambiado. Tu cielo sigue donde lo dejaste.",
  errorTitle: "Se nubló algo de nuestro lado",
  errorBody: "No fue nada que hicieras. Intenta de nuevo; tus respuestas siguen en este dispositivo.",
  home: "Volver al inicio",
  retry: "Intentar de nuevo",
  artLabel: "Animalito perdido",
  hello: "Hola. Gracias por quedarte un ratito conmigo.",
} as const;

/** True once the tap count reaches the configured threshold. */
export function easterEggAwake(taps: number, threshold: number = easterEggTaps): boolean {
  return taps >= threshold;
}

function LostAnimal() {
  const [taps, setTaps] = useState(0);
  const awake = easterEggAwake(taps);

  function tap() {
    const next = taps + 1;
    setTaps(next);
    if (easterEggAwake(next) && !awake) emitFeedback("join");
  }

  return (
    <>
      <button type="button" className="zm-lost__art" aria-label={LOST_COPY.artLabel} onClick={tap}>
        <PixelAnimal animalId={animalId} colorId={colorId} size={artPx} happy={awake} animated={!awake} />
      </button>
      <p className="zm-lost__hello" aria-live="polite">
        {awake ? LOST_COPY.hello : "\u00a0"}
      </p>
    </>
  );
}

function HomeLink() {
  return (
    <Link href="/" className="zm-box zm-btn zm-btn--secondary">
      <Icon name="home" />
      {LOST_COPY.home}
    </Link>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <AtlasShell plate="Lámina 00 · fuera del mapa">
      <main className="zm-lost">{children}</main>
    </AtlasShell>
  );
}

export function NotFoundView() {
  return (
    <Shell>
      <EmptyState title={LOST_COPY.notFoundTitle} body={LOST_COPY.notFoundBody} art={<LostAnimal />} action={<HomeLink />} />
    </Shell>
  );
}

export function ErrorView({ onRetry }: { onRetry: () => void }) {
  const actions = (
    <div className="zm-lost__actions">
      <button type="button" className="zm-box zm-btn zm-btn--primary" onClick={onRetry}>
        <Icon name="recenter" />
        {LOST_COPY.retry}
      </button>
      <HomeLink />
    </div>
  );
  return (
    <Shell>
      <ErrorState title={LOST_COPY.errorTitle} body={LOST_COPY.errorBody} art={<LostAnimal />} action={actions} />
    </Shell>
  );
}
