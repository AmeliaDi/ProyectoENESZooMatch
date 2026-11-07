"use client";

/**
 * Pixel speech bubble that displays an ánimo message from the user's animal
 * companion. Appears on the main screen (/resultado) once per session (or as
 * configured), respects sound/vibration settings, and includes accessibility
 * features (aria-live, contrast, 44px touch targets).
 */

import { useEffect, type ReactNode } from "react";

import type { AnimoMessage } from "@/domain/animo/pick-animo-message";
import { emitSound } from "@/ui/feedback/feedback";

export interface AnimoBubbleProps {
  message: AnimoMessage | null;
  onDismiss: () => void;
  /** Optional animal companion sprite to position the bubble above. */
  children?: ReactNode;
}

/**
 * Speech bubble component. Uses pixel-art styling with design tokens, includes
 * a close button with 44px touch target, and announces the message to screen
 * readers via aria-live="polite".
 */
export function AnimoBubble({ message, onDismiss, children }: AnimoBubbleProps) {
  useEffect(() => {
    if (message) {
      emitSound("badge");
    }
  }, [message]);

  return (
    <div className="zm-animo-container">
      {children}
      {message && (
        <div
          className="zm-animo-bubble"
          role="status"
          aria-live="polite"
        >
          <div className="zm-animo-bubble__content">
            <p className="zm-animo-bubble__text">{message.texto}</p>
            <button
              type="button"
              className="zm-animo-bubble__close"
              onClick={onDismiss}
              aria-label="Cerrar mensaje"
            >
              ×
            </button>
          </div>
          <div className="zm-animo-bubble__tail" />
        </div>
      )}
    </div>
  );
}
