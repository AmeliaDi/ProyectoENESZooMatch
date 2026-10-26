"use client";

/**
 * Selector de lenguaje inclusivo.
 *
 * The preference is stored per browser (localStorage) and read through
 * `useSyncExternalStore`, so server rendering always paints the default mode and
 * hydration never mismatches. Every selector instance stays in sync through the
 * custom event emitted by `writeInclusiveMode`.
 */

import { useSyncExternalStore } from "react";

import {
  INCLUSIVE_MODES,
  getInclusiveModeServerSnapshot,
  getInclusiveModeSnapshot,
  subscribeInclusiveMode,
  writeInclusiveMode,
  type InclusiveMode,
} from "@/lib/inclusive-text";

export function useInclusiveMode(): InclusiveMode {
  return useSyncExternalStore(
    subscribeInclusiveMode,
    getInclusiveModeSnapshot,
    getInclusiveModeServerSnapshot,
  );
}

export function InclusiveModeSelector({ className }: { className?: string }) {
  const mode = useInclusiveMode();

  return (
    <fieldset className={className}>
      <legend className="font-mono text-[0.6rem] font-bold uppercase tracking-[0.16em] text-ink/45">
        Lenguaje inclusivo
      </legend>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {INCLUSIVE_MODES.map((option) => {
          const active = option.id === mode;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              title={option.description}
              onClick={() => writeInclusiveMode(option.id)}
              className={`rounded-full border px-3 py-1.5 text-[0.7rem] font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-clay focus-visible:ring-offset-2 focus-visible:ring-offset-paper ${
                active
                  ? "border-moss bg-moss text-paper"
                  : "border-ink/20 bg-paper/60 text-ink/65 hover:border-clay/60 hover:text-ink"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export default InclusiveModeSelector;
