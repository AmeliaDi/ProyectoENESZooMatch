"use client";

/**
 * Chat state per constellation node (docs/CHAT.md §13.3): which matches have
 * an open chat (their spoke turns gold) and which have an invitation waiting
 * (a small speech icon over the star, never a number). Read from the shared
 * interest store, so the constellation makes no extra request.
 */
import { useEffect, useMemo, useSyncExternalStore } from "react";

import type { ChatTrack } from "@/contracts/chat";

import { loadInterest, readInterest, readInterestOnServer, subscribeInterest } from "./interest-api";

export interface ChatMarks {
  /** Node ids (match handles) with an open conversation on the track. */
  open: ReadonlySet<string>;
  /** Node ids with something waiting for the viewer (an invitation). */
  pending: ReadonlySet<string>;
}

const EMPTY: ChatMarks = { open: new Set(), pending: new Set() };

export function chatMarksFor(states: Readonly<Record<string, { state: string }>>, track: ChatTrack): ChatMarks {
  const open = new Set<string>();
  const pending = new Set<string>();
  const prefix = `${track}:`;
  for (const [key, value] of Object.entries(states)) {
    if (!key.startsWith(prefix)) continue;
    const id = key.slice(prefix.length);
    if (value.state === "open") open.add(id);
    else if (value.state === "invited") pending.add(id);
  }
  return { open, pending };
}

export function useChatMarks(track: ChatTrack): ChatMarks {
  const snapshot = useSyncExternalStore(subscribeInterest, readInterest, readInterestOnServer);
  useEffect(() => void loadInterest(), []);
  return useMemo(() => (snapshot.kind === "ready" ? chatMarksFor(snapshot.states, track) : EMPTY), [snapshot, track]);
}
