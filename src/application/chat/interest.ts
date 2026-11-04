/**
 * Interest signals ❤️ / 🤗 (docs/CHAT.md §10.1). The client only knows the
 * opaque per-viewer match handle; the server resolves it against the
 * viewer's CURRENT matches, so a signal can only go to a match right now.
 *
 *   * The receiver sees a kind invitation without anything new about the
 *     sender; "ahora no" is silent (the sender is never told) and the signal
 *     simply expires.
 *   * Refusals the sender may see: adult_required (their own flag),
 *     too_many, cooldown. A block reads as the same neutral "gone".
 */
import type { InterestStateDto, InterestStatesDto } from "@/contracts/chat";
import { isSignalLive } from "@/domain/chat";
import { err, ok, type Clock, type Result } from "@/domain/shared";
import type { MatchTrack } from "@/types/microtest";

import type { AppError } from "../errors";
import type { MatchRepository } from "../ports";
import { matchHandle } from "../match-handle";
import type { ConversationRepository, InterestOutcome, InterestRow } from "./conversation-ports";
import { SIGNAL_POLICY } from "./settings";

export interface InterestDeps {
  matches: Pick<MatchRepository, "listFor">;
  conversations: Pick<
    ConversationRepository,
    "interestsOf" | "expressInterest" | "withdrawInterest" | "declineInterest" | "listFor" | "notify" | "isAdult" | "confirmAdult" | "peers"
  >;
  digest(input: string): string;
  clock: Clock;
}

export interface InterestInput {
  match: string;
  track: MatchTrack;
}

const pairKey = (track: MatchTrack, other: string) => `${track}:${other}`;

/** The counterpart behind a handle, only if it is a current match on that track. */
export async function resolveMatch(viewer: string, input: InterestInput, deps: Pick<InterestDeps, "matches" | "digest">): Promise<Result<string, AppError>> {
  const matches = await deps.matches.listFor(viewer);
  if (!matches.ok) return matches;
  const found = matches.value.find(
    (m) => m.track === input.track && m.otherUser !== null && matchHandle(viewer, m.otherUser, deps.digest) === input.match,
  );
  return found?.otherUser ? ok(found.otherUser) : err("chat.match_gone");
}

const REFUSAL: Partial<Record<InterestOutcome["kind"], AppError>> = {
  gone: "chat.match_gone",
  adult_required: "chat.adult_required",
  cooldown: "chat.cooldown",
  too_many: "chat.too_many_signals",
};

export async function expressInterest(viewer: string, input: InterestInput, deps: InterestDeps): Promise<Result<InterestStateDto, AppError>> {
  const other = await resolveMatch(viewer, input, deps);
  if (!other.ok) return other;
  const outcome = await deps.conversations.expressInterest(viewer, other.value, input.track);
  if (!outcome.ok) return outcome;
  const refusal = REFUSAL[outcome.value.kind];
  if (refusal) return err(refusal);
  // Both sides learn about a new signal or chat only through the content-free notice.
  await deps.conversations.notify(other.value);
  if (outcome.value.kind !== "open") return ok({ state: "sent" });
  return ok({ state: "open", conversation: outcome.value.conversationId });
}

export async function withdrawInterest(viewer: string, input: InterestInput, deps: InterestDeps): Promise<Result<void, AppError>> {
  const other = await resolveMatch(viewer, input, deps);
  if (!other.ok) return other;
  return deps.conversations.withdrawInterest(viewer, other.value, input.track);
}

/** "Ahora no": silent for the sender; only hides the invitation for the viewer. */
export async function declineInterest(viewer: string, input: InterestInput, deps: InterestDeps): Promise<Result<void, AppError>> {
  const other = await resolveMatch(viewer, input, deps);
  if (!other.ok) return other;
  return deps.conversations.declineInterest(other.value, viewer, input.track, deps.clock.now());
}

export async function confirmAdult(viewer: string, deps: Pick<InterestDeps, "conversations" | "clock">): Promise<Result<void, AppError>> {
  return deps.conversations.confirmAdult(viewer, deps.clock.now());
}

function liveSignals(rows: readonly InterestRow[], now: Date): InterestRow[] {
  return rows.filter((r) => isSignalLive(r.createdAt, now, SIGNAL_POLICY));
}

/** States keyed by `${track}:${matchHandle}`: own signals, open chats, pending invitations. */
export async function interestStates(viewer: string, deps: InterestDeps): Promise<Result<InterestStatesDto, AppError>> {
  const [matches, interests, conversations, adult] = await Promise.all([
    deps.matches.listFor(viewer),
    deps.conversations.interestsOf(viewer),
    deps.conversations.listFor(viewer),
    deps.conversations.isAdult(viewer),
  ]);
  if (!matches.ok) return matches;
  if (!interests.ok) return interests;
  if (!conversations.ok) return conversations;
  if (!adult.ok) return adult;
  const now = deps.clock.now();
  const live = liveSignals(interests.value, now);
  const open = new Map(conversations.value.map((c) => [pairKey(c.track, c.userA === viewer ? c.userB : c.userA), c.id]));
  const sent = new Set(live.filter((i) => i.from === viewer).map((i) => pairKey(i.track, i.to)));
  const invited = new Set(live.filter((i) => i.to === viewer && !i.declined).map((i) => pairKey(i.track, i.from)));
  const states: Record<string, InterestStateDto> = {};
  for (const m of matches.value) {
    if (!m.otherUser) continue;
    const key = pairKey(m.track, m.otherUser);
    const handle = `${m.track}:${matchHandle(viewer, m.otherUser, deps.digest)}`;
    const conversation = open.get(key);
    if (conversation) states[handle] = { state: "open", conversation };
    else if (sent.has(key)) states[handle] = { state: "sent" };
    else if (invited.has(key)) states[handle] = { state: "invited" };
  }
  return ok({ states, adult: adult.value });
}

export { liveSignals };
