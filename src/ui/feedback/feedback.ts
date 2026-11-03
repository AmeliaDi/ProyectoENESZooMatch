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

export type FeedbackKind = "answer" | "join" | "tap";

/** Kinds that never vibrate (`tap` is sound-only by design). */
type VibratingKind = keyof typeof EXPERIENCE.feedback.vibration;
function vibrationFor(kind: FeedbackKind, config: typeof EXPERIENCE.feedback): readonly number[] | null {
  return kind in config.vibration ? config.vibration[kind as VibratingKind] : null;
}

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
  const pattern = vibrationFor(kind, deps.config);
  const haptics = prefs.haptics && pattern !== null;
  if (!prefs.sound && !haptics) return { sound: false, haptics: false };
  if (!deps.limiter.tryFire(deps.now())) return { sound: false, haptics: false };
  if (prefs.sound) deps.sound(deps.config.sounds[kind]);
  if (haptics && pattern) deps.vibrate(pattern);
  return { sound: prefs.sound, haptics };
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
