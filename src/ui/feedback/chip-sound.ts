/**
 * The "chip": a tiny synthesized blip (square or triangle wave with a short
 * pitch glide and a fast fade), no audio files. The AudioContext is created
 * lazily on the first call, which always happens inside a user gesture (a
 * Likert tap, a node tap), so autoplay policies never block it. Any failure
 * is swallowed: sound is decoration, never a dependency.
 */

import type { Experience } from "@/config";

export type ChipTone = Experience["feedback"]["sounds"]["answer"];

/** The silence floor for exponential ramps (they cannot reach 0). */
const SILENT_GAIN = 0.0001;
const MS = 1000;

type AudioContextCtor = new () => AudioContext;

let context: AudioContext | null = null;

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  const legacy = (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
  return window.AudioContext ?? legacy ?? null;
}

function ensureContext(): AudioContext | null {
  if (context) return context;
  const Ctor = audioContextCtor();
  if (!Ctor) return null;
  try {
    context = new Ctor();
  } catch {
    context = null;
  }
  return context;
}

function schedule(ctx: AudioContext, tone: ChipTone): void {
  const start = ctx.currentTime;
  const end = start + tone.durationMs / MS;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = tone.wave;
  osc.frequency.setValueAtTime(tone.startHz, start);
  osc.frequency.exponentialRampToValueAtTime(tone.endHz, end);
  gain.gain.setValueAtTime(SILENT_GAIN, start);
  gain.gain.linearRampToValueAtTime(tone.volume, start + tone.attackMs / MS);
  gain.gain.exponentialRampToValueAtTime(SILENT_GAIN, end);
  osc.connect(gain).connect(ctx.destination);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
  osc.start(start);
  osc.stop(end);
}

/** Plays one chip. No-op on the server, without WebAudio, or on any error. */
export function playChip(tone: ChipTone): void {
  const ctx = ensureContext();
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") {
      void ctx.resume().then(() => schedule(ctx, tone)).catch(() => undefined);
      return;
    }
    schedule(ctx, tone);
  } catch {
    // Sound is optional; a failing node graph must never break an answer.
  }
}
