"use client";

import { useId } from "react";

import { THEME_MODES, type ThemeMode } from "@/config";
import { useThemeMode } from "@/ui/design/theme";
import { ChoiceGroup, type ChoiceOption } from "@/ui/kit/choice";

type ThemeChoice = ThemeMode | "system";

const LABELS: Record<ThemeChoice, { label: string; hint: string }> = {
  system: { label: "Como mi dispositivo", hint: "Sigue el modo claro u oscuro del sistema" },
  night: { label: "Noche", hint: "Cielo profundo" },
  day: { label: "Día", hint: "Carta celeste sobre papel" },
  "night-hc": { label: "Noche · alto contraste", hint: "Máxima legibilidad" },
  "day-hc": { label: "Día · alto contraste", hint: "Máxima legibilidad" },
};

const OPTIONS: readonly ChoiceOption<ThemeChoice>[] = (["system", ...THEME_MODES] as const).map(
  (value) => ({ value, label: LABELS[value].label, hint: LABELS[value].hint }),
);

export function ThemeSelector() {
  const [mode, setMode] = useThemeMode();
  const labelId = useId();
  return (
    <div className="zm-setting">
      <p id={labelId} className="zm-setting__label">
        Cielo
      </p>
      <ChoiceGroup<ThemeChoice>
        labelledBy={labelId}
        options={OPTIONS}
        selected={[mode ?? "system"]}
        onToggle={(value) => setMode(value === "system" ? null : value)}
      />
    </div>
  );
}
