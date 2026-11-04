"use client";

/**
 * "¿Abrimos el chat libre?": offered after the minimum of rounds. Opens only
 * when both choose it; the other side's choice is only shown once the viewer
 * chose too (or as a kind invitation when they proposed it). Either side can
 * take it back and keep asking questions.
 */
import { useState } from "react";

import type { ConversationDto } from "@/contracts/chat";
import { Button } from "@/ui/kit/button";
import { Icon } from "@/ui/kit/icon";

import { CONVERSATION_COPY } from "./chat-copy";

export interface FreeInviteProps {
  convo: ConversationDto;
  /** Propose/accept (`true`) or take the proposal back (`false`). */
  onChoose(ready: boolean): Promise<string | null>;
}

export function FreeInvite({ convo, onChoose }: FreeInviteProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (convo.stage !== "rounds" || (!convo.free.canAccept && !convo.free.mine)) return null;

  async function choose(ready: boolean) {
    setBusy(true);
    setError(await onChoose(ready));
    setBusy(false);
  }

  return (
    <section className="zm-box zm-box--frame zm-free-invite" aria-labelledby="free-invite">
      <h3 id="free-invite" className="zm-chat__title"><Icon name="amistad" /> {CONVERSATION_COPY.inviteTitle}</h3>
      <p className="zm-detail__muted">{CONVERSATION_COPY.inviteBody}</p>
      {convo.free.mine ? (
        <>
          <p className="zm-round__pending"><Icon name="check" /> {CONVERSATION_COPY.inviteWaiting}</p>
          <Button variant="ghost" busy={busy} disabled={busy} onClick={() => void choose(false)}>{CONVERSATION_COPY.inviteUndo}</Button>
        </>
      ) : (
        <Button variant="primary" icon="check" busy={busy} disabled={busy} onClick={() => void choose(true)}>{CONVERSATION_COPY.inviteAccept}</Button>
      )}
      <p className="zm-chat__message" role="status" aria-live="polite">{error}</p>
    </section>
  );
}
