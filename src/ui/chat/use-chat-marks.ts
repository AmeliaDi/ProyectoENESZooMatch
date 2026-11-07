"use client";

/**
 * Chat state per constellation node (docs/CHAT.md §13.3): which matches have
 * an open chat (their spoke turns gold) and which have an invitation waiting
 * (a small speech icon over the star, never a number). Read from the shared
 * interest store, so the constellation makes no extra request.
 *
 * `justOpened` is the match whose chat opened while this sky was on screen:
 * the store now polls, so a mutual acceptance arrives without a reload and
 * deserves one calm announcement. Chats already open on arrival say nothing.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import type { ChatTrack, InterestStateDto } from "@/contracts/chat";
import { emitSound } from "@/ui/feedback/feedback";

import { loadInterest, readInterest, readInterestOnServer, subscribeInterest } from "./interest-api";

export interface ChatMarks {
  /** Node ids (match handles) with an open conversation on the track. */
  open: ReadonlySet<string>;
  /** Node ids with something waiting for the viewer (an invitation). */
  pending: ReadonlySet<string>;
  /** The chat that opened in front of the viewer, or null. */
  justOpened: { match: string; conversation: string } | null;
}

const EMPTY: ChatMarks = { open: new Set(), pending: new Set(), justOpened: null };

export function chatMarksFor(
  states: Readonly<Record<string, InterestStateDto>>,
  track: ChatTrack,
): { open: ReadonlySet<string>; pending: ReadonlySet<string>; conversations: ReadonlyMap<string, string> } {
  const open = new Set<string>();
  const pending = new Set<string>();
  const conversations = new Map<string, string>();
  const prefix = `${track}:`;
  for (const [key, value] of Object.entries(states)) {
    if (!key.startsWith(prefix)) continue;
    const id = key.slice(prefix.length);
    if (value.state === "open") {
      open.add(id);
      conversations.set(id, value.conversation);
    } else if (value.state === "invited") pending.add(id);
  }
  return { open, pending, conversations };
}

/**
 * The first id present now and absent before, or null. `previous === null`
 * means "just arrived": whatever was already there is not news.
 */
export function firstNew(previous: ReadonlySet<string> | null, current: ReadonlySet<string>): string | null {
  if (previous === null) return null;
  for (const id of current) if (!previous.has(id)) return id;
  return null;
}

export function useChatMarks(track: ChatTrack): ChatMarks {
  const snapshot = useSyncExternalStore(subscribeInterest, readInterest, readInterestOnServer);
  useEffect(() => void loadInterest(), []);
  const marks = useMemo(
    () => (snapshot.kind === "ready" ? chatMarksFor(snapshot.states, track) : { open: EMPTY.open, pending: EMPTY.pending, conversations: new Map<string, string>() }),
    [snapshot, track],
  );
  const [justOpened, setJustOpened] = useState<{ match: string; conversation: string } | null>(null);
  const seen = useRef<{ track: ChatTrack; open: ReadonlySet<string>; pending: ReadonlySet<string> } | null>(null);
  useEffect(() => {
    // Switching tracks is not an opening: the new track starts from its own sky.
    const previous = seen.current?.track === track ? seen.current : null;
    seen.current = { track, open: marks.open, pending: marks.pending };
    const match = firstNew(previous?.open ?? null, marks.open);
    const conversation = match === null ? undefined : marks.conversations.get(match);
    if (match !== null && conversation !== undefined) setJustOpened({ match, conversation });
    if (firstNew(previous?.pending ?? null, marks.pending) !== null) emitSound("invitacion_chat");
  }, [marks, track]);
  return useMemo(
    () => ({ open: marks.open, pending: marks.pending, justOpened }),
    [marks, justOpened],
  );
}