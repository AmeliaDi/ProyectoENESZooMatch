"use client";

/**
 * Hook that manages the animo message lifecycle: checks if a message should be
 * shown (based on frequency preferences, session state, and quiet hours),
 * selects one using the pure logic, and tracks when it was shown.
 *
 * The frequency preference is read from localStorage (key: "zm-animo-frequency")
 * so the settings page and the result view stay in sync without a context
 * provider. A `showNow` callback lets the user force a preview from settings.
 */

import { useEffect, useState, useCallback, useRef } from "react";

import { ANIMO_CATALOG } from "@/config/animo";
import type { AnimoContext, AnimoHistory, AnimoSession, AnimoFrecuencia } from "@/domain/animo/animo-context";
import { pickAnimoMessage, updateHistory, type AnimoMessage } from "@/domain/animo/pick-animo-message";
import type { IdentityDto } from "@/contracts/identity";
import type { SoundPrefs } from "@/domain/audio/policy";

const STORAGE_KEY_SESSION = "zoomatch:animo:session:v1";
const STORAGE_KEY_HISTORY = "zoomatch:animo:history:v1";
const STORAGE_KEY_FREQUENCY = "zm-animo-frequency";
const MAX_HISTORY_SIZE = 50;

const VALID_FREQUENCIES: readonly AnimoFrecuencia[] = ["cada_sesion", "diaria", "semanal", "off"];

function isValidFrequency(value: unknown): value is AnimoFrecuencia {
  return typeof value === "string" && VALID_FREQUENCIES.includes(value as AnimoFrecuencia);
}

// -- Frequency localStorage helpers ------------------------------------------

/** Read the stored frequency, falling back to "cada_sesion" on any problem. */
export function readAnimoFrequency(): AnimoFrecuencia {
  if (typeof window === "undefined") return "cada_sesion";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_FREQUENCY);
    if (raw === null) return "cada_sesion";
    return isValidFrequency(raw) ? raw : "cada_sesion";
  } catch {
    return "cada_sesion";
  }
}

/** Persist the frequency. Silently falls back when storage is unavailable. */
export function writeAnimoFrequency(freq: AnimoFrecuencia): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY_FREQUENCY, freq);
  } catch {
    // Silent fallback: the in-memory state still updates.
  }
}

// -- Date helpers (pure, testable) -------------------------------------------

/** ISO week string for frequency gating, e.g. "2026-W45". */
export function getISOWeekString(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

// -- Session / history storage -----------------------------------------------

const DEFAULT_SESSION: AnimoSession = {
  lastShownAt: null,
  lastShownDate: null,
  lastShownWeek: null,
  shownThisSession: false,
};

function loadSession(): AnimoSession {
  if (typeof window === "undefined") return { ...DEFAULT_SESSION };
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY_SESSION);
    if (!raw) return { ...DEFAULT_SESSION };
    const parsed = JSON.parse(raw) as Partial<AnimoSession>;
    return {
      lastShownAt: parsed.lastShownAt ?? null,
      lastShownDate: parsed.lastShownDate ?? null,
      lastShownWeek: parsed.lastShownWeek ?? null,
      shownThisSession: parsed.shownThisSession === true,
    };
  } catch {
    return { ...DEFAULT_SESSION };
  }
}

function saveSession(session: AnimoSession): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(session));
  } catch {
    // Ignore storage errors
  }
}

function loadHistory(): AnimoHistory {
  if (typeof window === "undefined") {
    return { shown: [], maxSize: MAX_HISTORY_SIZE };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_HISTORY);
    if (!raw) return { shown: [], maxSize: MAX_HISTORY_SIZE };
    return JSON.parse(raw);
  } catch {
    return { shown: [], maxSize: MAX_HISTORY_SIZE };
  }
}

function saveHistory(history: AnimoHistory): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history));
  } catch {
    // Ignore storage errors
  }
}

export interface UseAnimoMessageOptions {
  identity: IdentityDto | null;
  soundPrefs: SoundPrefs;
  /** Frequency preference. When omitted, reads from localStorage. */
  frequency?: AnimoFrecuencia;
  /** Whether seasonal messages are enabled */
  estacionalesActivos: boolean;
  /** Current social context (match_nuevo, invitacion_chat, etc.) */
  socialContext: AnimoContext["social"];
  /** Current mood if published */
  animo: AnimoContext["animo"];
  /** Whether this is the first entry after hatching */
  primera: AnimoContext["primera"];
}

/**
 * Returns the current animo message (or null if none should be shown), a
 * callback to dismiss it, and a `showNow` callback that forces a preview
 * regardless of frequency gating.
 */
export function useAnimoMessage(options: UseAnimoMessageOptions): {
  message: AnimoMessage | null;
  dismiss: () => void;
  showNow: () => void;
} {
  const { identity, soundPrefs, frequency: frequencyProp, estacionalesActivos, socialContext, animo, primera } = options;

  // Read frequency from localStorage when no explicit prop is given.
  const [storedFrequency, setStoredFrequency] = useState<AnimoFrecuencia>(() =>
    frequencyProp ?? readAnimoFrequency(),
  );
  const frequency = frequencyProp ?? storedFrequency;

  const [message, setMessage] = useState<AnimoMessage | null>(null);
  const sessionRef = useRef<AnimoSession>(loadSession());
  const historyRef = useRef<AnimoHistory>(loadHistory());
  const [forceShow, setForceShow] = useState(0);

  // Listen for cross-tab / cross-component frequency changes.
  useEffect(() => {
    if (frequencyProp !== undefined) return;
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY_FREQUENCY) {
        const next = isValidFrequency(e.newValue) ? e.newValue : "cada_sesion";
        setStoredFrequency(next);
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [frequencyProp]);

  // Build the context for message selection.
  const buildContext = useCallback((): AnimoContext | null => {
    if (!identity) return null;

    const now = new Date();
    const hour = now.getHours();
    const momento: AnimoContext["momento"] =
      hour >= 5 && hour < 12 ? "manana" : hour >= 12 && hour < 19 ? "tarde" : hour >= 19 && hour < 24 ? "noche" : "madrugada";

    const fecha = now.toISOString().slice(0, 10);

    return {
      identity,
      momento,
      fecha,
      social: socialContext,
      animo,
      estacional: null,
      primera,
      estacionalesActivos,
      mensajesActivos: frequency !== "off" && soundPrefs.sound,
    };
  }, [identity, socialContext, animo, primera, estacionalesActivos, frequency, soundPrefs.sound]);

  // Check whether the automatic display is allowed by the frequency gate.
  const shouldShow = useCallback((): boolean => {
    if (frequency === "off") return false;
    if (!soundPrefs.sound) return false;

    const session = sessionRef.current;

    if (frequency === "cada_sesion" && session.shownThisSession) return false;

    if (frequency === "diaria") {
      const today = new Date().toISOString().slice(0, 10);
      if (session.lastShownDate === today) return false;
    }

    if (frequency === "semanal") {
      const thisWeek = getISOWeekString(new Date());
      if (session.lastShownWeek === thisWeek) return false;
    }

    return true;
  }, [frequency, soundPrefs.sound]);

  // Automatic display: runs when the component mounts and whenever the gating
  // conditions change.
  useEffect(() => {
    if (!shouldShow()) return;

    const ctx = buildContext();
    if (!ctx) return;

    const seed = `${identity?.animalId ?? "unknown"}-${ctx.fecha}`;
    const selected = pickAnimoMessage(ANIMO_CATALOG, ctx, historyRef.current, seed);

    if (selected) {
      setMessage(selected);
      const now = Date.now();
      const today = new Date().toISOString().slice(0, 10);
      const thisWeek = getISOWeekString(new Date());
      sessionRef.current = {
        lastShownAt: now,
        lastShownDate: today,
        lastShownWeek: thisWeek,
        shownThisSession: true,
      };
      saveSession(sessionRef.current);

      historyRef.current = updateHistory(historyRef.current, selected.id);
      saveHistory(historyRef.current);
    }
  }, [buildContext, shouldShow, identity?.animalId]);

  // Force-show: triggered by showNow(), bypasses frequency and sound gates.
  useEffect(() => {
    if (forceShow === 0) return;

    const ctx = buildContext();
    if (!ctx) return;

    const seed = `${identity?.animalId ?? "unknown"}-preview-${Date.now()}`;
    const selected = pickAnimoMessage(ANIMO_CATALOG, ctx, historyRef.current, seed);

    if (selected) {
      setMessage(selected);
      const now = Date.now();
      const today = new Date().toISOString().slice(0, 10);
      const thisWeek = getISOWeekString(new Date());
      sessionRef.current = {
        lastShownAt: now,
        lastShownDate: today,
        lastShownWeek: thisWeek,
        shownThisSession: true,
      };
      saveSession(sessionRef.current);

      historyRef.current = updateHistory(historyRef.current, selected.id);
      saveHistory(historyRef.current);
    }
  }, [forceShow, buildContext, identity?.animalId]);

  const dismiss = useCallback(() => {
    setMessage(null);
  }, []);

  const showNow = useCallback(() => {
    setForceShow((n) => n + 1);
  }, []);

  return { message, dismiss, showNow };
}
