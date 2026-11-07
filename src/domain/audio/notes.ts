/**
 * Pure music helpers for the synthesized sound catalogue. No Web Audio, no
 * config imports: `src/config/sound.ts` uses these to validate the recipes and
 * the browser engine uses them to schedule voices, so both agree by construction.
 */

/** Semitone offset of each natural note inside an octave (C = 0). */
const SEMITONES: Readonly<Record<string, number>> = Object.freeze({
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
});

/** MIDI number of A4, the anchor of the equal-tempered scale. */
const A4_MIDI = 69;
const SEMITONOS_POR_OCTAVA = 12;

const NOTE_PATTERN = /^([A-G])(#|b)?([0-8])$/;

export interface ParsedNote {
  /** e.g. "F#" */
  paso: string;
  octava: number;
  midi: number;
}

/** Parses "E5", "F#4", "Bb3". Returns null for anything else. */
export function parseNote(note: string): ParsedNote | null {
  const match = NOTE_PATTERN.exec(note);
  if (!match) return null;
  const [, letra, alteracion, octavaRaw] = match;
  const base = SEMITONES[letra ?? ""];
  const octava = Number(octavaRaw);
  if (base === undefined || !Number.isInteger(octava)) return null;
  const accidental = alteracion === "#" ? 1 : alteracion === "b" ? -1 : 0;
  const paso = `${letra ?? ""}${alteracion ?? ""}`;
  return { paso, octava, midi: (octava + 1) * SEMITONOS_POR_OCTAVA + base + accidental };
}

/**
 * Equal temperament: f = ref · 2^((midi − 69)/12). `ref` is the tuning of A4
 * (440 Hz by default, kept in config so it is not a magic number).
 */
export function noteToHz(note: string, refHz: number): number | null {
  const parsed = parseNote(note);
  if (!parsed) return null;
  return refHz * 2 ** ((parsed.midi - A4_MIDI) / SEMITONOS_POR_OCTAVA);
}

export interface ScaleSpec {
  notas: readonly string[];
  octavas: readonly number[];
}

/** True when the note's pitch class and octave both belong to the scale. */
export function noteInScale(note: string, scale: ScaleSpec): boolean {
  const parsed = parseNote(note);
  if (!parsed) return false;
  return scale.notas.includes(parsed.paso) && scale.octavas.includes(parsed.octava);
}

export interface VoiceTiming {
  esperaMs: number;
  ms: number;
}

/** A recipe lasts until its latest voice ends, not the sum of its voices. */
export function eventDurationMs(voices: readonly VoiceTiming[]): number {
  return voices.reduce((max, voice) => Math.max(max, voice.esperaMs + voice.ms), 0);
}

const HORA_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Minutes since midnight for "HH:MM", or null when malformed. */
export function minutesOfDay(hhmm: string): number | null {
  const match = HORA_PATTERN.exec(hhmm);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export interface QuietHours {
  inicio: string;
  fin: string;
}

/**
 * Quiet hours may wrap past midnight (22:00 → 08:00). When start equals end the
 * window is empty, not a full day: an accidental same-value pair must not mute
 * everything.
 */
export function withinQuietHours(minutes: number, hours: QuietHours): boolean {
  const start = minutesOfDay(hours.inicio);
  const end = minutesOfDay(hours.fin);
  if (start === null || end === null || start === end) return false;
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}