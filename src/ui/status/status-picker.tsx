"use client";

/**
 * "Hoy me siento..." status picker component.
 * Shows 6 mood options as pixel-art buttons. Privacy toggle controls
 * whether the status is visible to matches.
 */

import type { AnimoPublicado } from "@/config/animo";
import { STATUS_COPY, STATUS_OPTION_COPY } from "@/domain/status/status-types";
import { Icon } from "@/ui/kit/icon";
import { emitSound } from "@/ui/feedback/feedback";

import { StatusIconSvg } from "./status-icons";

export interface StatusPickerProps {
  /** Currently selected mood, or null. */
  value: AnimoPublicado | null;
  /** Whether the status is visible to matches. */
  visible: boolean;
  /** Called when the mood changes (or is cleared). */
  onChange: (animo: AnimoPublicado | null) => void;
  /** Called when the visibility toggle changes. */
  onVisibilityChange: (visible: boolean) => void;
}

const MOOD_ORDER: readonly AnimoPublicado[] = [
  "cansancio",
  "ansiedad",
  "ganas_de_platicar",
  "necesito_un_abrazo",
  "alegria",
  "concentracion",
];

export function StatusPicker({
  value,
  visible,
  onChange,
  onVisibilityChange,
}: StatusPickerProps) {
  const handleSelect = (mood: AnimoPublicado) => {
    const next = value === mood ? null : mood;
    onChange(next);
    if (next) emitSound("status_publicado");
  };

  const handleClear = () => {
    onChange(null);
  };

  return (
    <div className="zm-status">
      <h3 className="zm-status__title">{STATUS_COPY.title}</h3>
      <div className="zm-status__grid" role="radiogroup" aria-label={STATUS_COPY.title}>
        {MOOD_ORDER.map((mood) => {
          const copy = STATUS_OPTION_COPY[mood];
          const selected = value === mood;
          return (
            <button
              key={mood}
              type="button"
              className="zm-box zm-status__option"
              role="radio"
              aria-checked={selected}
              aria-label={copy.label}
              onClick={() => handleSelect(mood)}
            >
              <StatusIconSvg mood={mood} className="zm-status__icon" />
              <span className="zm-status__label">{copy.label}</span>
            </button>
          );
        })}
      </div>
      {value !== null && (
        <button
          type="button"
          className="zm-box zm-btn zm-btn--ghost"
          onClick={handleClear}
          aria-label={STATUS_COPY.clearLabel}
        >
          <Icon name="close" />
          {STATUS_COPY.clearLabel}
        </button>
      )}
      <label className="zm-status__privacy">
        <span
          className="zm-status__privacy-toggle"
          role="switch"
          aria-checked={visible}
          aria-label={STATUS_COPY.privacyLabel}
          data-on={visible}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === " " || e.key === "Enter") {
              e.preventDefault();
              onVisibilityChange(!visible);
            }
          }}
          onClick={() => onVisibilityChange(!visible)}
        />
        <span>{STATUS_COPY.privacyLabel}</span>
      </label>
      <p className="zm-detail__muted">{STATUS_COPY.privacyHint}</p>
    </div>
  );
}

/**
 * Small inline status badge shown on match cards.
 * Displays the mood icon and label when the person has a visible status.
 */
export function StatusBadge({ animo }: { animo: AnimoPublicado }) {
  const copy = STATUS_OPTION_COPY[animo];
  return (
    <span className="zm-status-badge" aria-label={`Estado: ${copy.label}`}>
      <StatusIconSvg mood={animo} className="zm-status-badge__icon" />
      <span>{copy.label}</span>
    </span>
  );
}
