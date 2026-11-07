"use client";

/**
 * Sound and vibration in Ajustes: one master switch, a volume, three category
 * switches, the optional button tick, a quiet window and a test button. Every
 * control is a kit button with `role="switch"` so the state is announced by
 * `aria-checked` and never by colour alone. Turning sound on plays a sample
 * inside the click, which is the gesture the browser needs to allow audio.
 */

import { useId, useSyncExternalStore } from "react";

import { SOUND, SOUND_CATEGORIES, type SoundCategory, type SoundEventId } from "@/config";
import type { SoundPrefs } from "@/domain/audio/policy";
import type { IconName } from "@/ui/design/icons";
import { Button } from "@/ui/kit/button";
import { Icon } from "@/ui/kit/icon";

import { auditionSound, enableSoundPreview } from "./feedback";
import { prefersReducedMotion } from "./haptics";
import {
  getSoundPrefsServerSnapshot,
  getSoundPrefsSnapshot,
  subscribeSoundPrefs,
  writeSoundPrefs,
} from "./sound-prefs";

export const SOUND_COPY = {
  title: "Sonido y vibración",
  sound: "Soniditos",
  haptics: "Vibración corta",
  volume: "Volumen",
  categories: "Qué puede sonar",
  toque: "Toque de botones",
  quiet: "Horario de silencio",
  quietStart: "Desde",
  quietEnd: "Hasta",
  test: "Probar sonido",
  on: "Activado",
  off: "Apagado",
  hint: "Todo viene apagado y solo se guarda en este dispositivo. Son tonos cortos que sintetiza el navegador, sin archivos de audio.",
  reducedMotion: "Tu dispositivo pide menos movimiento, así que no vibraremos aunque lo actives.",
  noVibration: "Este navegador no vibra. El sonido sí funciona.",
  quietHint: "En este horario no suena nada, aunque tengas los soniditos activados.",
  toqueHint: "Un clic casi imperceptible al tocar botones. Va aparte porque no a todas las personas les gusta.",
  volumeHint: "Qué tan fuerte suena. Los tonos ya son suaves de por sí.",
  saved: "Listo, se guardó en este dispositivo.",
  notSaved: "No se pudo guardar aquí, pero funciona mientras no cierres la pestaña.",
} as const;

export function useSoundPrefs(): SoundPrefs {
  return useSyncExternalStore(subscribeSoundPrefs, getSoundPrefsSnapshot, getSoundPrefsServerSnapshot);
}

function useReducedMotionNow(): boolean {
  return useSyncExternalStore(
    (cb) => {
      if (typeof window.matchMedia !== "function") return () => undefined;
      const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
      mql.addEventListener("change", cb);
      return () => mql.removeEventListener("change", cb);
    },
    prefersReducedMotion,
    () => false,
  );
}

interface SwitchProps {
  label: string;
  icon: IconName;
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

function Switch({ label, icon, on, onToggle, disabled = false }: SwitchProps) {
  return (
    <Button
      variant="secondary"
      role="switch"
      aria-checked={on}
      icon={icon}
      className="zm-feedback__switch"
      onClick={onToggle}
      disabled={disabled}
    >
      <span>{label}</span>
      <span className="zm-feedback__state" aria-hidden="true">
        {on ? SOUND_COPY.on : SOUND_COPY.off}
      </span>
    </Button>
  );
}

const CATEGORY_ICONS: Readonly<Record<SoundCategory, IconName>> = Object.freeze({
  conexion: "chat",
  logros: "check",
  interfaz: "settings",
});

export function SoundSettings() {
  const prefs = useSoundPrefs();
  const labelId = useId();
  const volumeId = useId();
  const quietHintId = useId();
  const reduced = useReducedMotionNow();
  const canVibrate = typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

  function update(next: SoundPrefs) {
    writeSoundPrefs(next);
  }

  function toggle(key: "sound" | "haptics" | "toque") {
    const next = { ...prefs, [key]: !prefs[key] };
    update(next);
    if (key === "sound" && next.sound) enableSoundPreview();
  }

  function toggleCategory(category: SoundCategory) {
    update({ ...prefs, categories: { ...prefs.categories, [category]: !prefs.categories[category] } });
  }

  const percent = Math.round(prefs.volume * 100);

  return (
    <div className="zm-setting">
      <p id={labelId} className="zm-setting__label">
        {SOUND_COPY.title}
      </p>
      <p className="zm-detail__muted">{SOUND_COPY.hint}</p>

      <div role="group" aria-labelledby={labelId} className="zm-feedback__toggles">
        <Switch label={SOUND_COPY.sound} icon={prefs.sound ? "sound-on" : "sound-off"} on={prefs.sound} onToggle={() => toggle("sound")} />
        <Switch label={SOUND_COPY.haptics} icon="haptic" on={prefs.haptics} onToggle={() => toggle("haptics")} disabled={!canVibrate} />
      </div>

      {prefs.haptics && reduced ? <p className="zm-detail__muted">{SOUND_COPY.reducedMotion}</p> : null}
      {!canVibrate ? <p className="zm-detail__muted">{SOUND_COPY.noVibration}</p> : null}

      <div className="zm-sound__volume">
        <label htmlFor={volumeId} className="zm-setting__label">
          {SOUND_COPY.volume}
        </label>
        <div className="zm-sound__slider">
          <Icon name="sound-off" />
          <input
            id={volumeId}
            type="range"
            className="zm-sound__range"
            min={0}
            max={100}
            step={5}
            value={percent}
            disabled={!prefs.sound}
            aria-valuetext={`${percent} %`}
            onChange={(event) => update({ ...prefs, volume: Number(event.target.value) / 100 })}
          />
          <Icon name="sound-on" />
          <span className="zm-num zm-sound__value">{percent} %</span>
        </div>
        <p className="zm-detail__muted">{SOUND_COPY.volumeHint}</p>
      </div>

      <fieldset className="zm-sound__group" disabled={!prefs.sound}>
        <legend className="zm-setting__label">{SOUND_COPY.categories}</legend>
        <div className="zm-feedback__toggles">
          {SOUND_CATEGORIES.map((category) => (
            <Switch
              key={category}
              label={SOUND.categorias[category].nombre}
              icon={CATEGORY_ICONS[category]}
              on={prefs.categories[category]}
              onToggle={() => toggleCategory(category)}
            />
          ))}
        </div>
        <div className="zm-sound__toque">
          <Switch label={SOUND_COPY.toque} icon="next" on={prefs.toque} onToggle={() => toggle("toque")} />
          <p className="zm-detail__muted">{SOUND_COPY.toqueHint}</p>
        </div>
      </fieldset>

      <fieldset className="zm-sound__group" disabled={!prefs.sound} aria-describedby={quietHintId}>
        <legend className="zm-setting__label">{SOUND_COPY.quiet}</legend>
        <Switch
          label={SOUND_COPY.quiet}
          icon="pause"
          on={prefs.quiet.enabled}
          onToggle={() => update({ ...prefs, quiet: { ...prefs.quiet, enabled: !prefs.quiet.enabled } })}
        />
        <div className="zm-sound__hours">
          <label className="zm-sound__hour">
            <span>{SOUND_COPY.quietStart}</span>
            <input
              type="time"
              className="zm-box zm-sound__time"
              value={prefs.quiet.inicio}
              disabled={!prefs.quiet.enabled}
              onChange={(event) => update({ ...prefs, quiet: { ...prefs.quiet, inicio: event.target.value } })}
            />
          </label>
          <label className="zm-sound__hour">
            <span>{SOUND_COPY.quietEnd}</span>
            <input
              type="time"
              className="zm-box zm-sound__time"
              value={prefs.quiet.fin}
              disabled={!prefs.quiet.enabled}
              onChange={(event) => update({ ...prefs, quiet: { ...prefs.quiet, fin: event.target.value } })}
            />
          </label>
        </div>
        <p id={quietHintId} className="zm-detail__muted">{SOUND_COPY.quietHint}</p>
      </fieldset>

      <div className="zm-sound__test">
        <Button
          variant="secondary"
          icon="sound-on"
          disabled={!prefs.sound}
          onClick={() => enableSoundPreview("match_nuevo")}
        >
          {SOUND_COPY.test}
        </Button>
      </div>
    </div>
  );
}

/** Plays a sample from the dev gallery without touching the stored preference. */
export function previewSound(id: SoundEventId): void {
  auditionSound(id);
}