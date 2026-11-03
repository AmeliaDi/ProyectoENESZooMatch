/**
 * One entry point for every feedback moment. Call `emitFeedback(kind)` from a
 * user-gesture handler: it checks the device preference, applies the shared
 * limiter (never more than one chip/buzz per `throttleMs`) and then plays the
 * sound and/or vibration configured for that kind. Safe to call on the server.
 */

import { EXPERIENCE } from "@/config";

import { playChip, type ChipTone } from "./chip-sound";
import { getFeedbackPrefsSnapshot, type FeedbackPrefs } from "./feedback-prefs";
import { vibrate } from "./haptics";
import { createLimiter, type Limiter } from "./throttle";

export type FeedbackKind = "answer" | "join";

export interface FeedbackDeps {
  prefs: () => FeedbackPrefs;
  limiter: Limiter;
  now: () => number;
  sound: (tone: ChipTone) => void;
  vibrate: (pattern: readonly number[]) => unknown;
  config: typeof EXPERIENCE.feedback;
}

/** Pure core: returns what fired, so tests can assert without WebAudio. */
export function runFeedback(kind: FeedbackKind, deps: FeedbackDeps): { sound: boolean; haptics: boolean } {
  const prefs = deps.prefs();
  if (!prefs.sound && !prefs.haptics) return { sound: false, haptics: false };
  if (!deps.limiter.tryFire(deps.now())) return { sound: false, haptics: false };
  if (prefs.sound) deps.sound(deps.config.sounds[kind]);
  if (prefs.haptics) deps.vibrate(deps.config.vibration[kind]);
  return { sound: prefs.sound, haptics: prefs.haptics };
}

let defaults: FeedbackDeps | null = null;

function defaultDeps(): FeedbackDeps {
  defaults ??= {
    prefs: getFeedbackPrefsSnapshot,
    limiter: createLimiter(EXPERIENCE.feedback.throttleMs),
    now: () => performance.now(),
    sound: playChip,
    vibrate,
    config: EXPERIENCE.feedback,
  };
  return defaults;
}

export function emitFeedback(kind: FeedbackKind): void {
  if (typeof window === "undefined") return;
  runFeedback(kind, defaultDeps());
}
