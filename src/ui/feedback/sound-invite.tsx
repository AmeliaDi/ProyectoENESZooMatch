"use client";

/**
 * The one-time invitation after hatching: "¿quieres soniditos?". Sound stays off
 * until the person says yes, the card never repeats, and declining is a single
 * tap with no follow-up. Accepting writes the preference and plays a sample
 * inside the same click, which is the gesture the browser needs.
 */

import { useEffect, useState, useSyncExternalStore } from "react";

import { SOUND } from "@/config";
import { Button } from "@/ui/kit/button";
import { Icon } from "@/ui/kit/icon";

import { enableSoundPreview } from "./feedback";
import {
  browserStore,
  getSoundPrefsServerSnapshot,
  getSoundPrefsSnapshot,
  readSoundPrefs,
  subscribeSoundPrefs,
  writeSoundPrefs,
  type PrefsStore,
} from "./sound-prefs";

export const SOUND_INVITE_COPY = {
  title: "¿Quieres soniditos?",
  body: "Tonos cortos y suaves cuando algo pasa en tu hábitat: un match, un mensaje, un logro. Los sintetiza el navegador, no son archivos.",
  accept: "Sí, quiero escuchar",
  decline: "Ahora no",
  note: "Vienen apagados por defecto y se guardan solo en este dispositivo. Puedes cambiarlos en Ajustes cuando quieras.",
} as const;

const KEY = SOUND.invitacion.storageKey;
const listeners = new Set<() => void>();

export function soundInviteSeen(store: PrefsStore | null = browserStore()): boolean {
  try {
    return store?.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function markSoundInviteSeen(store: PrefsStore | null = browserStore()): void {
  try {
    store?.setItem(KEY, "1");
  } catch {
    // Private mode: the card may show again next time, which is harmless.
  }
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** `ready` is the moment the reveal animation ended (or was skipped). */
export function SoundInvite({ ready }: { ready: boolean }) {
  const seen = useSyncExternalStore(subscribe, () => soundInviteSeen(), () => true);
  const [waited, setWaited] = useState(false);
  const enabled = useSyncExternalStore(subscribeSoundPrefs, getSoundPrefsSnapshot, getSoundPrefsServerSnapshot).sound;

  useEffect(() => {
    if (!ready || seen || enabled) return;
    const timer = window.setTimeout(() => setWaited(true), SOUND.invitacion.retrasoMs);
    return () => window.clearTimeout(timer);
  }, [ready, seen, enabled]);

  if (seen || enabled || !waited) return null;

  function accept() {
    writeSoundPrefs({ ...readSoundPrefs(), sound: true });
    markSoundInviteSeen();
    enableSoundPreview("match_nuevo");
  }

  return (
    <aside className="zm-box zm-box--frame zm-sound-invite" aria-labelledby="sound-invite-title">
      <h2 id="sound-invite-title" className="zm-sound-invite__title">
        <Icon name="sound-on" /> {SOUND_INVITE_COPY.title}
      </h2>
      <p className="zm-sound-invite__body">{SOUND_INVITE_COPY.body}</p>
      <div className="zm-sound-invite__actions">
        <Button variant="primary" icon="sound-on" onClick={accept}>
          {SOUND_INVITE_COPY.accept}
        </Button>
        <Button variant="ghost" onClick={() => markSoundInviteSeen()}>
          {SOUND_INVITE_COPY.decline}
        </Button>
      </div>
      <p className="zm-detail__muted">{SOUND_INVITE_COPY.note}</p>
    </aside>
  );
}