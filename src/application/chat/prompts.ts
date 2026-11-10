/**
 * Question cards for a turn (docs/CHAT.md §11.2): the bank, the pair's real
 * per-layer contributions from the matching model, and the pure selector.
 * The bank stays on the server; clients only receive the offered cards.
 */
import { CHAT_PROMPTS } from "@/config/chat-prompts";
import { mixCards, selectPrompts, type CoincidenceQuestion, type QuestionCard } from "@/domain/chat";
import { MATCHING_CONFIG, pairScore } from "@/domain/matching";
import type { LatentProfile } from "@/types/latent";
import type { MatchTrack } from "@/types/microtest";

import { SETTINGS } from "./settings";

/** A card of the turn: from the bank (asked by id) or from a coincidence (asked by text). */
export type PromptCard = QuestionCard;

const BY_ID = new Map(CHAT_PROMPTS.preguntas.map((p) => [p.id, p]));
/** Shown if a stored prompt id ever leaves the bank (should not happen). */
const MISSING_PROMPT = "Cuéntame algo que te haya hecho sonreír esta semana.";

export function promptText(id: string | null): string {
  return (id && BY_ID.get(id)?.texto) || MISSING_PROMPT;
}

export function isKnownPrompt(id: string, track: MatchTrack): boolean {
  const prompt = BY_ID.get(id);
  return prompt !== undefined && (prompt.track === "ambos" || prompt.track === track);
}

/**
 * Share of the pair score each model layer contributes (sums to ~1). Empty
 * when a latent profile is missing: the selector then weighs layers evenly.
 */
export function layerWeights(track: MatchTrack, self: LatentProfile | undefined, other: LatentProfile | undefined): Record<string, number> {
  if (!self || !other) return {};
  const score = pairScore(self, other, MATCHING_CONFIG.tracks[track], MATCHING_CONFIG.categories);
  const total = score.categories.reduce((sum, c) => sum + Math.max(0, c.contribution), 0);
  if (total <= 0) return {};
  return Object.fromEntries(score.categories.map((c) => [c.id, Math.max(0, c.contribution) / total]));
}

export interface CardsInput {
  conversationId: string;
  track: MatchTrack;
  roundIndex: number;
  used: ReadonlySet<string>;
  /** Folded texts already asked, including the questions typed at ask time. */
  usedTexts: ReadonlySet<string>;
  /** Questions the pair shares in their quizzes; empty when nothing is shared. */
  coincidences: readonly CoincidenceQuestion[];
  weights: Readonly<Record<string, number>>;
  refresh: number;
}

export function cardsFor(input: CardsInput): PromptCard[] {
  const count = SETTINGS.rounds.suggestions;
  const bank = selectPrompts({
    bank: CHAT_PROMPTS.preguntas,
    track: input.track,
    roundIndex: input.roundIndex,
    used: input.used,
    layerWeights: input.weights,
    seed: input.conversationId,
    refresh: input.refresh,
    count,
    levelFromRound: SETTINGS.rounds.levelFromRound,
  }).map((p) => ({ id: p.id, text: p.texto, category: p.categoria, origin: "bank" as const }));
  return mixCards({
    bank,
    coincidences: input.coincidences,
    usedTexts: input.usedTexts,
    count,
    take: SETTINGS.rounds.coincidences,
    refresh: input.refresh,
  });
}
