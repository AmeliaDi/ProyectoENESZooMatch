/**
 * Sound and vibration preferences, stored per device (no personal data, never
 * sent to the server). Everything starts off. Every storage failure — private
 * mode, quota, blocked cookies — falls back to an in-session copy so the toggle
 * still works until the tab closes, instead of breaking the screen.
 */

import { SOUND, SOUND_CATEGORIES, type SoundCategory } from "@/config";
import { defaultSoundPrefs, type QuietPreference, type SoundPrefs } from "@/domain/audio/policy";
import { minutesOfDay } from "@/domain/audio/notes";

export type { SoundPrefs };

/** Minimal slice of `Storage`, so tests can inject a fake or a broken one. */
export type PrefsStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const DEFAULT_SOUND_PREFS: Readonly<SoundPrefs> = Object.freeze(defaultSoundPrefs(SOUND));

const STORAGE_KEY = SOUND.storageKey;
const CHANGE_EVENT = `${STORAGE_KEY}:change`;

let memory: SoundPrefs | null = null;
let cached: { raw: string | null; memo: SoundPrefs | null; prefs: SoundPrefs } | null = null;

function clampVolume(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return SOUND.master.porDefecto;
  return Math.min(SOUND.master.maximo, Math.max(SOUND.master.minimo, value));
}

function parseCategories(value: unknown): Record<SoundCategory, boolean> {
  const record = (value ?? {}) as Record<string, unknown>;
  const out = {} as Record<SoundCategory, boolean>;
  for (const category of SOUND_CATEGORIES) {
    // Absent means "never chosen": on. Only an explicit false turns it off.
    out[category] = record[category] !== false;
  }
  return out;
}

function parseQuiet(value: unknown): QuietPreference {
  const record = (value ?? {}) as Record<string, unknown>;
  const inicio = typeof record.inicio === "string" && minutesOfDay(record.inicio) !== null ? record.inicio : SOUND.silencio.inicio;
  const fin = typeof record.fin === "string" && minutesOfDay(record.fin) !== null ? record.fin : SOUND.silencio.fin;
  return { enabled: record.enabled === true, inicio, fin };
}

/** Tolerant parser: anything that is not an explicit `true` reads as off. */
export function parseSoundPrefs(raw: string | null): SoundPrefs {
  if (!raw) return { ...DEFAULT_SOUND_PREFS, categories: { ...DEFAULT_SOUND_PREFS.categories }, quiet: { ...DEFAULT_SOUND_PREFS.quiet } };
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return parseSoundPrefs(null);
    const record = value as Record<string, unknown>;
    return {
      sound: record.sound === true,
      haptics: record.haptics === true,
      volume: clampVolume(record.volume),
      categories: parseCategories(record.categories),
      toque: record.toque === true,
      quiet: parseQuiet(record.quiet),
    };
  } catch {
    return parseSoundPrefs(null);
  }
}

/** `window.localStorage`, or `null` on the server or when access itself throws. */
export function browserStore(): PrefsStore | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readRaw(store: PrefsStore | null): string | null {
  if (!store) return null;
  try {
    return store.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function readSoundPrefs(store: PrefsStore | null = browserStore()): SoundPrefs {
  return parseSoundPrefs(readRaw(store));
}

function isDefault(prefs: SoundPrefs): boolean {
  return !prefs.sound && !prefs.haptics && !prefs.toque && !prefs.quiet.enabled;
}

/** Returns whether the preference was persisted; the UI still updates if not. */
export function writeSoundPrefs(prefs: SoundPrefs, store: PrefsStore | null = browserStore()): boolean {
  let saved = false;
  if (store) {
    try {
      if (isDefault(prefs)) store.removeItem(STORAGE_KEY);
      else store.setItem(STORAGE_KEY, JSON.stringify(prefs));
      saved = true;
    } catch {
      saved = false;
    }
  }
  memory = { ...prefs, categories: { ...prefs.categories }, quiet: { ...prefs.quiet } };
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE_EVENT));
  return saved;
}

/** Stable snapshot for `useSyncExternalStore` (same object while nothing changed). */
export function getSoundPrefsSnapshot(): SoundPrefs {
  const raw = readRaw(browserStore());
  if (cached && cached.raw === raw && cached.memo === memory) return cached.prefs;
  const stored = parseSoundPrefs(raw);
  const prefs = raw === null && memory ? memory : stored;
  cached = { raw, memo: memory, prefs };
  return prefs;
}

export function getSoundPrefsServerSnapshot(): SoundPrefs {
  return DEFAULT_SOUND_PREFS;
}

export function subscribeSoundPrefs(callback: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

/** Test hook: forget the in-session copy and the snapshot cache. */
export function resetSoundPrefsMemory(): void {
  memory = null;
  cached = null;
}