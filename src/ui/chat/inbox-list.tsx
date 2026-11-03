"use client";

/**
 * The inbox: one row per conversation with the sprite, alias, track, stage in
 * words, a "Nuevo" marker (a pixel star plus the word, never colour alone)
 * and "Te toca" when the viewer can act. Polls calmly while visible.
 */
import { useCallback, useEffect, useState } from "react";

import { CHAT_CONFIG } from "@/config";
import { Button } from "@/ui/kit/button";
import { Icon } from "@/ui/kit/icon";
import { EmptyState, ErrorState, LoadingState } from "@/ui/kit/states";

import { LOCKED, conversationApi } from "./chat-api";
import { CHAT_COPY, CONVERSATION_COPY, stageLabel, trackLabel } from "./chat-copy";
import type { InboxEntry } from "./chat-parse";
import { PeerSprite } from "./peer-sprite";
import { conversationError } from "./use-conversation";
import { useVisiblePoll } from "./use-visible-poll";

const SPRITE_SIZE = 40;

type InboxState = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; list: InboxEntry[] };

function useInbox(onLocked: () => void) {
  const [state, setState] = useState<InboxState>({ kind: "loading" });
  const reload = useCallback(async () => {
    const reply = await conversationApi.inbox();
    if (reply.ok) return setState({ kind: "ready", list: reply.data.conversations });
    if (reply.code === LOCKED) return onLocked();
    const message = conversationError(reply.code);
    setState((prev) => (prev.kind === "ready" ? prev : { kind: "error", message }));
  }, [onLocked]);
  useEffect(() => {
    const first = window.setTimeout(() => void reload(), 0);
    return () => window.clearTimeout(first);
  }, [reload]);
  useVisiblePoll(() => void reload(), CHAT_CONFIG.conversation.inboxPollSeconds, state.kind === "ready");
  return [state, reload] as const;
}

function InboxRow({ entry, onOpen }: { entry: InboxEntry; onOpen(id: string): void }) {
  return (
    <li>
      <button type="button" className="zm-box zm-inbox__row" data-tone={entry.track} onClick={() => onOpen(entry.id)}>
        <PeerSprite peer={entry.peer} size={SPRITE_SIZE} />
        <span className="zm-inbox__text">
          <span className="zm-inbox__alias">{entry.peer.alias}</span>
          <span className="zm-inbox__meta">
            {trackLabel(entry.track)} · {stageLabel(entry.stage, entry.progress)}
          </span>
        </span>
        <span className="zm-inbox__flags">
          {entry.unread ? (
            <span className="zm-inbox__flag" data-kind="new"><Icon name="loading" filled /> {CONVERSATION_COPY.unread}</span>
          ) : null}
          {entry.myTurn ? <span className="zm-inbox__flag" data-kind="turn">{CONVERSATION_COPY.myTurn}</span> : null}
        </span>
      </button>
    </li>
  );
}

export interface InboxProps {
  onOpen(id: string): void;
  onLock(): void;
  onLocked(): void;
}

export function Inbox({ onOpen, onLock, onLocked }: InboxProps) {
  const [state, reload] = useInbox(onLocked);
  return (
    <>
      {state.kind === "loading" ? <LoadingState title={CONVERSATION_COPY.loading} /> : null}
      {state.kind === "error" ? (
        <ErrorState title={state.message} action={<Button onClick={() => void reload()}>{CONVERSATION_COPY.retry}</Button>} />
      ) : null}
      {state.kind === "ready" && state.list.length === 0 ? <EmptyState title={CHAT_COPY.emptyTitle} body={CHAT_COPY.empty} /> : null}
      {state.kind === "ready" && state.list.length > 0 ? (
        <>
          <h2 className="zm-chat__title">{CONVERSATION_COPY.inboxTitle}</h2>
          <ul className="zm-inbox">
            {state.list.map((entry) => <InboxRow key={entry.id} entry={entry} onOpen={onOpen} />)}
          </ul>
        </>
      ) : null}
      <div className="zm-chat__actions">
        <Button variant="secondary" icon="privacy" onClick={onLock}>{CHAT_COPY.lock}</Button>
      </div>
    </>
  );
}
