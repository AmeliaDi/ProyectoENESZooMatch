/**
 * The reproduction rules, pure so they can be tested without Web Audio: when a
 * sound may fire, at what volume, and when a vibration may accompany it. The
 * browser engine only executes what this module decides.
 */

import type { SoundCategory, SoundConfig, SoundEventId } from "@/config";

import { withinQuietHours } from "./notes";

export interface QuietPreference {
  enabled: boolean;
  inicio: string;
  fin: string;
}

export interface SoundPrefs {
  sound: boolean;
  haptics: boolean;
  /** Master gain, 0…1. Multiplies every recipe volume. */
  volume: number;
  categories: Readonly<Record<SoundCategory, boolean>>;
  /** The near-inaudible button tick is opt-in even when sound is on. */
  toque: boolean;
  quiet: QuietPreference;
}

export function defaultSoundPrefs(config: SoundConfig): SoundPrefs {
  return {
    sound: false,
    haptics: false,
    volume: config.master.porDefecto,
    categories: { conexion: true, logros: true, interfaz: true },
    toque: false,
    quiet: {
      enabled: config.silencio.activadoPorDefecto,
      inicio: config.silencio.inicio,
      fin: config.silencio.fin,
    },
  };
}

export type SoundBlock =
  | "disabled"
  | "category"
  | "toque"
  | "quiet"
  | "hidden"
  | "locked"
  | "cooldown";

export interface PlayContext {
  prefs: SoundPrefs;
  /** `document.hidden`: a background tab never makes noise. */
  hidden: boolean;
  /** Minutes since midnight, local to the person. */
  minutes: number;
  nowMs: number;
  lastFiredMs: Readonly<Partial<Record<SoundCategory, number>>>;
  /** The AudioContext was resumed inside a real user gesture. */
  unlocked: boolean;
}

/**
 * Returns the first rule that stops the sound, or null when it may play.
 * Order is deliberate: preferences before environment, environment before
 * rate, so a disabled switch is never reported as "cooldown".
 */
export function soundBlock(
  id: SoundEventId,
  category: SoundCategory,
  cooldownMs: number,
  ctx: PlayContext,
): SoundBlock | null {
  if (!ctx.prefs.sound) return "disabled";
  if (!ctx.prefs.categories[category]) return "category";
  if (id === "toque" && !ctx.prefs.toque) return "toque";
  if (ctx.prefs.quiet.enabled && withinQuietHours(ctx.minutes, ctx.prefs.quiet)) return "quiet";
  if (ctx.hidden) return "hidden";
  if (!ctx.unlocked) return "locked";
  const last = ctx.lastFiredMs[category];
  if (last !== undefined && ctx.nowMs - last < cooldownMs) return "cooldown";
  return null;
}

/** Clamped master gain. Recipe volumes are already capped by the schema. */
export function masterVolume(prefs: SoundPrefs, config: SoundConfig): number {
  return Math.min(config.master.maximo, Math.max(config.master.minimo, prefs.volume));
}

/** Vibration is motion: it follows the haptics switch and the event's pattern. */
export function vibrationFor(
  id: SoundEventId,
  prefs: SoundPrefs,
  config: SoundConfig,
): readonly number[] | null {
  if (!prefs.haptics) return null;
  return config.eventos[id].vibracion ?? null;
}