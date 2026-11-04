import { CHAT_CONFIG } from "@/config";
import type { RoundPolicy, SignalPolicy } from "@/domain/chat";

/** Conversation settings (data/chat-config.json → conversation). */
export const SETTINGS = CHAT_CONFIG.conversation;

export const ROUND_POLICY: RoundPolicy = {
  minForFree: SETTINGS.rounds.minForFree,
  revealHours: SETTINGS.rounds.revealHours,
  maxRounds: SETTINGS.rounds.maxRounds,
};

export const SIGNAL_POLICY: SignalPolicy = SETTINGS.signals;
