"use client";

/**
 * Signal in the match detail sheet (docs/CHAT.md §10.1): a clear button per
 * track — romance or friendship, with the pixel icon of the track — and an
 * honest line on how it works. The state comes from the server only (no
 * optimistic "sent"). An invitation received shows the same gesture plus
 * "ahora no". Nothing here tells whether the other person declined.
 */
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";

import type { ChatTrack, InterestStateDto } from "@/contracts/chat";
import { Button } from "@/ui/kit/button";
import { Icon } from "@/ui/kit/icon";

import { AdultGate } from "./adult-gate";
import { CHAT_COPY, INTEREST_COPY } from "./chat-copy";
import { hasInterestHandle, interestApi, interestKey, loadInterest, readInterest, readInterestOnServer, subscribeInterest } from "./interest-api";
import { conversationError } from "./use-conversation";
import { conversationHref } from "./use-open-conversation";

function messageFor(code: string): string {
  if (code === "chat.match_gone") return INTEREST_COPY.gone;
  if (code === "auth.unauthorized") return INTEREST_COPY.noSession;
  if (code === "service.unavailable" || code === "service.misconfigured") return CHAT_COPY.unavailable;
  return conversationError(code);
}

function useInterestState(track: ChatTrack, matchId: string) {
  const snapshot = useSyncExternalStore(subscribeInterest, readInterest, readInterestOnServer);
  useEffect(() => void loadInterest(), []);
  const state: InterestStateDto | null = snapshot.kind === "ready" ? (snapshot.states[interestKey(track, matchId)] ?? null) : null;
  return { snapshot, state, adult: snapshot.kind === "ready" && snapshot.adult };
}

function OpenNotice({ conversation }: { conversation: string }) {
  return (
    <div className="zm-interest__state">
      <p className="zm-interest__title"><Icon name="check" /> {INTEREST_COPY.open}</p>
      <Link href={conversationHref(conversation)} className="zm-box zm-btn zm-btn--primary zm-interest__link">
        <Icon name="next" /> {INTEREST_COPY.openNow}
      </Link>
    </div>
  );
}

export interface InterestActionProps {
  matchId: string | null;
  track: ChatTrack;
}

export function InterestAction({ matchId, track }: InterestActionProps) {
  if (!hasInterestHandle(matchId, track)) return null;
  return <InterestControls matchId={matchId} track={track} />;
}

type Action = "send" | "withdraw" | "decline";

function InterestControls({ matchId, track }: { matchId: string; track: ChatTrack }) {
  const { snapshot, state, adult } = useInterestState(track, matchId);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const needsAdult = track === "romance" && snapshot.kind === "ready" && !adult;

  async function run(action: Action) {
    setBusy(true);
    setMessage(null);
    const reply = await interestApi[action](matchId, track);
    await loadInterest(true);
    setBusy(false);
    if (!reply.ok) setMessage(messageFor(reply.code));
    else if (action === "withdraw") setMessage(INTEREST_COPY.withdrawn);
    else if (action === "decline") setMessage(INTEREST_COPY.notNowDone);
  }

  const failedLoad = snapshot.kind === "error" ? messageFor(snapshot.code) : null;
  const sendLabel = track === "romance" ? INTEREST_COPY.sendRomance : INTEREST_COPY.sendAmistad;
  const canSend = snapshot.kind === "ready" && (state === null || state.state === "invited") && !needsAdult;
  return (
    <div className="zm-interest">
      {state?.state === "open" ? <OpenNotice conversation={state.conversation} /> : null}
      {state?.state === "sent" ? (
        <div className="zm-interest__state">
          <p className="zm-interest__title"><Icon name="check" /> {INTEREST_COPY.sent}</p>
          <Button variant="ghost" icon="close" busy={busy} disabled={busy} onClick={() => void run("withdraw")}>{INTEREST_COPY.withdraw}</Button>
        </div>
      ) : null}
      {state?.state === "invited" ? <p className="zm-interest__title">{INTEREST_COPY.invitedTitle}</p> : null}
      {needsAdult && state?.state !== "open" ? <AdultGate onConfirmed={() => setMessage(null)} /> : null}
      {canSend ? (
        <>
          <Button variant="secondary" icon={track} className="zm-interest__send" busy={busy} disabled={busy} onClick={() => void run("send")}>
            {state?.state === "invited" ? INTEREST_COPY.accept : sendLabel}
          </Button>
          {state?.state === "invited" ? <Button variant="ghost" disabled={busy} onClick={() => void run("decline")}>{INTEREST_COPY.notNow}</Button> : null}
          <p className="zm-detail__muted">{INTEREST_COPY.how}</p>
        </>
      ) : null}
      {snapshot.kind === "loading" || snapshot.kind === "idle" ? <p className="zm-detail__muted">{INTEREST_COPY.loading}</p> : null}
      {failedLoad ? <Button variant="ghost" onClick={() => void loadInterest(true)}>{INTEREST_COPY.retry}</Button> : null}
      <p className="zm-chat__message" role="status" aria-live="polite">{message ?? failedLoad}</p>
    </div>
  );
}
