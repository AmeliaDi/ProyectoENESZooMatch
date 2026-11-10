/**
 * The question cards of a turn (docs/CHAT.md §11.2): the ranked icebreaker bank
 * plus the questions that come from what the two actually share in their
 * quizzes. Pure and deterministic: the same pools and the same refresh always
 * offer the same cards, so "otras tres" rotates instead of re-shuffling.
 *
 * A coincidence card is never a raw answer: the caller hands over questions
 * already derived from the shared items (`generarPreguntasSugeridas`), and this
 * module only decides which of them lead the offer.
 */
import { foldText } from "./guard";

export type CardOrigin = "bank" | "coincidence";

export interface QuestionCard {
  id: string;
  text: string;
  category: string;
  origin: CardOrigin;
}

/** One question derived from a quiz the pair shares, with its card category. */
export interface CoincidenceQuestion {
  text: string;
  category: string;
}

export interface MixInput {
  /** Bank cards in offer order (already ranked, paged and unused). */
  bank: readonly QuestionCard[];
  /** Gated coincidence pool; its own order is the catalogue order. */
  coincidences: readonly CoincidenceQuestion[];
  /** Folded question texts already asked in this conversation. */
  usedTexts: ReadonlySet<string>;
  /** Cards per turn. */
  count: number;
  /** How many of them may be led by a coincidence. */
  take: number;
  refresh: number;
}

/** A coincidence repeats a question when both fold to the same text. */
function key(text: string): string {
  return foldText(text);
}

/** Pool without repeats, without a bank twin and without an already-asked question. */
function fresh(pool: readonly CoincidenceQuestion[], taken: ReadonlySet<string>): CoincidenceQuestion[] {
  const seen = new Set(taken);
  const out: CoincidenceQuestion[] = [];
  for (const question of pool) {
    const folded = key(question.text);
    if (folded.length === 0 || seen.has(folded)) continue;
    seen.add(folded);
    out.push(question);
  }
  return out;
}

function coincidenceCard(question: CoincidenceQuestion): QuestionCard {
  return { id: key(question.text), text: question.text, category: question.category, origin: "coincidence" };
}

/**
 * Coincidence cards lead, the bank fills the rest. `refresh` pages the
 * coincidence pool the same way the selector pages the bank: one page of `take`
 * cards per tap, wrapping around when the pool runs out.
 */
export function mixCards(input: MixInput): QuestionCard[] {
  const bank = input.bank.slice(0, input.count);
  const wanted = Math.min(input.take, input.count);
  if (wanted <= 0) return bank;
  const pool = fresh(
    input.coincidences,
    new Set([...input.usedTexts, ...bank.map((card) => key(card.text))]),
  );
  if (pool.length === 0) return bank;
  const pages = Math.max(1, Math.ceil(pool.length / wanted));
  const skip = (input.refresh % pages) * wanted;
  const rotated = [...pool.slice(skip), ...pool.slice(0, skip)];
  return [...rotated.slice(0, wanted).map(coincidenceCard), ...bank].slice(0, input.count);
}
