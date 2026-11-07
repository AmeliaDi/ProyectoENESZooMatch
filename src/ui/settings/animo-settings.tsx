"use client";

/**
 * Settings section for the animo companion messages. Lets the person choose
 * how often their pixel animal companion sends a warm message, and preview
 * one on demand. All state lives in localStorage (no server round-trip).
 *
 * Copy is in Spanish (es-MX), warm tone, no pressure or guilt language.
 * Touch targets meet the 44px minimum (--zm-touch).
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { ANIMO_CATALOG } from "@/config/animo";
import type { AnimoFrecuencia } from "@/domain/animo/animo-context";
import type { AnimoMessage } from "@/domain/animo/pick-animo-message";
import { readAnimoFrequency, writeAnimoFrequency } from "@/ui/animo/use-animo-message";
import { AnimoBubble } from "@/ui/animo/animo-bubble";
import { Button } from "@/ui/kit/button";

const FREQUENCY_OPTIONS: ReadonlyArray<{ value: AnimoFrecuencia; label: string; hint: string }> = Object.freeze([
  { value: "cada_sesion", label: "Cada sesion", hint: "Una vez cada vez que abres tu cielo." },
  { value: "diaria", label: "Diaria", hint: "Una vez al dia, ni mas ni menos." },
  { value: "semanal", label: "Semanal", hint: "Una vez por semana, con calma." },
  { value: "off", label: "Desactivado", hint: "Tu animalito descansa cuando tu quieras." },
]);

const ANIMO_COPY = {
  title: "Mensajes de tu animalito",
  hint: "Tu companero pixel te manda un mensajito calido cuando entras a tu cielo. Tu decides con que frecuencia.",
  frequency: "Frecuencia",
  preview: "Mostrar ahora",
  previewHint: "Mira como se ve un mensajito de tu animalito.",
  saved: "Listo, se guardo en este dispositivo.",
} as const;

/** Pick a message from the catalog using a simple counter for variety. */
function pickPreviewMessage(counter: number): AnimoMessage | null {
  const genericos = ANIMO_CATALOG.mensajes.filter((m) => m.categoria === "generico");
  const pool = genericos.length > 0 ? genericos : [...ANIMO_CATALOG.mensajes];
  if (pool.length === 0) return null;
  return pool[counter % pool.length] ?? null;
}

export function AnimoSetting() {
  const groupId = useId();
  const [frequency, setFrequency] = useState<AnimoFrecuencia>(readAnimoFrequency);
  const [saved, setSaved] = useState(false);
  const [preview, setPreview] = useState<AnimoMessage | null>(null);
  const counterRef = useRef(0);

  const changeFrequency = useCallback((next: AnimoFrecuencia) => {
    setFrequency(next);
    writeAnimoFrequency(next);
    setSaved(true);
  }, []);

  // Clear the "saved" confirmation after a few seconds.
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 2500);
    return () => clearTimeout(timer);
  }, [saved]);

  const handlePreview = useCallback(() => {
    counterRef.current += 1;
    setPreview(pickPreviewMessage(counterRef.current));
  }, []);

  const dismissPreview = useCallback(() => {
    setPreview(null);
  }, []);

  return (
    <div className="zm-setting">
      <p id={groupId} className="zm-setting__label">{ANIMO_COPY.title}</p>
      <p className="zm-detail__muted">{ANIMO_COPY.hint}</p>

      <fieldset className="zm-animo-freq" aria-labelledby={groupId}>
        <legend className="zm-sr-only">{ANIMO_COPY.frequency}</legend>
        <div className="zm-animo-freq__options" role="radiogroup" aria-label={ANIMO_COPY.frequency}>
          {FREQUENCY_OPTIONS.map((opt) => {
            const checked = frequency === opt.value;
            return (
              <label key={opt.value} className="zm-animo-freq__option">
                <input
                  type="radio"
                  name="animo-frequency"
                  value={opt.value}
                  checked={checked}
                  onChange={() => changeFrequency(opt.value)}
                  className="zm-sr-only"
                />
                <span
                  className="zm-animo-freq__btn"
                  data-selected={checked}
                  role="radio"
                  aria-checked={checked}
                  tabIndex={checked ? 0 : -1}
                >
                  <span className="zm-animo-freq__check" aria-hidden="true" data-on={checked} />
                  <span className="zm-animo-freq__text">
                    <span className="zm-animo-freq__label">{opt.label}</span>
                    <span className="zm-detail__muted zm-animo-freq__hint">{opt.hint}</span>
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="zm-animo-freq__preview">
        <AnimoBubble message={preview} onDismiss={dismissPreview}>
          <span aria-hidden="true" />
        </AnimoBubble>
        <Button
          variant="secondary"
          icon="sound-on"
          onClick={handlePreview}
          aria-label={ANIMO_COPY.preview}
        >
          {ANIMO_COPY.preview}
        </Button>
        <p className="zm-detail__muted">{ANIMO_COPY.previewHint}</p>
      </div>

      <p role="status" aria-live="polite" className="zm-settings__message">
        {saved ? ANIMO_COPY.saved : "\u00A0"}
      </p>
    </div>
  );
}
