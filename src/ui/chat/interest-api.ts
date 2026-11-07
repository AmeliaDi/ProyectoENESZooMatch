/**
 * Client of `/api/interest` (outside the chat lock). One module store shared by
 * the constellation and every detail sheet: a POST/DELETE re-reads from the
 * server (no optimistic guesses) and, while somebody is subscribed, a single
 * backoff poll keeps it fresh so a chat the other person just accepted appears
 * without a reload (docs/DIAGNOSTICO_CHAT.md §4).
 */
import { CHAT_CONFIG } from "@/config";
import type { ChatTrack, InterestRequestDto, InterestStateDto, InterestStatesDto } from "@/contracts/chat";

import { parsed, request, type ApiResult } from "./chat-api";
import { parseInterestState, parseInterestStates, parseOk } from "./chat-parse";
import { startBackoffPoll } from "./use-visible-poll";

const INTEREST_URL = "/api/interest";

export const interestApi = {
  states: (): Promise<ApiResult<InterestStatesDto>> => parsed(request(INTEREST_URL, "GET"), parseInterestStates),
  send: (match: string, track: ChatTrack): Promise<ApiResult<InterestStateDto>> =>
    parsed(request(INTEREST_URL, "POST", { match, track } satisfies InterestRequestDto), parseInterestState),
  withdraw: (match: string, track: ChatTrack): Promise<ApiResult<true>> =>
    parsed(request(INTEREST_URL, "DELETE", { match, track } satisfies InterestRequestDto), parseOk),
  /** "Ahora no": silent for the sender. */
  decline: (match: string, track: ChatTrack): Promise<ApiResult<true>> =>
    parsed(request(`${INTEREST_URL}/decline`, "POST", { match, track } satisfies InterestRequestDto), parseOk),
  confirmAdult: (): Promise<ApiResult<true>> => parsed(request(`${INTEREST_URL}/adult`, "POST", {}), parseOk),
};

export function interestKey(track: ChatTrack, matchId: string): string {
  return `${track}:${matchId}`;
}

/** Synthetic fallback keys (`${track}-${index}`) are not handles the server knows. */
export function hasInterestHandle(matchId: string | null | undefined, track: ChatTrack): matchId is string {
  return typeof matchId === "string" && matchId.length > 0 && !matchId.startsWith(`${track}-`);
}

export type InterestSnapshot =
  | { kind: "idle" | "loading" }
  | { kind: "ready"; states: Record<string, InterestStateDto>; adult: boolean }
  | { kind: "error"; code: string };

const IDLE: InterestSnapshot = { kind: "idle" };
let snapshot: InterestSnapshot = IDLE;
let inflight: Promise<void> | null = null;
let signature = "";
let stopPoll: (() => void) | null = null;
const listeners = new Set<() => void>();

function publish(next: InterestSnapshot): void {
  const sig = next.kind === "ready" ? JSON.stringify([next.states, next.adult]) : "";
  // An identical read keeps the same object, so the constellation does not
  // repaint every few seconds and useSyncExternalStore stays quiet.
  if (next.kind === "ready" && snapshot.kind === "ready" && sig === signature) return;
  signature = sig;
  snapshot = next;
  for (const listener of listeners) listener();
}

export function subscribeInterest(listener: () => void): () => void {
  listeners.add(listener);
  // One poll for the whole page, however many sheets are open.
  stopPoll ??= startBackoffPoll(refreshInterest, CHAT_CONFIG.conversation.pollSeconds, CHAT_CONFIG.conversation.pollMaxSeconds);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      stopPoll?.();
      stopPoll = null;
    }
  };
}

export const readInterest = (): InterestSnapshot => snapshot;
export const readInterestOnServer = (): InterestSnapshot => IDLE;

/** Fetches the states; `force` re-reads after a change, otherwise once per page. */
export function loadInterest(force = false): Promise<void> {
  // A change made while an older read is in flight must not keep stale data.
  if (inflight) return force ? inflight.then(() => loadInterest(true)) : inflight;
  if (!force && (snapshot.kind === "ready" || snapshot.kind === "loading")) return Promise.resolve();
  if (snapshot.kind !== "ready") publish({ kind: "loading" });
  inflight = interestApi.states().then((reply) => {
    inflight = null;
    if (reply.ok) {
      publish({ kind: "ready", states: reply.data.states, adult: reply.data.adult });
      return;
    }
    // A blip during a background re-read keeps the last good view; the poll
    // retries. Only a first read that never succeeded shows the error.
    if (snapshot.kind !== "ready") publish({ kind: "error", code: reply.code });
  });
  return inflight;
}

/** A poll step: always re-reads, and reports change so the backoff can reset. */
export async function refreshInterest(): Promise<boolean> {
  const before = signature;
  await loadInterest(true);
  return signature !== before;
}
