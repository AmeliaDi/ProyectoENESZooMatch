/**
 * Client of `/api/interest` (outside the chat lock). The states are loaded
 * once per page and shared by every detail sheet through a tiny module store;
 * a POST/DELETE refreshes them from the server (no optimistic guesses).
 */
import type { ChatTrack, InterestRequestDto, InterestStateDto, InterestStatesDto } from "@/contracts/chat";

import { parsed, request, type ApiResult } from "./chat-api";
import { parseInterestState, parseInterestStates, parseOk } from "./chat-parse";

const INTEREST_URL = "/api/interest";

export const interestApi = {
  states: (): Promise<ApiResult<InterestStatesDto>> => parsed(request(INTEREST_URL, "GET"), parseInterestStates),
  send: (match: string, track: ChatTrack): Promise<ApiResult<InterestStateDto>> =>
    parsed(request(INTEREST_URL, "POST", { match, track } satisfies InterestRequestDto), parseInterestState),
  withdraw: (match: string, track: ChatTrack): Promise<ApiResult<true>> =>
    parsed(request(INTEREST_URL, "DELETE", { match, track } satisfies InterestRequestDto), parseOk),
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
  | { kind: "ready"; states: Record<string, InterestStateDto> }
  | { kind: "error"; code: string };

const IDLE: InterestSnapshot = { kind: "idle" };
let snapshot: InterestSnapshot = IDLE;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function publish(next: InterestSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

export function subscribeInterest(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
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
    publish(reply.ok ? { kind: "ready", states: reply.data.states } : { kind: "error", code: reply.code });
  });
  return inflight;
}
