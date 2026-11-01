"use client";

/**
 * Selector de lenguaje inclusivo.
 *
 * The preference is stored per browser (localStorage) and read through
 * `useSyncExternalStore`, so server rendering always paints the default mode and
 * hydration never mismatches. Every selector instance stays in sync through the
 * custom event emitted by `writeInclusiveMode`.
 */

import { useId, useSyncExternalStore } from "react";

import {
  INCLUSIVE_MODES,
  getInclusiveModeServerSnapshot,
  getInclusiveModeSnapshot,
  subscribeInclusiveMode,
  writeInclusiveMode,
  type InclusiveMode,
} from "@/domain/messages/inclusive-text";
import { ChoiceGroup } from "@/ui/kit/choice";

export function useInclusiveMode(): InclusiveMode {
  return useSyncExternalStore(
    subscribeInclusiveMode,
    getInclusiveModeSnapshot,
    getInclusiveModeServerSnapshot,
  );
}

const OPTIONS = INCLUSIVE_MODES.map((mode) => ({ value: mode.id, label: mode.label }));

export function InclusiveModeSelector({ className }: { className?: string }) {
  const mode = useInclusiveMode();
  const labelId = useId();
  return (
    <div className={["zm-setting", className ?? ""].join(" ")}>
      <p id={labelId} className="zm-setting__label">
        ¿Cómo quieres que te hablemos?
      </p>
      <ChoiceGroup<InclusiveMode>
        labelledBy={labelId}
        options={OPTIONS}
        selected={[mode]}
        onToggle={writeInclusiveMode}
      />
    </div>
  );
}

export default InclusiveModeSelector;
