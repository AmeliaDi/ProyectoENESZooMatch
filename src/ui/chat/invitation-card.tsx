"use client";

/**
 * Invitation received: soft card with the match's sprite and alias (nothing
 * new about them) and three ways out — the same gesture, "ahora no" (silent
 * for the sender), or simply ignoring it. No counters, no urgency.
 */
import { useState } from "react";

import type { InvitationDto } from "@/contracts/chat";
import { Button } from "@/ui/kit/button";

import { AdultGate } from "./adult-gate";
import { INTEREST_COPY, trackLabel } from "./chat-copy";
import { interestApi, loadInterest } from "./interest-api";
import { conversationError } from "./use-conversation";
import { PeerSprite } from "./peer-sprite";

const SPRITE_SIZE = 40;

export interface InvitationCardProps {
  invitation: InvitationDto;
  /** A conversation opened (the gesture matched): go there. */
  onOpened(conversationId: string): void;
  onDone(): void;
}

export function InvitationCard({ invitation, onOpened, onDone }: InvitationCardProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [needsAdult, setNeedsAdult] = useState(false);
  const icon = invitation.track;

  async function accept() {
    setBusy(true);
    const reply = await interestApi.send(invitation.match, invitation.track);
    setBusy(false);
    void loadInterest(true);
    if (!reply.ok && reply.code === "chat.adult_required") return setNeedsAdult(true);
    if (!reply.ok) return setMessage(conversationError(reply.code));
    if (reply.data.state === "open") onOpened(reply.data.conversation);
    else onDone();
  }

  async function notNow() {
    setBusy(true);
    const reply = await interestApi.decline(invitation.match, invitation.track);
    setBusy(false);
    void loadInterest(true);
    if (!reply.ok) return setMessage(conversationError(reply.code));
    setMessage(INTEREST_COPY.notNowDone);
    onDone();
  }

  return (
    <li>
      <article className="zm-box zm-box--frame zm-invite" data-tone={invitation.track} aria-label={INTEREST_COPY.invitedTitle}>
        <PeerSprite peer={invitation.peer} size={SPRITE_SIZE} />
        <div className="zm-invite__text">
          <p className="zm-inbox__alias">{invitation.peer.alias}</p>
          <p className="zm-inbox__meta">{trackLabel(invitation.track)} · {INTEREST_COPY.invitedTitle}</p>
          <p className="zm-detail__muted">{INTEREST_COPY.invitedBody}</p>
          <div className="zm-chat__actions">
            <Button variant="primary" icon={icon} busy={busy} disabled={busy} onClick={() => void accept()}>{INTEREST_COPY.accept}</Button>
            <Button variant="ghost" disabled={busy} onClick={() => void notNow()}>{INTEREST_COPY.notNow}</Button>
          </div>
          {needsAdult ? <AdultGate onConfirmed={() => { setNeedsAdult(false); void accept(); }} /> : null}
          <p className="zm-chat__message" role="status" aria-live="polite">{message}</p>
        </div>
      </article>
    </li>
  );
}
