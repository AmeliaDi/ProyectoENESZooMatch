"use client";

/**
 * "Retirarme": a kind confirmation. Leaving needs no reason and the other
 * person gets no notice; the conversation simply disappears for both.
 */
import { useState } from "react";

import { Button } from "@/ui/kit/button";
import { Dialog } from "@/ui/kit/dialog";

import { CONVERSATION_COPY } from "./chat-copy";

export interface LeaveButtonProps {
  /** Resolves to an error message, or `null` once the conversation is gone. */
  onLeave(): Promise<string | null>;
  onLeft(): void;
}

export function LeaveButton({ onLeave, onLeft }: LeaveButtonProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    const failure = await onLeave();
    setBusy(false);
    setError(failure);
    if (failure === null) {
      setOpen(false);
      onLeft();
    }
  }

  return (
    <>
      <Button variant="ghost" icon="logout" onClick={() => { setError(null); setOpen(true); }}>
        {CONVERSATION_COPY.leave}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={CONVERSATION_COPY.leaveTitle} kind="modal" closeLabel={CONVERSATION_COPY.leaveCancel}>
        <div className="zm-chat__form">
          <p className="zm-chat__step">{CONVERSATION_COPY.leaveBody}</p>
          <p className="zm-chat__message" role="status" aria-live="polite">{error}</p>
          <div className="zm-chat__actions">
            <Button variant="secondary" onClick={() => setOpen(false)} autoFocus>{CONVERSATION_COPY.leaveCancel}</Button>
            <Button variant="danger" busy={busy} disabled={busy} onClick={() => void confirm()}>{CONVERSATION_COPY.leaveConfirm}</Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
