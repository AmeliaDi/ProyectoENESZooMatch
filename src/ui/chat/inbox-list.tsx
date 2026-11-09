"use client";

/**
 * The inbox: invitations received first (soft cards), then one row per
 * conversation with the sprite, alias, track and a short stage. Above the
 * list, two counts answer the only two questions a person has here: what
 * arrived that they have not opened ("Sin leer") and what waits on them
 * ("Te toca"). Each row repeats that in words — a pixel star plus "Nuevo",
 * never colour alone, and "Su turno" when the guided round is the other
 * side's move, with no clock on it. Polls calmly while visible, backing off
 * when idle.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { CHAT_CONFIG } from "@/config";
import type { InvitationDto } from "@/contracts/chat";
import { formatIdentity } from "@/domain/identity/format-identity";
import { Button } from "@/ui/kit/button";
import { Icon } from "@/ui/kit/icon";
import { EmptyState, ErrorState, LoadingState } from "@/ui/kit/states";
import { isHatched } from "@/ui/shared/parse-identity";

import { LOCKED, conversationApi, isTransientFailure } from "./chat-api";
import { CHAT_COPY, CONVERSATION_COPY, INTEREST_COPY, stageShort, trackLabel } from "./chat-copy";
import { turnOf, type InboxEntry } from "./chat-parse";
import { InvitationCard } from "./invitation-card";
import { PeerSprite } from "./peer-sprite";
import { conversationError } from "./use-conversation";
import { useBackoffPoll } from "./use-visible-poll";

const SPRITE_SIZE = 40;

type InboxState =
  | { kind: "loading" }
  | { kind: "error"; message: string; code: string }
  | { kind: "ready"; list: InboxEntry[]; invitations: InvitationDto[] };

function useInbox(onLocked: () => void) {
  const [state, setState] = useState<InboxState>({ kind: "loading" });
  const last = useRef("");
  const reload = useCallback(async (): Promise<boolean> => {
    const reply = await conversationApi.inbox();
    if (reply.ok) {
      const sig = JSON.stringify(reply.data);
      const changed = sig !== last.current;
      last.current = sig;
      setState({ kind: "ready", list: reply.data.conversations, invitations: reply.data.invitations });
      return changed;
    }
    if (reply.code === LOCKED) onLocked();
    const message = conversationError(reply.code, reply.requestId);
    const code = reply.code;
    setState((prev) => (prev.kind === "ready" ? prev : { kind: "error", message, code }));
    return false;
  }, [onLocked]);
  useEffect(() => {
    const first = window.setTimeout(() => void reload(), 0);
    return () => window.clearTimeout(first);
  }, [reload]);
  const { inboxPollSeconds, pollMaxSeconds } = CHAT_CONFIG.conversation;
  useBackoffPoll(reload, inboxPollSeconds, Math.max(inboxPollSeconds, pollMaxSeconds),
    state.kind === "ready" || (state.kind === "error" && isTransientFailure(state.code)));
  return [state, reload] as const;
}

function InboxRow({ entry, onOpen }: { entry: InboxEntry; onOpen(id: string): void }) {
  const name = formatIdentity(entry.peer.identity);
  const turn = turnOf(entry);
  return (
    <li>
      <button type="button" className="zm-box zm-inbox__row" data-tone={entry.track} data-new={entry.unread || undefined} onClick={() => onOpen(entry.id)}>
        <PeerSprite identity={entry.peer.identity} size={SPRITE_SIZE} />
        <span className="zm-inbox__text">
          <span className="zm-inbox__alias">{name.title}</span>
          <span className="zm-inbox__meta zm-inbox__line">
            <span className="zm-inbox__state zm-num">{trackLabel(entry.track)} · {stageShort(entry.stage, entry.completedRounds)}</span>
            {entry.unread ? <span className="zm-inbox__flag" data-kind="new"><Icon name="loading" filled /> {CONVERSATION_COPY.unread}</span> : null}
            {turn === "mine" ? <span className="zm-inbox__flag" data-kind="turn">{CONVERSATION_COPY.myTurn}</span> : null}
            {turn === "theirs" ? <span className="zm-inbox__flag" data-kind="wait">{CONVERSATION_COPY.theirTurn}</span> : null}
          </span>
        </span>
      </button>
    </li>
  );
}

/** The two counts that answer "is there something new, and is it mine to do". */
function tallyOf(rows: readonly InboxEntry[]): { kind: "new" | "turn"; label: string; count: number }[] {
  const newRows = rows.filter((entry) => entry.unread).length;
  const mineRows = rows.filter((entry) => turnOf(entry) === "mine").length;
  return [
    { kind: "new" as const, label: CONVERSATION_COPY.tallyNew, count: newRows },
    { kind: "turn" as const, label: CONVERSATION_COPY.myTurn, count: mineRows },
  ].filter((tally) => tally.count > 0);
}

export interface InboxProps {
  onOpen(id: string): void;
  onLock(): void;
  onLocked(): void;
}

export function Inbox({ onOpen, onLock, onLocked }: InboxProps) {
  const [state, reload] = useInbox(onLocked);
  // The parsers already drop a peer without a stored name; this is the second
  // gate that keeps an egg out of the list — it cannot be opened or answered.
  const rows = state.kind === "ready" ? state.list.filter((entry) => isHatched(entry.peer.identity)) : [];
  const invites = state.kind === "ready" ? state.invitations.filter((inv) => isHatched(inv.peer.identity)) : [];
  const empty = state.kind === "ready" && rows.length === 0 && invites.length === 0;
  const tallies = tallyOf(rows);
  return (
    <>
      {state.kind === "loading" ? <LoadingState title={CONVERSATION_COPY.loading} /> : null}
      {state.kind === "error" ? <ErrorState title={state.message} action={<Button onClick={() => void reload()}>{CONVERSATION_COPY.retry}</Button>} /> : null}
      {empty ? <EmptyState title={CHAT_COPY.emptyTitle} body={CHAT_COPY.empty} /> : null}
      {invites.length > 0 ? (
        <>
          <h2 className="zm-chat__title">{INTEREST_COPY.invitationsTitle}</h2>
          <ul className="zm-inbox">
            {invites.map((inv) => (
              <InvitationCard key={`${inv.track}:${inv.match}`} invitation={inv} onOpened={onOpen} onDone={() => void reload()} />
            ))}
          </ul>
        </>
      ) : null}
      {rows.length > 0 ? (
        <>
          <div className="zm-inbox__head">
            <h2 className="zm-chat__title">{CONVERSATION_COPY.inboxTitle}</h2>
            {tallies.length > 0 ? (
              <ul className="zm-inbox__tallies">
                {tallies.map((tally) => (
                  <li key={tally.kind} className="zm-inbox__tally" data-kind={tally.kind}>
                    {tally.kind === "new" ? <Icon name="loading" filled /> : null}
                    {tally.label} · <span className="zm-num">{tally.count}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <ul className="zm-inbox">{rows.map((entry) => <InboxRow key={entry.id} entry={entry} onOpen={onOpen} />)}</ul>
        </>
      ) : null}
      <div className="zm-chat__actions">
        <Button variant="secondary" icon="privacy" onClick={onLock}>{CHAT_COPY.lock}</Button>
      </div>
    </>
  );
}
