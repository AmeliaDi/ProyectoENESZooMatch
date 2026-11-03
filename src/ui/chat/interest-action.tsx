"use client";

/**
 * "Me interesa conocerte" in the match detail sheet. The state comes from the
 * server only (no optimistic "sent"): after POST/DELETE the shared store is
 * re-read. Nothing here tells whether the other person signalled until the
 * server reports an open conversation.
 */
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";

import type { ChatTrack, InterestStateDto } from "@/contracts/chat";
import { Button } from "@/ui/kit/button";
import { Icon } from "@/ui/kit/icon";

import { CHAT_COPY, INTEREST_COPY } from "./chat-copy";
import {
  hasInterestHandle,
  interestApi,
  interestKey,
  loadInterest,
  readInterest,
  readInterestOnServer,
  subscribeInterest,
} from "./interest-api";
import { conversationHref } from "./use-open-conversation";

function messageFor(code: string): string {
  if (code === "chat.match_gone") return INTEREST_COPY.gone;
  if (code === "auth.unauthorized") return INTEREST_COPY.noSession;
  if (code === "service.unavailable" || code === "service.misconfigured") return CHAT_COPY.unavailable;
  return INTEREST_COPY.failed;
}

function useInterestState(track: ChatTrack, matchId: string) {
  const snapshot = useSyncExternalStore(subscribeInterest, readInterest, readInterestOnServer);
  useEffect(() => void loadInterest(), []);
  const state: InterestStateDto | null = snapshot.kind === "ready" ? (snapshot.states[interestKey(track, matchId)] ?? null) : null;
  return { snapshot, state };
}

function OpenNotice({ conversation }: { conversation: string }) {
  return (
    <div className="zm-interest__state">
      <p className="zm-interest__title"><Icon name="check" /> {INTEREST_COPY.open}</p>
      <Link href={conversationHref(conversation)} className="zm-box zm-btn zm-btn--primary zm-interest__link">
        <Icon name="next" /> {INTEREST_COPY.openLink}
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

function InterestControls({ matchId, track }: { matchId: string; track: ChatTrack }) {
  const { snapshot, state } = useInterestState(track, matchId);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run(action: "send" | "withdraw") {
    setBusy(true);
    setMessage(null);
    const reply = await interestApi[action](matchId, track);
    await loadInterest(true);
    setBusy(false);
    if (!reply.ok) setMessage(messageFor(reply.code));
    else if (action === "withdraw") setMessage(INTEREST_COPY.withdrawn);
  }

  const failedLoad = snapshot.kind === "error" ? messageFor(snapshot.code) : null;
  return (
    <div className="zm-interest">
      {state?.state === "open" ? <OpenNotice conversation={state.conversation} /> : null}
      {state?.state === "sent" ? (
        <div className="zm-interest__state">
          <p className="zm-interest__title"><Icon name="check" /> {INTEREST_COPY.sent}</p>
          <Button variant="ghost" icon="close" busy={busy} disabled={busy} onClick={() => void run("withdraw")}>{INTEREST_COPY.withdraw}</Button>
        </div>
      ) : null}
      {state === null && snapshot.kind === "ready" ? (
        <Button variant="secondary" icon={track} className="zm-interest__send" busy={busy} disabled={busy} onClick={() => void run("send")}>
          {INTEREST_COPY.send}
        </Button>
      ) : null}
      {snapshot.kind === "loading" || snapshot.kind === "idle" ? <p className="zm-detail__muted">{INTEREST_COPY.loading}</p> : null}
      {failedLoad ? <Button variant="ghost" onClick={() => void loadInterest(true)}>{INTEREST_COPY.retry}</Button> : null}
      <p className="zm-chat__message" role="status" aria-live="polite">{message ?? failedLoad}</p>
    </div>
  );
}
