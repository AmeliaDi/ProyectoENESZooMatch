"use client";

import { useRef, type KeyboardEvent } from "react";

import type { IconName } from "@/ui/design/icons";

import { Icon } from "./icon";
import { nextRovingIndex } from "./roving";

export interface ChoiceOption<V extends string> {
  value: V;
  label: string;
  hint?: string;
  icon?: IconName;
}

export interface ChoiceGroupProps<V extends string> {
  /** Id of the visible question/legend. */
  labelledBy: string;
  options: readonly ChoiceOption<V>[];
  /** Single value (radio) or several (checkbox). */
  selected: readonly V[];
  onToggle: (value: V) => void;
  multiple?: boolean;
  /** Visual size: `chip` for compact settings, `card` for quiz answers. */
  size?: "chip" | "card";
}

/**
 * Pixel chips that behave like a real radio group or checkbox group: one tab
 * stop, arrows move focus, Space/Enter toggles. A tiny check-star marks the
 * chosen ones so state is never colour-only.
 */
export function ChoiceGroup<V extends string>({
  labelledBy,
  options,
  selected,
  onToggle,
  multiple = false,
  size = "chip",
}: ChoiceGroupProps<V>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const firstSelected = options.findIndex((option) => selected.includes(option.value));
  const tabIndexAt = firstSelected >= 0 ? firstSelected : 0;

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = nextRovingIndex(index, options.length, event.key);
    if (next === null) return;
    event.preventDefault();
    refs.current[next]?.focus();
    const option = options[next];
    if (!multiple && option) onToggle(option.value);
  }

  return (
    <div
      role={multiple ? "group" : "radiogroup"}
      aria-labelledby={labelledBy}
      className={`zm-choices zm-choices--${size}`}
    >
      {options.map((option, index) => {
        const on = selected.includes(option.value);
        return (
          <button
            key={option.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role={multiple ? "checkbox" : "radio"}
            aria-checked={on}
            tabIndex={index === tabIndexAt ? 0 : -1}
            className="zm-box zm-choice"
            onClick={() => onToggle(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            <Icon name={on ? "check" : (option.icon ?? "loading")} filled={on} />
            <span className="zm-choice__text">
              <span>{option.label}</span>
              {option.hint ? <span className="zm-choice__hint">{option.hint}</span> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
