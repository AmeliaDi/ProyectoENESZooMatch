/**
 * Interest signals (docs/CHAT.md §10.1): ❤️ romance / 🤗 amistad. Pure rules;
 * the database enforces the same ones atomically in `express_chat_interest`.
 *
 *   * A signal expires silently after `expireDays` (the sender is never told
 *     about a "no").
 *   * One person may have at most `maxOpen` unanswered signals at once.
 *   * After a close or a block, the pair cannot signal for `cooldownDays`.
 *   * Romance needs the self-declared adult flag on BOTH sides to open. Only
 *     the sender's flag can refuse a signal: refusing because of the
 *     receiver would reveal their age. A signal to someone without the flag
 *     waits unseen (and may expire) like any other unanswered signal.
 */

export interface SignalPolicy {
  expireDays: number;
  maxOpen: number;
  cooldownDays: number;
}

const MS_PER_DAY = 86_400_000;

export function isSignalLive(createdAt: Date, now: Date, policy: Pick<SignalPolicy, "expireDays">): boolean {
  return now.getTime() - createdAt.getTime() < policy.expireDays * MS_PER_DAY;
}

export function signalExpiresAt(createdAt: Date, policy: Pick<SignalPolicy, "expireDays">): Date {
  return new Date(createdAt.getTime() + policy.expireDays * MS_PER_DAY);
}

/** A mutual pair of signals opens a chat only when the track allows both people. */
export function canOpenTrack(track: "romance" | "amistad", adults: { a: boolean; b: boolean }): boolean {
  return track === "amistad" || (adults.a && adults.b);
}

export function isCoolingDown(closedAt: Date | null, now: Date, policy: Pick<SignalPolicy, "cooldownDays">): boolean {
  return closedAt !== null && now.getTime() - closedAt.getTime() < policy.cooldownDays * MS_PER_DAY;
}

export type SignalRefusal = "adult_required" | "too_many" | "cooldown" | "blocked";

export interface SignalContext {
  track: "romance" | "amistad";
  senderAdult: boolean;
  /** Unanswered, unexpired signals the sender already has (excluding this pair). */
  openSignals: number;
  /** Either side blocked the other (any track). */
  blocked: boolean;
  /** Last close of this pair on this track, if any. */
  closedAt: Date | null;
}

/**
 * Why a new signal is refused, or `null` when allowed. A block reads as the
 * same neutral "gone" as a vanished match to the sender (never "you were blocked").
 */
export function signalRefusal(ctx: SignalContext, now: Date, policy: SignalPolicy): SignalRefusal | null {
  if (ctx.blocked) return "blocked";
  if (ctx.track === "romance" && !ctx.senderAdult) return "adult_required";
  if (isCoolingDown(ctx.closedAt, now, policy)) return "cooldown";
  if (ctx.openSignals >= policy.maxOpen) return "too_many";
  return null;
}
