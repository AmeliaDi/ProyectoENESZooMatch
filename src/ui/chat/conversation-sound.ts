import type { SoundEventId } from "@/config";

/** Only what a sound decision reads; `ConversationDto` satisfies it. */
export interface ConversationSoundView {
  muted: boolean;
  rounds: readonly { index: number; revealed: boolean }[];
  messages: readonly { id: string; mine: boolean; at: string }[];
}

/**
 * What deserves a sound inside an open conversation. Arriving is not news (the
 * chat already chimed when it opened) and a muted conversation stays quiet. A
 * sealed answer turning over outranks a message; paging backwards never does.
 */
export function conversationSound(
  previous: ConversationSoundView | null,
  next: ConversationSoundView,
): SoundEventId | null {
  if (previous === null || next.muted) return null;
  const sealed = new Set(previous.rounds.filter((r) => !r.revealed).map((r) => r.index));
  if (next.rounds.some((r) => r.revealed && sealed.has(r.index))) return "respuesta_revelada";
  const last = next.messages.at(-1);
  const before = previous.messages.at(-1);
  if (last === undefined || last.mine || last.id === before?.id) return null;
  if (before !== undefined && last.at <= before.at) return null;
  return "mensaje_nuevo";
}