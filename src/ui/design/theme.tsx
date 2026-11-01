"use client";

/**
 * Theme mode (noche / día / alto contraste) stored per device. The attribute
 * lives on <html> so every token in `atlas.css` follows it; an inline script
 * applies it before first paint to avoid a flash of the wrong sky.
 */

import { useCallback, useSyncExternalStore } from "react";

import { THEME_MODES, type ThemeMode } from "@/config";

export const THEME_STORAGE_KEY = "zoomatch:theme";
const THEME_EVENT = "zoomatch:theme-change";

function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === "string" && (THEME_MODES as readonly string[]).includes(value);
}

/** `null` = follow the system (`prefers-color-scheme`). */
function readStoredTheme(): ThemeMode | null {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(value) ? value : null;
  } catch {
    return null;
  }
}

function subscribe(callback: () => void): () => void {
  window.addEventListener(THEME_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(THEME_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function applyTheme(mode: ThemeMode | null): void {
  try {
    if (mode) window.localStorage.setItem(THEME_STORAGE_KEY, mode);
    else window.localStorage.removeItem(THEME_STORAGE_KEY);
  } catch {
    // Private mode: the choice simply does not persist.
  }
  if (mode) document.documentElement.dataset.theme = mode;
  else delete document.documentElement.dataset.theme;
  window.dispatchEvent(new Event(THEME_EVENT));
}

export function useThemeMode(): [ThemeMode | null, (mode: ThemeMode | null) => void] {
  const mode = useSyncExternalStore(subscribe, readStoredTheme, () => null);
  const set = useCallback((next: ThemeMode | null) => applyTheme(next), []);
  return [mode, set];
}

/** Inline, render-blocking snippet; keep it tiny and dependency-free. */
const THEME_BOOT = `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(${JSON.stringify(
  THEME_MODES,
)}.indexOf(t)>-1)document.documentElement.dataset.theme=t}catch(e){}`;

export function ThemeBootScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />;
}
