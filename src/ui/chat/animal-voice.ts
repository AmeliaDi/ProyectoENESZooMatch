/**
 * Synthesized 8-bit Game Boy voices ("soniditos") and encounter cries for each
 * animalito in chat. Pure deterministic voice profiles derived from
 * `(animalId, colorId)` via FNV-1a; audio synthesis uses Web Audio oscillators
 * with zero external assets and swallows every error.
 */
import { noteToHz } from "@/domain/audio/notes";
import { fnv1a32 } from "@/domain/shared";
import { isAudioUnlocked, unlockAudio } from "@/ui/feedback/audio-engine";
import { getSoundPrefsSnapshot } from "@/ui/feedback/sound-prefs";

export interface AnimalVoiceProfile {
  readonly baseNote: string;
  readonly highNote: string;
  readonly accentNote: string;
  readonly wave: "square" | "triangle";
  readonly tempoMs: number;
  readonly cryLabel: string;
}

const PENTATONIC_BASES = [
  ["C5", "E5", "G5"],
  ["D5", "F#5", "A5"],
  ["E5", "G#5", "B5"],
  ["F5", "A5", "C6"],
  ["G5", "B5", "D6"],
  ["A5", "C#6", "E6"],
  ["A#4", "D5", "F5"],
  ["B4", "D#5", "F#5"],
] as const;

const SPEECH_NOTES = ["C5", "D5", "E5", "G5", "A5", "C6", "D6", "E6"] as const;

const ANIMAL_CRIES: Readonly<Record<string, string>> = {
  zorro: "¡Yip-yip!",
  nutria: "¡Chirp-glu!",
  buho: "¡Uuu-bit!",
  lobo: "¡Auuu-bit!",
  gato: "¡Miau-piu!",
  perro: "¡Guau-bip!",
  conejo: "¡Pomp-piu!",
  oso: "¡Grrr-bom!",
  mapache: "¡Tiki-tak!",
  ciervo: "¡Brii-ting!",
  colibri: "¡Piu-zii!",
  ajolote: "¡Glu-piu!",
  tlacuache: "¡Chis-tiki!",
  cacomixtle: "¡Miu-zap!",
  jaguar: "¡Rrr-bit!",
  quetzal: "¡Trin-piu!",
  xolo: "¡Guau-xol!",
  capibara: "¡Hup-paz!",
  pinguino: "¡Noot-bip!",
  tortuga: "¡Tup-calm!",
};

const FALLBACK_CRIES = [
  "¡Piu-bip!",
  "¡Tiki-piu!",
  "¡Bip-bop!",
  "¡Chirp-bit!",
  "¡Miu-piu!",
  "¡Glu-bip!",
] as const;

/** Deterministic 8-bit voice profile for any animal + color combination. */
export function voiceProfileFor(animalId: string | null, colorId: string | null): AnimalVoiceProfile {
  const safeAnimal = (animalId ?? "animal").toLowerCase().trim();
  const safeColor = (colorId ?? "ennea-1").toLowerCase().trim();
  const hash = fnv1a32(`${safeAnimal}:${safeColor}`);
  const triad = PENTATONIC_BASES[hash % PENTATONIC_BASES.length] ?? PENTATONIC_BASES[0];
  const wave = (hash >>> 3) % 2 === 0 ? "square" : "triangle";
  const tempoMs = 48 + ((hash >>> 5) % 24);
  const matchedCry = Object.entries(ANIMAL_CRIES).find(([key]) => safeAnimal.includes(key))?.[1];
  const cryLabel = matchedCry ?? FALLBACK_CRIES[(hash >>> 7) % FALLBACK_CRIES.length] ?? "¡Piu-bip!";
  return {
    baseNote: triad[0],
    highNote: triad[1],
    accentNote: triad[2],
    wave,
    tempoMs,
    cryLabel,
  };
}

/** Deterministic note for one character step in the Game Boy typewriter. */
export function speechBlipNote(profile: AnimalVoiceProfile, stepIndex: number): string {
  const baseIdx = SPEECH_NOTES.indexOf(profile.baseNote as (typeof SPEECH_NOTES)[number]);
  const start = baseIdx >= 0 ? baseIdx : 2;
  const offset = (stepIndex * 3 + (stepIndex % 2)) % 4;
  return SPEECH_NOTES[(start + offset) % SPEECH_NOTES.length] ?? profile.baseNote;
}

type AudioContextCtor = new () => AudioContext;
let voiceCtx: AudioContext | null = null;

function getVoiceContext(forceUnlock: boolean): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (forceUnlock) unlockAudio();
  else if (!isAudioUnlocked()) return null;
  if (!voiceCtx) {
    const legacy = (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
    const Ctor = window.AudioContext ?? legacy ?? null;
    if (!Ctor) return null;
    try {
      voiceCtx = new Ctor();
    } catch {
      return null;
    }
  }
  if (voiceCtx.state === "suspended") {
    void voiceCtx.resume().catch(() => undefined);
  }
  return voiceCtx;
}

function canPlayVoice(muted: boolean, force: boolean): { ok: boolean; volume: number } {
  if (typeof window === "undefined") return { ok: false, volume: 0 };
  if (muted && !force) return { ok: false, volume: 0 };
  const prefs = getSoundPrefsSnapshot();
  if (!prefs.sound && !force) return { ok: false, volume: 0 };
  const volume = Math.max(0.08, Math.min(0.35, (prefs.volume || 0.6) * 0.28));
  return { ok: true, volume };
}

function playTone(
  ctx: AudioContext,
  wave: OscillatorType,
  fromHz: number,
  toHz: number,
  startSec: number,
  durationSec: number,
  gainValue: number,
): void {
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(fromHz, startSec);
    if (Math.abs(toHz - fromHz) > 1) {
      osc.frequency.exponentialRampToValueAtTime(toHz, startSec + durationSec);
    }
    gain.gain.setValueAtTime(0.0001, startSec);
    gain.gain.linearRampToValueAtTime(gainValue, startSec + Math.min(0.008, durationSec * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0001, startSec + durationSec);
    osc.connect(gain).connect(ctx.destination);
    osc.start(startSec);
    osc.stop(startSec + durationSec + 0.005);
  } catch {
    // Sound is decorative and never throws.
  }
}

export interface VoicePlayOptions {
  readonly muted?: boolean;
  readonly force?: boolean;
}

/**
 * Plays the animal's 3-note 8-bit Game Boy cry (like a classic handheld
 * encounter greeting).
 */
export function playAnimalCry(
  animalId: string | null,
  colorId: string | null,
  options: VoicePlayOptions = {},
): boolean {
  const { ok, volume } = canPlayVoice(options.muted ?? false, options.force ?? false);
  if (!ok) return false;
  const ctx = getVoiceContext(options.force ?? false);
  if (!ctx) return false;
  const profile = voiceProfileFor(animalId, colorId);
  const f1 = noteToHz(profile.baseNote, 440) ?? 523.25;
  const f2 = noteToHz(profile.highNote, 440) ?? 659.25;
  const f3 = noteToHz(profile.accentNote, 440) ?? 783.99;
  const stepSec = (profile.tempoMs + 18) / 1000;
  const now = ctx.currentTime;
  playTone(ctx, profile.wave, f1, f2, now, stepSec, volume);
  playTone(ctx, profile.wave, f2, f1 * 1.05, now + stepSec * 0.95, stepSec * 0.9, volume * 0.9);
  playTone(ctx, profile.wave, f2, f3, now + stepSec * 1.85, stepSec * 1.15, volume);
  playTone(ctx, profile.wave, f3, f2 * 1.04, now + stepSec * 3.05, stepSec * 0.95, volume * 0.85);
  playTone(ctx, profile.wave, f2, f3 * 1.06, now + stepSec * 4.0, stepSec * 1.5, volume);
  return true;
}

/**
 * Plays a short 8-bit speech blip as the Game Boy dialogue box types out
 * an animal's words.
 */
export function playSpeechBlip(
  animalId: string | null,
  colorId: string | null,
  stepIndex: number,
  options: VoicePlayOptions = {},
): boolean {
  const { ok, volume } = canPlayVoice(options.muted ?? false, options.force ?? false);
  if (!ok) return false;
  const ctx = getVoiceContext(options.force ?? false);
  if (!ctx) return false;
  const profile = voiceProfileFor(animalId, colorId);
  const note = speechBlipNote(profile, stepIndex);
  const hz = noteToHz(note, 440) ?? 587.33;
  const slideHz = stepIndex % 2 === 0 ? hz * 1.09 : hz * 0.93;
  playTone(ctx, profile.wave, hz, slideHz, ctx.currentTime, 0.04, volume * 0.7);
  return true;
}

/** Plays a 4-note 8-bit item-gift fanfare when sending or receiving a gift. */
export function playGiftFanfare(options: VoicePlayOptions = {}): boolean {
  const { ok, volume } = canPlayVoice(options.muted ?? false, options.force ?? false);
  if (!ok) return false;
  const ctx = getVoiceContext(options.force ?? false);
  if (!ctx) return false;
  const notes = ["C5", "E5", "G5", "C6"] as const;
  const now = ctx.currentTime;
  notes.forEach((n, idx) => {
    const hz = noteToHz(n, 440) ?? 523.25;
    const dur = idx === notes.length - 1 ? 0.14 : 0.065;
    playTone(ctx, "square", hz, hz * 1.02, now + idx * 0.07, dur, volume);
  });
  return true;
}
