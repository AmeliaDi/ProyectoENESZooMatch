/**
 * The synthesized sound engine: square/triangle oscillators and band-passed
 * noise over short envelopes, no audio files and no dependencies. A single
 * master bus feeds the destination; each category may hold at most one recipe
 * at a time, so a burst of notifications never stacks into noise. Every failure
 * is swallowed: sound is decoration, never a dependency.
 */

import { SOUND, type SoundCategory, type SoundEventId, type SoundVoice } from "@/config";
import { noteToHz } from "@/domain/audio/notes";

const SILENT_GAIN = 0.0001;
const MS = 1000;
/** One second of noise, looped: enough for the longest shimmer without repeats. */
const NOISE_SECONDS = 1;
const NOISE_Q = 1.2;

type AudioContextCtor = new () => AudioContext;

let context: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let unlocked = false;
const active = new Map<SoundCategory, Set<AudioScheduledSourceNode>>();

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
    master = context.createGain();
    master.gain.value = 1;
    master.connect(context.destination);
  } catch {
    context = null;
    master = null;
  }
  return context;
}

/**
 * Creates and resumes the context. Must be called from inside a user gesture;
 * the resume promise is what actually satisfies the autoplay policy.
 */
export function unlockAudio(): boolean {
  const ctx = ensureContext();
  if (!ctx) return false;
  unlocked = true;
  if (ctx.state !== "running") {
    void ctx.resume().catch(() => {
      unlocked = false;
    });
  }
  return true;
}

export function isAudioUnlocked(): boolean {
  return unlocked;
}

/**
 * Detaches after the first gesture that actually unlocks. While sound is off the
 * listener stays armed but creates nothing, so a person who never wants sound
 * never pays for an AudioContext.
 */
export function installAudioUnlock(shouldUnlock: () => boolean): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => {
    if (!shouldUnlock()) return;
    if (unlockAudio()) detach();
  };
  const detach = () => {
    window.removeEventListener("pointerdown", handler, true);
    window.removeEventListener("keydown", handler, true);
  };
  window.addEventListener("pointerdown", handler, true);
  window.addEventListener("keydown", handler, true);
  return detach;
}

function noise(ctx: AudioContext): AudioBuffer | null {
  if (noiseBuffer) return noiseBuffer;
  try {
    const frames = Math.floor(ctx.sampleRate * NOISE_SECONDS);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // Deterministic LCG: the shimmer sounds the same on every device.
    let seed = 0x2f6e2b1;
    for (let i = 0; i < frames; i += 1) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      data[i] = (seed / 0x3fffffff) - 1;
    }
    noiseBuffer = buffer;
    return buffer;
  } catch {
    return null;
  }
}

function track(category: SoundCategory, node: AudioScheduledSourceNode): void {
  let set = active.get(category);
  if (!set) {
    set = new Set();
    active.set(category, set);
  }
  set.add(node);
  node.addEventListener("ended", () => {
    set.delete(node);
    node.disconnect();
  });
}

/** A new recipe replaces whatever its category was playing: never stacked. */
export function stopCategory(category: SoundCategory): void {
  const set = active.get(category);
  if (!set) return;
  for (const node of set) {
    try {
      node.stop();
      node.disconnect();
    } catch {
      // Already stopped: nothing to release.
    }
  }
  set.clear();
}

function scheduleVoice(ctx: AudioContext, bus: GainNode, voice: SoundVoice, category: SoundCategory, at: number): void {
  const start = at + voice.esperaMs / MS;
  const end = start + voice.ms / MS;
  const attack = start + voice.ataqueMs / MS;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(SILENT_GAIN, start);
  gain.gain.linearRampToValueAtTime(voice.volumen, attack);
  gain.gain.exponentialRampToValueAtTime(SILENT_GAIN, end);

  const hz = noteToHz(voice.nota, SOUND.afinacionHz);
  if (hz === null) return;

  if (voice.onda === "noise") {
    const buffer = noise(ctx);
    if (!buffer) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = hz;
    filter.Q.value = NOISE_Q;
    source.connect(filter).connect(gain).connect(bus);
    track(category, source);
    source.start(start);
    source.stop(end);
    return;
  }

  const osc = ctx.createOscillator();
  osc.type = voice.onda;
  osc.frequency.setValueAtTime(hz, start);
  if (voice.hasta !== undefined) {
    const target = noteToHz(voice.hasta, SOUND.afinacionHz);
    if (target !== null) osc.frequency.exponentialRampToValueAtTime(target, end);
  }
  osc.connect(gain).connect(bus);
  track(category, osc);
  osc.start(start);
  osc.stop(end);
}

/**
 * Plays one recipe at the given master volume. No-op on the server, without
 * Web Audio, or on any error. The caller decides *whether* to play; this only
 * decides *how*.
 */
export function playRecipe(id: SoundEventId, volume: number): void {
  const ctx = ensureContext();
  const bus = master;
  if (!ctx || !bus) return;
  try {
    if (ctx.state === "suspended") {
      void ctx.resume().then(() => render(ctx, bus, id, volume)).catch(() => undefined);
      return;
    }
    render(ctx, bus, id, volume);
  } catch {
    // A failing node graph must never break the action that triggered it.
  }
}

function render(ctx: AudioContext, bus: GainNode, id: SoundEventId, volume: number): void {
  const recipe = SOUND.eventos[id];
  stopCategory(recipe.categoria);
  bus.gain.setTargetAtTime(volume, ctx.currentTime, 0.01);
  const at = ctx.currentTime;
  for (const voice of recipe.voces) scheduleVoice(ctx, bus, voice, recipe.categoria, at);
}

/** Test hook: drop the context so a fake one can be injected again. */
export function resetAudioEngine(): void {
  for (const category of active.keys()) stopCategory(category);
  active.clear();
  context = null;
  master = null;
  noiseBuffer = null;
  unlocked = false;
}