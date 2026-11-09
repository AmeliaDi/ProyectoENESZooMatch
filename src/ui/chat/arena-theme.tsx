"use client";

/**
 * Shared visual themes for the Game Boy handheld encounter console (`/chats`)
 * and the interactive Constellation Cuartitos (`/resultado`):
 * - `constelacion`: Starry deep-indigo Atlas night with twinkling pixel stars
 * - `sakura`: Warm cherry-blossom twilight with drifting pixel sakura petals
 * - `alto-contraste`: Crisp 1-bit obsidian, pure white, and radiant gold
 * - `gameboy`: Classic 1989 DMG-01 olive-green phosphor LCD
 */
import { useCallback, useEffect, useState } from "react";

export type ArenaThemeId = "constelacion" | "sakura" | "alto-contraste" | "gameboy";

export interface ArenaThemeSpec {
  id: ArenaThemeId;
  label: string;
  shortLabel: string;
  hint: string;
}

export const ARENA_THEMES: readonly ArenaThemeSpec[] = [
  {
    id: "constelacion",
    label: "Constelación",
    shortLabel: "Constelación",
    hint: "Cielo estelar profundo con destellos",
  },
  {
    id: "sakura",
    label: "Flor Sakura",
    shortLabel: "Sakura",
    hint: "Brisa de pétalos rosados al atardecer",
  },
  {
    id: "alto-contraste",
    label: "Alto Contraste",
    shortLabel: "Contraste",
    hint: "Trazos 1-bit de máxima nitidez",
  },
  {
    id: "gameboy",
    label: "GB Clásico",
    shortLabel: "Game Boy",
    hint: "Pantalla LCD verde olivo clásica",
  },
] as const;

const STORAGE_KEY = "zm-arena-theme";
const EVENT_NAME = "zm-arena-theme-change";

export function isArenaThemeId(value: unknown): value is ArenaThemeId {
  return (
    value === "constelacion" ||
    value === "sakura" ||
    value === "alto-contraste" ||
    value === "gameboy"
  );
}

export function readArenaTheme(): ArenaThemeId {
  if (typeof window === "undefined") return "constelacion";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isArenaThemeId(raw) ? raw : "constelacion";
  } catch {
    return "constelacion";
  }
}

export function writeArenaTheme(theme: ArenaThemeId): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
    window.dispatchEvent(new CustomEvent<ArenaThemeId>(EVENT_NAME, { detail: theme }));
  } catch {
    // Private mode or storage quota exceeded.
  }
}

export function useArenaTheme(): readonly [ArenaThemeId, (next: ArenaThemeId) => void] {
  const [theme, setThemeState] = useState<ArenaThemeId>(() => readArenaTheme());

  useEffect(() => {
    const onCustom = (event: Event) => {
      const detail = (event as CustomEvent<ArenaThemeId>).detail;
      if (isArenaThemeId(detail)) setThemeState(detail);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && isArenaThemeId(event.newValue)) {
        setThemeState(event.newValue);
      }
    };
    window.addEventListener(EVENT_NAME, onCustom);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT_NAME, onCustom);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setTheme = useCallback((next: ArenaThemeId) => {
    setThemeState(next);
    writeArenaTheme(next);
  }, []);

  return [theme, setTheme] as const;
}

export interface PixelParticle {
  id: string;
  leftPercent: number;
  topPercent: number;
  delayMs: number;
  durationMs: number;
  size: 1 | 2;
}

export const AMBIENT_PARTICLES: readonly PixelParticle[] = [
  { id: "p-1", leftPercent: 8, topPercent: 14, delayMs: 0, durationMs: 4200, size: 2 },
  { id: "p-2", leftPercent: 22, topPercent: 28, delayMs: 600, durationMs: 5100, size: 1 },
  { id: "p-3", leftPercent: 37, topPercent: 12, delayMs: 1300, durationMs: 4600, size: 2 },
  { id: "p-4", leftPercent: 52, topPercent: 22, delayMs: 300, durationMs: 5400, size: 1 },
  { id: "p-5", leftPercent: 68, topPercent: 18, delayMs: 1800, durationMs: 4400, size: 2 },
  { id: "p-6", leftPercent: 83, topPercent: 32, delayMs: 900, durationMs: 4900, size: 1 },
  { id: "p-7", leftPercent: 15, topPercent: 64, delayMs: 1500, durationMs: 5200, size: 1 },
  { id: "p-8", leftPercent: 46, topPercent: 58, delayMs: 2100, durationMs: 4700, size: 2 },
  { id: "p-9", leftPercent: 76, topPercent: 68, delayMs: 750, durationMs: 5000, size: 2 },
  { id: "p-10", leftPercent: 91, topPercent: 15, delayMs: 1100, durationMs: 4300, size: 1 },
] as const;

/**
 * Crisp pixel-art backdrop particles rendered inside the LCD / Cuartito screen:
 * - `sakura`: notched 6x6 pixel cherry blossom petals drifting diagonally
 * - `constelacion`: twinkling pixel cross-stars
 * - `alto-contraste` / `gameboy`: clean minimal LCD without floating particles
 */
export function ArenaThemeBackdrop({ theme }: { theme: ArenaThemeId }) {
  if (theme === "alto-contraste" || theme === "gameboy") return null;

  return (
    <div className="zm-arena__backdrop" data-theme-fx={theme} aria-hidden="true">
      {AMBIENT_PARTICLES.map((p) => (
        <span
          key={p.id}
          className="zm-arena__particle"
          style={{
            left: `${p.leftPercent}%`,
            top: `${p.topPercent}%`,
            animationDelay: `${p.delayMs}ms`,
            animationDuration: `${p.durationMs}ms`,
          }}
        >
          {theme === "sakura" ? (
            <svg
              width={p.size === 2 ? 12 : 10}
              height={p.size === 2 ? 12 : 10}
              viewBox="0 0 6 6"
              className="zm-crisp"
            >
              <path
                d="M1 0h2v1h2v2H4v2H2V4H0V2h1V0z"
                fill="var(--zm-gold)"
              />
              <rect x="2" y="2" width="1" height="1" fill="var(--zm-fg)" />
            </svg>
          ) : (
            <svg
              width={p.size === 2 ? 10 : 6}
              height={p.size === 2 ? 10 : 6}
              viewBox="0 0 5 5"
              className="zm-crisp"
            >
              {p.size === 2 ? (
                <path d="M2 0h1v2h2v1H3v2H2V3H0V2h2V0z" fill="var(--zm-gold)" />
              ) : (
                <rect x="1" y="1" width="3" height="3" fill="var(--zm-rim)" />
              )}
            </svg>
          )}
        </span>
      ))}
    </div>
  );
}

export function ArenaThemeBar({
  theme,
  onChange,
  label = "Tema de consola",
}: {
  theme: ArenaThemeId;
  onChange: (next: ArenaThemeId) => void;
  label?: string;
}) {
  return (
    <div className="zm-theme-bar" role="radiogroup" aria-label={label}>
      <span className="zm-theme-bar__label">TEMA:</span>
      <div className="zm-theme-bar__pills">
        {ARENA_THEMES.map((item) => {
          const active = item.id === theme;
          return (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={active}
              className="zm-box zm-theme-bar__pill"
              data-theme-id={item.id}
              data-active={active || undefined}
              onClick={() => onChange(item.id)}
              title={item.hint}
            >
              <span className="zm-theme-bar__swatch" data-swatch={item.id} aria-hidden="true" />
              <span>{item.shortLabel}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
