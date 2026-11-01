"use client";

import { useRef, type KeyboardEvent } from "react";

import type { IconName } from "@/ui/design/icons";

import { Icon } from "./icon";
import { nextRovingIndex } from "./roving";

export interface TabItem<K extends string> {
  key: K;
  label: string;
  icon?: IconName;
  tone?: "romance" | "amistad";
}

export interface TabsProps<K extends string> {
  items: readonly TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  label: string;
  /** Prefix for tab/panel ids so panels can use `aria-labelledby`. */
  idPrefix: string;
}

/** Automatic-activation tabs (arrow keys select), roving tabindex. */
export function Tabs<K extends string>({ items, value, onChange, label, idPrefix }: TabsProps<K>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = nextRovingIndex(index, items.length, event.key);
    if (next === null) return;
    event.preventDefault();
    const item = items[next];
    if (!item) return;
    onChange(item.key);
    refs.current[next]?.focus();
  }

  return (
    <div role="tablist" aria-label={label} className="zm-box zm-box--flat zm-tabs">
      {items.map((item, index) => {
        const selected = item.key === value;
        return (
          <button
            key={item.key}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${item.key}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${item.key}`}
            tabIndex={selected ? 0 : -1}
            data-tone={item.tone}
            className="zm-box zm-tab"
            onClick={() => onChange(item.key)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {item.icon ? <Icon name={item.icon} filled={selected} /> : null}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
