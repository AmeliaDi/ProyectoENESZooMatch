"use client";

/**
 * Two on/off switches for Ajustes: soft "chip" sound and short vibration.
 * Both off by default; the preference lives only on this device. Turning one
 * on plays a sample right away (inside the click, so the browser allows audio)
 * and the state is never colour-only: the icon and the label change too.
 */

import { useId, useSyncExternalStore } from "react";

import type { IconName } from "@/ui/design/icons";
import { Button } from "@/ui/kit/button";

import { emitFeedback } from "./feedback";
import {
  getFeedbackPrefsServerSnapshot,
  getFeedbackPrefsSnapshot,
  subscribeFeedbackPrefs,
  writeFeedbackPrefs,
  type FeedbackPrefs,
} from "./feedback-prefs";
import { prefersReducedMotion } from "./haptics";

export const FEEDBACK_COPY = {
  title: "Sonido y vibración",
  sound: "Sonido suave",
  haptics: "Vibración corta",
  on: "Activado",
  off: "Apagado",
  hint: "Un «chip» suave y una vibración corta al responder y cuando dos estrellas se unen. Vienen apagados y solo se guardan en este dispositivo.",
  reducedMotion: "Tu dispositivo pide menos movimiento, así que no vibraremos aunque lo actives.",
} as const;

export function useFeedbackPrefs(): FeedbackPrefs {
  return useSyncExternalStore(subscribeFeedbackPrefs, getFeedbackPrefsSnapshot, getFeedbackPrefsServerSnapshot);
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
}

/** Kit button with `role="switch"`: the name stays stable, the state is announced by `aria-checked`. */
function Switch({ label, icon, on, onToggle }: SwitchProps) {
  return (
    <Button variant="secondary" role="switch" aria-checked={on} icon={icon} className="zm-feedback__switch" onClick={onToggle}>
      <span>{label}</span>
      <span className="zm-feedback__state" aria-hidden="true">
        {on ? FEEDBACK_COPY.on : FEEDBACK_COPY.off}
      </span>
    </Button>
  );
}

export function FeedbackToggles() {
  const prefs = useFeedbackPrefs();
  const labelId = useId();
  const reduced = useReducedMotionNow();

  function toggle(key: keyof FeedbackPrefs) {
    const next = { ...prefs, [key]: !prefs[key] };
    writeFeedbackPrefs(next);
    if (next[key]) emitFeedback("answer");
  }

  return (
    <div className="zm-setting">
      <p id={labelId} className="zm-setting__label">
        {FEEDBACK_COPY.title}
      </p>
      <p className="zm-detail__muted">{FEEDBACK_COPY.hint}</p>
      <div role="group" aria-labelledby={labelId} className="zm-feedback__toggles">
        <Switch
          label={FEEDBACK_COPY.sound}
          icon={prefs.sound ? "sound-on" : "sound-off"}
          on={prefs.sound}
          onToggle={() => toggle("sound")}
        />
        <Switch label={FEEDBACK_COPY.haptics} icon="haptic" on={prefs.haptics} onToggle={() => toggle("haptics")} />
      </div>
      {prefs.haptics && reduced ? <p className="zm-detail__muted">{FEEDBACK_COPY.reducedMotion}</p> : null}
    </div>
  );
}
