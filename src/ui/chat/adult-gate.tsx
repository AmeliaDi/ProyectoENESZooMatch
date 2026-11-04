"use client";

/**
 * Self-declared 18+ (ADR-035), asked only when someone tries a romance chat.
 * Honest and light: friendship chats stay fully open without it.
 */
import { useState } from "react";

import { Button } from "@/ui/kit/button";

import { INTEREST_COPY } from "./chat-copy";
import { interestApi, loadInterest } from "./interest-api";
import { conversationError } from "./use-conversation";

export function AdultGate({ onConfirmed }: { onConfirmed(): void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    const reply = await interestApi.confirmAdult();
    setBusy(false);
    if (!reply.ok) return setMessage(conversationError(reply.code));
    await loadInterest(true);
    onConfirmed();
  }

  return (
    <div className="zm-box zm-adult" role="group" aria-labelledby="adult-title">
      <p id="adult-title" className="zm-interest__title">{INTEREST_COPY.adultTitle}</p>
      <p className="zm-detail__muted">{INTEREST_COPY.adultBody}</p>
      <Button variant="secondary" icon="check" busy={busy} disabled={busy} onClick={() => void confirm()}>{INTEREST_COPY.adultConfirm}</Button>
      <p className="zm-chat__message" role="status" aria-live="polite">{message}</p>
    </div>
  );
}
