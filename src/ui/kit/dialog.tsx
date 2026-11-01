"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

import { IconButton } from "./button";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** `sheet`: bottom sheet on mobile, side panel ≥ 768 px. `modal`: centred. */
  kind?: "sheet" | "modal";
  closeLabel?: string;
  children: ReactNode;
}

/**
 * Built on the native `<dialog>` + `showModal()`: focus trap, Escape, inert
 * background and top-layer stacking come from the platform, so there is no
 * hand-rolled focus management to get wrong. The backdrop is a Bayer 75 %
 * dither of the shadow colour, not a blur.
 */
export function Dialog({ open, onClose, title, kind = "sheet", closeLabel = "Cerrar", children }: DialogProps) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`zm-dialog zm-${kind}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A click whose target is the <dialog> itself landed on the backdrop.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="zm-box zm-box--frame zm-dialog__panel">
        {kind === "sheet" ? <div className="zm-sheet__grip" aria-hidden="true" /> : null}
        <div className="zm-dialog__head">
          <h2 id={titleId} className="zm-dialog__title">
            {title}
          </h2>
          <IconButton icon="close" label={closeLabel} onClick={onClose} />
        </div>
        <div className="zm-dialog__body">{children}</div>
      </div>
    </dialog>
  );
}
