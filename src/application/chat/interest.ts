/**
 * "Me interesa conocerte" (docs/CHAT.md §10.1). The client only knows the
 * opaque per-viewer match handle; the server resolves it against the viewer's
 * CURRENT matches, so a signal can only go to someone who is a match right now.
 * A one-sided signal is never visible to the other person.
 */
import type { InterestStateDto, InterestStatesDto } from "@/contracts/chat";
import { err, ok, type Result } from "@/domain/shared";
import type { MatchTrack } from "@/types/microtest";

import type { AppError } from "../errors";
import type { MatchRepository } from "../ports";
import { matchHandle } from "../match-handle";
import type { ConversationRepository } from "./conversation-ports";

export interface InterestDeps {
  matches: Pick<MatchRepository, "listFor">;
  conversations: Pick<ConversationRepository, "interestsFrom" | "expressInterest" | "withdrawInterest" | "listFor" | "notify">;
  digest(input: string): string;
}

export interface InterestInput {
  match: string;
  track: MatchTrack;
}

const pairKey = (track: MatchTrack, other: string) => `${track}:${other}`;

/** The counterpart behind a handle, only if it is a current match on that track. */
async function resolveMatch(viewer: string, input: InterestInput, deps: InterestDeps): Promise<Result<string, AppError>> {
  const matches = await deps.matches.listFor(viewer);
  if (!matches.ok) return matches;
  const found = matches.value.find(
    (m) => m.track === input.track && m.otherUser !== null && matchHandle(viewer, m.otherUser, deps.digest) === input.match,
  );
  return found?.otherUser ? ok(found.otherUser) : err("chat.match_gone");
}

export async function expressInterest(viewer: string, input: InterestInput, deps: InterestDeps): Promise<Result<InterestStateDto, AppError>> {
  const other = await resolveMatch(viewer, input, deps);
  if (!other.ok) return other;
  const outcome = await deps.conversations.expressInterest(viewer, other.value, input.track);
  if (!outcome.ok) return outcome;
  if (outcome.value.kind === "gone") return err("chat.match_gone");
  if (outcome.value.kind === "sent") return ok({ state: "sent" });
  await deps.conversations.notify(other.value);
  return ok({ state: "open", conversation: outcome.value.conversationId });
}

export async function withdrawInterest(viewer: string, input: InterestInput, deps: InterestDeps): Promise<Result<void, AppError>> {
  const other = await resolveMatch(viewer, input, deps);
  if (!other.ok) return other;
  return deps.conversations.withdrawInterest(viewer, other.value, input.track);
}

/** States keyed by `${track}:${matchHandle}`; only the viewer's own signals and open chats. */
export async function interestStates(viewer: string, deps: InterestDeps): Promise<Result<InterestStatesDto, AppError>> {
  const [matches, interests, conversations] = await Promise.all([
    deps.matches.listFor(viewer),
    deps.conversations.interestsFrom(viewer),
    deps.conversations.listFor(viewer),
  ]);
  if (!matches.ok) return matches;
  if (!interests.ok) return interests;
  if (!conversations.ok) return conversations;
  const open = new Map(
    conversations.value.map((c) => [pairKey(c.track, c.userA === viewer ? c.userB : c.userA), c.id]),
  );
  const sent = new Set(interests.value.map((i) => pairKey(i.track, i.to)));
  const states: Record<string, InterestStateDto> = {};
  for (const m of matches.value) {
    if (!m.otherUser) continue;
    const key = pairKey(m.track, m.otherUser);
    const handle = `${m.track}:${matchHandle(viewer, m.otherUser, deps.digest)}`;
    const conversation = open.get(key);
    if (conversation) states[handle] = { state: "open", conversation };
    else if (sent.has(key)) states[handle] = { state: "sent" };
  }
  return ok({ states });
}
