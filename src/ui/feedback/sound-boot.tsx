"use client";

/**
 * Mounted once in the root layout. Three device-level rules live here so no
 * screen has to remember them: the AudioContext only unlocks inside a real
 * gesture, a hidden tab stops mid-note, and the optional button tick is emitted
 * from one capture listener instead of every call site.
 */

import { useEffect } from "react";

import { armAudioUnlock, emitSound, silenceAllSounds } from "./feedback";

export function SoundBoot() {
  useEffect(() => {
    const disarm = armAudioUnlock();

    const onVisibility = () => {
      if (document.hidden) silenceAllSounds();
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".zm-btn")) emitSound("toque");
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("click", onClick, true);
    return () => {
      disarm();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("click", onClick, true);
    };
  }, []);

  return null;
}