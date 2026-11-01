"use client";

import { useRef, type KeyboardEvent } from "react";

import { diamondPath, likertGemSizes } from "@/ui/design/shapes";

import { nextRovingIndex } from "./roving";

export interface LikertOption {
  value: number;
  label: string;
}

export interface LikertProps {
  /** Accessible group name, usually the item statement's id. */
  labelledBy: string;
  options: readonly LikertOption[];
  value: number | null;
  onChange: (value: number) => void;
  /** Short end labels shown under the row (from the first/last option). */
  showEnds?: boolean;
}

/**
 * Five pixel gems instead of radio buttons. The ends are bigger than the
 * centre so the scale reads as "how much", and the chosen gem turns gold and
 * lights up. It is a real `radiogroup`: roving tabindex, arrows select,
 * Home/End jump, the label of the current choice is announced.
 */
export function Likert({ labelledBy, options, value, onChange, showEnds = true }: LikertProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const sizes = likertGemSizes(options.length);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const focusIndex = selectedIndex >= 0 ? selectedIndex : Math.floor(options.length / 2);
  const current = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = nextRovingIndex(index, options.length, event.key);
    if (next === null) return;
    event.preventDefault();
    const option = options[next];
    if (!option) return;
    onChange(option.value);
    refs.current[next]?.focus();
  }

  return (
    <div className="zm-likert">
      <div role="radiogroup" aria-labelledby={labelledBy} className="zm-likert__row">
        {options.map((option, index) => {
          const checked = option.value === value;
          const gem = sizes[index] ?? 9;
          return (
            <button
              key={option.value}
              ref={(node) => {
                refs.current[index] = node;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={option.label}
              tabIndex={index === focusIndex ? 0 : -1}
              className="zm-likert__option"
              onClick={() => onChange(option.value)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              <svg
                className="zm-likert__gem zm-crisp"
                style={{ ["--gem" as string]: gem }}
                viewBox={`0 0 ${gem} ${gem}`}
                aria-hidden="true"
                focusable="false"
              >
                <path d={diamondPath(gem, !checked)} fill="currentColor" />
              </svg>
            </button>
          );
        })}
      </div>
      {showEnds && options.length > 1 ? (
        <div className="zm-likert__ends" aria-hidden="true">
          <span>{options[0]?.label}</span>
          <span>{options[options.length - 1]?.label}</span>
        </div>
      ) : null}
      <p className="zm-likert__current" aria-live="polite">
        {current ? current.label : "\u00a0"}
      </p>
    </div>
  );
}
