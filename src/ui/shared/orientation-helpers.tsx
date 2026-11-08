"use client";

/**
 * Orientation helper component: shows contextual tips, labels, and legends to
 * guide users through the app. Used in quiz flows, result views, and chat to
 * reduce cognitive load and improve discoverability.
 */

import { useState, type ReactNode } from "react";

import type { IconName } from "@/ui/design/icons";
import { Button } from "@/ui/kit/button";
import { Icon } from "@/ui/kit/icon";

export interface OrientationTipProps {
  /** Unique identifier for this tip (used for dismiss tracking). */
  id: string;
  /** The tip text to display. */
  children: ReactNode;
  /** Icon to show alongside the tip. */
  icon?: IconName;
  /** Where to position the tip relative to its anchor. */
  position?: "top" | "bottom" | "left" | "right";
  /** Whether the tip can be dismissed by the user. */
  dismissible?: boolean;
  /** Optional title for the tip. */
  title?: string;
}

const DISMISSED_TIPS_KEY = "zm-orientation-dismissed:v1";

function loadDismissedTips(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(DISMISSED_TIPS_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

function saveDismissedTip(id: string): void {
  if (typeof window === "undefined") return;
  try {
    const dismissed = loadDismissedTips();
    dismissed.add(id);
    window.localStorage.setItem(DISMISSED_TIPS_KEY, JSON.stringify([...dismissed]));
  } catch {
    // Ignore storage errors
  }
}

export function OrientationTip({
  id,
  children,
  icon = "info",
  position = "top",
  dismissible = true,
  title,
}: OrientationTipProps) {
  const [dismissed, setDismissed] = useState(() => loadDismissedTips().has(id));
  const [visible, setVisible] = useState(!dismissed);

  if (!visible || dismissed) return null;

  const handleDismiss = () => {
    setVisible(false);
    saveDismissedTip(id);
    setDismissed(true);
  };

  return (
    <div
      className="zm-orientation-tip"
      role="note"
      aria-label={title ?? "Ayuda"}
      data-position={position}
    >
      <div className="zm-orientation-tip__content">
        {icon && <Icon name={icon} className="zm-orientation-tip__icon" />}
        <div className="zm-orientation-tip__text">
          {title && <p className="zm-orientation-tip__title">{title}</p>}
          <div className="zm-orientation-tip__body">{children}</div>
        </div>
        {dismissible && (
          <button
            type="button"
            className="zm-orientation-tip__close"
            onClick={handleDismiss}
            aria-label="Cerrar ayuda"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Legend component: explains what visual elements mean (colors, icons, badges).
 * Used in result views and match cards.
 */
export interface LegendItem {
  label: string;
  description: string;
  icon?: IconName;
  color?: string;
}

export function Legend({ items, title = "Leyenda" }: { items: LegendItem[]; title?: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="zm-legend">
      <button
        type="button"
        className="zm-legend__toggle"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <Icon name="info" />
        <span>{title}</span>
        <span className="zm-legend__arrow" aria-hidden="true">{expanded ? "expand_less" : "expand_more"}</span>
      </button>
      {expanded && (
        <div className="zm-legend__content" role="region" aria-label={title}>
          {items.map((item, i) => (
            <div key={i} className="zm-legend__item">
              {item.icon && <Icon name={item.icon} className="zm-legend__icon" />}
              {item.color && (
                <span
                  className="zm-legend__color"
                  style={{ backgroundColor: item.color }}
                  aria-hidden="true"
                />
              )}
              <div className="zm-legend__text">
                <strong>{item.label}</strong>
                <p>{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Contextual help button: opens a modal or tooltip with detailed explanation.
 * Used for complex features that need more than a one-line tip.
 */
export function ContextualHelp({
  title,
  children,
  icon = "help",
}: {
  title: string;
  children: ReactNode;
  icon?: IconName;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="zm-contextual-help__trigger"
        onClick={() => setOpen(true)}
        aria-label={`Ayuda: ${title}`}
      >
        <Icon name={icon} />
      </button>
      {open && (
        <div className="zm-contextual-help__modal" role="dialog" aria-label={title}>
          <div className="zm-contextual-help__backdrop" onClick={() => setOpen(false)} />
          <div className="zm-contextual-help__content">
            <header className="zm-contextual-help__header">
              <h2>{title}</h2>
              <button
                type="button"
                className="zm-contextual-help__close"
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
              >
                ×
              </button>
            </header>
            <div className="zm-contextual-help__body">{children}</div>
          </div>
        </div>
      )}
    </>
  );
}
