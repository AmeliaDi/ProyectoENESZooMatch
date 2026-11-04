/** State of the in-memory chat repository (see memory-conversations.ts). */
import type { LatentProfile } from "@/types/latent";
import type { MatchTrack } from "@/types/microtest";

import type { AnswerRow, ChatPeer, ConversationRow, InterestRow, MessageRow, RoundRow } from "../chat/conversation-ports";

export const ordered = (x: string, y: string) => [x, y].sort() as [string, string];

const MS_PER_DAY = 86_400_000;

export interface StoredReport {
  reporter: string;
  reported: string;
  reason: string;
  snapshot: Array<{ who: "reporta" | "reportada"; body: string }>;
}

export class ConversationStore {
  /** Current matches as `${track}:${a}:${b}` with a < b. */
  readonly matches = new Set<string>();
  interests: InterestRow[] = [];
  readonly conversations = new Map<string, ConversationRow>();
  rounds: RoundRow[] = [];
  answers: AnswerRow[] = [];
  reactions: Array<{ conversationId: string; round: number; author: string; emoji: string }> = [];
  messages: Array<MessageRow & { conversationId: string; clientKey: string }> = [];
  readonly peers = new Map<string, ChatPeer>();
  readonly latents = new Map<string, LatentProfile>();
  readonly adults = new Set<string>();
  readonly blocks = new Set<string>();
  readonly closures = new Map<string, Date>();
  readonly reports: StoredReport[] = [];
  readonly feedback = { liked: 0, notLiked: 0 };
  readonly notified: string[] = [];
  maxOpen = 5;
  cooldownDays = 14;
  expireDays = 7;
  snapshotSize = 20;
  /** Wall clock of the fake DB (`now()` in SQL). */
  now: () => Date = () => new Date();
  private seq = 0;

  nextId(): string {
    this.seq += 1;
    return `00000000-0000-4000-8000-${String(this.seq).padStart(12, "0")}`;
  }

  addMatch(track: MatchTrack, x: string, y: string): void {
    const [a, b] = ordered(x, y);
    this.matches.add(`${track}:${a}:${b}`);
  }

  isBlocked(x: string, y: string): boolean {
    return this.blocks.has(`${x}:${y}`) || this.blocks.has(`${y}:${x}`);
  }

  findPair(a: string, b: string, track: MatchTrack): ConversationRow | undefined {
    return [...this.conversations.values()].find((c) => c.userA === a && c.userB === b && c.track === track);
  }

  open(a: string, b: string, track: MatchTrack): ConversationRow {
    const at = this.now();
    const row: ConversationRow = {
      id: this.nextId(), track, userA: a, userB: b, freeReadyA: false, freeReadyB: false,
      seenA: null, seenB: null, mutedA: false, mutedB: false, pausedBy: null,
      lastActor: null, createdAt: at, updatedAt: at,
    };
    this.conversations.set(row.id, row);
    return row;
  }

  removeSignals(x: string, y: string, track?: MatchTrack): void {
    this.interests = this.interests.filter(
      (i) => !((track === undefined || i.track === track) && ((i.from === x && i.to === y) || (i.from === y && i.to === x))),
    );
  }

  dropExpired(): void {
    const limit = this.now().getTime() - this.expireDays * MS_PER_DAY;
    this.interests = this.interests.filter((i) => i.createdAt.getTime() > limit);
  }

  touch(id: string, actor: string, at: Date): void {
    const row = this.conversations.get(id);
    if (row) this.conversations.set(id, { ...row, lastActor: actor, updatedAt: at });
  }

  update(id: string, patch: Partial<ConversationRow>): boolean {
    const row = this.conversations.get(id);
    if (!row) return false;
    this.conversations.set(id, { ...row, ...patch });
    return true;
  }

  remove(id: string): void {
    this.conversations.delete(id);
    this.rounds = this.rounds.filter((x) => x.conversationId !== id);
    this.answers = this.answers.filter((x) => x.conversationId !== id);
    this.reactions = this.reactions.filter((x) => x.conversationId !== id);
    this.messages = this.messages.filter((x) => x.conversationId !== id);
  }
}
