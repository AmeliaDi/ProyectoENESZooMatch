/**
 * One entry point for every sound moment. `emitSound(id)` checks the device
 * preferences, the quiet window, the tab visibility and the per-category
 * cooldown, then plays the recipe and/or its vibration. `emitFeedback(kind)`
 * stays as the name the quiz and the canvas already call. Safe on the server.
 */

import { SOUND, SOUND_CATEGORIES, type SoundCategory, type SoundConfig, type SoundEventId } from "@/config";
import { masterVolume, soundBlock, vibrationFor, type SoundBlock, type SoundPrefs } from "@/domain/audio/policy";

import { installAudioUnlock, isAudioUnlocked, playRecipe, stopCategory, unlockAudio } from "./audio-engine";
import { vibrate } from "./haptics";
import { getSoundPrefsSnapshot } from "./sound-prefs";

/** The three moments the quiz and the canvas already emit. */
export type FeedbackKind = "answer" | "join" | "tap";

export interface SoundDeps {
  prefs: () => SoundPrefs;
  now: () => number;
  minutes: () => number;
  hidden: () => boolean;
  unlocked: () => boolean;
  play: (id: SoundEventId, volume: number) => void;
  vibrate: (pattern: readonly number[]) => unknown;
  config: SoundConfig;
  lastFired: Map<SoundCategory, number>;
}

export interface SoundOutcome {
  sound: boolean;
  haptics: boolean;
  block: SoundBlock | null;
}

/** Pure core: returns what fired and why not, so tests need no Web Audio. */
export function runSound(id: SoundEventId, deps: SoundDeps): SoundOutcome {
  const prefs = deps.prefs();
  const recipe = deps.config.eventos[id];
  const block = soundBlock(id, recipe.categoria, deps.config.categorias[recipe.categoria].cooldownMs, {
    prefs,
    hidden: deps.hidden(),
    minutes: deps.minutes(),
    nowMs: deps.now(),
    lastFiredMs: Object.fromEntries(deps.lastFired),
    unlocked: deps.unlocked(),
  });
  if (block !== null) return { sound: false, haptics: false, block };

  deps.lastFired.set(recipe.categoria, deps.now());
  deps.play(id, masterVolume(prefs, deps.config));
  const pattern = vibrationFor(id, prefs, deps.config);
  if (pattern) deps.vibrate(pattern);
  return { sound: true, haptics: pattern !== null, block: null };
}

let defaults: SoundDeps | null = null;

function localMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function defaultDeps(): SoundDeps {
  defaults ??= {
    prefs: getSoundPrefsSnapshot,
    now: () => performance.now(),
    minutes: localMinutes,
    hidden: () => document.hidden,
    unlocked: isAudioUnlocked,
    play: playRecipe,
    vibrate,
    config: SOUND,
    lastFired: new Map<SoundCategory, number>(),
  };
  return defaults;
}

export function emitSound(id: SoundEventId): SoundOutcome {
  if (typeof window === "undefined") return { sound: false, haptics: false, block: "disabled" };
  return runSound(id, defaultDeps());
}

export function emitFeedback(kind: FeedbackKind): void {
  emitSound(kind);
}

/**
 * Called from the click that turns sound on: the click is the gesture, so the
 * context unlocks here and a sample confirms the choice.
 */
export function enableSoundPreview(id: SoundEventId = "answer"): void {
  if (typeof window === "undefined") return;
  unlockAudio();
  emitSound(id);
}

/**
 * An explicit "let me hear that one" press in the dev gallery: the press is the
 * consent, so it plays at the recipe volume even with the master switch off.
 */
export function auditionSound(id: SoundEventId): void {
  if (typeof window === "undefined") return;
  unlockAudio();
  playRecipe(id, SOUND.master.porDefecto);
}

/** Arms the one-time gesture listener. Returns its cleanup. */
export function armAudioUnlock(): () => void {
  return installAudioUnlock(() => getSoundPrefsSnapshot().sound);
}

/** A tab that goes to the background stops mid-note, not at the end of it. */
export function silenceAllSounds(): void {
  for (const category of SOUND_CATEGORIES) stopCategory(category);
}