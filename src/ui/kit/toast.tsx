"use client";

import type { IconName } from "@/ui/design/icons";

import { IconButton } from "./button";
import { Icon } from "./icon";

export type ToastTone = "neutral" | "romance" | "amistad";

export interface ToastData {
  id: string;
  tone: ToastTone;
  title: string;
  body?: string;
}

const TONE_ICON: Record<ToastTone, IconName> = {
  neutral: "notification",
  romance: "romance",
  amistad: "amistad",
};

export interface ToastStackProps {
  toasts: readonly ToastData[];
  onDismiss: (id: string) => void;
}

/**
 * Polite live region; toasts never steal focus and never auto-expire with a
 * countdown (no false urgency): the person dismisses them, or the provider
 * groups them. Icons replace emojis.
 */
export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  return (
    <div className="zm-toast-region" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`zm-box zm-toast zm-toast--${toast.tone}`}>
          <Icon name={TONE_ICON[toast.tone]} filled />
          <div>
            <p className="zm-toast__title">{toast.title}</p>
            {toast.body ? <p className="zm-toast__body">{toast.body}</p> : null}
          </div>
          <IconButton icon="close" label="Descartar aviso" onClick={() => onDismiss(toast.id)} />
        </div>
      ))}
    </div>
  );
}
