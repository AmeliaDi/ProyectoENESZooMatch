/**
 * Invitations received (docs/CHAT.md §10.1): live signals to the viewer from
 * a CURRENT match, not declined, and without an open conversation. Shown
 * only with what the viewer already sees of that match (alias + sprite) and
 * the per-viewer handle the constellation uses.
 */
import type { InvitationDto } from "@/contracts/chat";
import { ok, type Clock, type Result } from "@/domain/shared";

import type { AppError } from "../errors";
import type { MatchRepository } from "../ports";
import { matchHandle } from "../match-handle";
import type { ConversationRepository } from "./conversation-ports";
import { liveSignals } from "./interest";
import { toPeerDto } from "./peer-view";

export interface InvitationDeps {
  matches: Pick<MatchRepository, "listFor">;
  conversations: Pick<ConversationRepository, "interestsOf" | "listFor" | "peers">;
  digest(input: string): string;
  clock: Clock;
}

export async function pendingInvitations(viewer: string, deps: InvitationDeps): Promise<Result<InvitationDto[], AppError>> {
  const [matches, interests, conversations] = await Promise.all([
    deps.matches.listFor(viewer),
    deps.conversations.interestsOf(viewer),
    deps.conversations.listFor(viewer),
  ]);
  if (!matches.ok) return matches;
  if (!interests.ok) return interests;
  if (!conversations.ok) return conversations;
  const open = new Set(conversations.value.map((c) => `${c.track}:${c.userA === viewer ? c.userB : c.userA}`));
  const current = new Set(matches.value.flatMap((m) => (m.otherUser ? [`${m.track}:${m.otherUser}`] : [])));
  const pending = liveSignals(interests.value, deps.clock.now()).filter(
    (i) => i.to === viewer && !i.declined && current.has(`${i.track}:${i.from}`) && !open.has(`${i.track}:${i.from}`),
  );
  if (pending.length === 0) return ok([]);
  const peers = await deps.conversations.peers(pending.map((i) => i.from));
  if (!peers.ok) return peers;
  const byId = new Map(peers.value.map((p) => [p.userId, p]));
  return ok(pending.map((i) => ({
    match: matchHandle(viewer, i.from, deps.digest),
    track: i.track,
    peer: toPeerDto(byId.get(i.from)),
  })));
}
