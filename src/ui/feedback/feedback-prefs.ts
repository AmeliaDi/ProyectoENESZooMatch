/**
 * Sound and vibration preference, stored per device. Both start off and stay
 * off unless the person turns them on in Ajustes. Only two booleans are kept
 * (no personal data), and every storage failure (private mode, quota, blocked
 * cookies) falls back to "off" instead of breaking the screen.
 */

import { EXPERIENCE } from "@/config";

export interface FeedbackPrefs {
  sound: boolean;
  haptics: boolean;
}

/** Minimal slice of `Storage`, so tests can inject a fake or a broken one. */
export type PrefsStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const DEFAULT_FEEDBACK_PREFS: Readonly<FeedbackPrefs> = Object.freeze({ sound: false, haptics: false });

const STORAGE_KEY = EXPERIENCE.feedback.storageKey;
const CHANGE_EVENT = `${STORAGE_KEY}:change`;

/**
 * In-session copy: if storage is unavailable the toggle still works until the
 * tab closes. `null` means "nothing chosen in this session, trust storage".
 */
let memory: FeedbackPrefs | null = null;
let cached: { raw: string | null; memo: FeedbackPrefs | null; prefs: FeedbackPrefs } | null = null;

/** Tolerant parser: anything that is not an explicit `true` reads as off. */
export function parseFeedbackPrefs(raw: string | null): FeedbackPrefs {
  if (!raw) return { ...DEFAULT_FEEDBACK_PREFS };
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return { ...DEFAULT_FEEDBACK_PREFS };
    const record = value as Record<string, unknown>;
    return { sound: record.sound === true, haptics: record.haptics === true };
  } catch {
    return { ...DEFAULT_FEEDBACK_PREFS };
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

export function readFeedbackPrefs(store: PrefsStore | null = browserStore()): FeedbackPrefs {
  return parseFeedbackPrefs(readRaw(store));
}

/** Returns whether the preference was persisted; the UI still updates if not. */
export function writeFeedbackPrefs(prefs: FeedbackPrefs, store: PrefsStore | null = browserStore()): boolean {
  let saved = false;
  if (store) {
    try {
      if (!prefs.sound && !prefs.haptics) store.removeItem(STORAGE_KEY);
      else store.setItem(STORAGE_KEY, JSON.stringify({ sound: prefs.sound, haptics: prefs.haptics }));
      saved = true;
    } catch {
      saved = false;
    }
  }
  memory = { ...prefs };
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE_EVENT));
  return saved;
}


/** Stable snapshot for `useSyncExternalStore` (same object while nothing changed). */
export function getFeedbackPrefsSnapshot(): FeedbackPrefs {
  const raw = readRaw(browserStore());
  if (cached && cached.raw === raw && cached.memo === memory) return cached.prefs;
  const stored = parseFeedbackPrefs(raw);
  const prefs = raw === null && memory ? memory : stored;
  cached = { raw, memo: memory, prefs };
  return prefs;
}

export function getFeedbackPrefsServerSnapshot(): FeedbackPrefs {
  return DEFAULT_FEEDBACK_PREFS;
}

export function subscribeFeedbackPrefs(callback: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

/** Test hook: forget the in-session copy and the snapshot cache. */
export function resetFeedbackPrefsMemory(): void {
  memory = null;
  cached = null;
}
