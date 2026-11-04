/**
 * Deterministic choice of the question cards offered each turn (docs/CHAT.md
 * §11.2). Pure: same conversation, round and refresh → same cards.
 *
 *   1. Level by round: from `levelFromRound[L-1]` on, level L is offered.
 *   2. Only the conversation's track (or "ambos") and never a used question.
 *   3. Score = Σ weight of the model layers the question leans on (the pair's
 *      real per-layer contributions), times a seeded jitter so ties and close
 *      scores rotate between conversations.
 *   4. Greedy pick with distinct categories; "otras tres" rotates the ranked
 *      list one page forward (wrapping around when the bank runs out).
 */
import { fnv1a32, mulberry32 } from "@/domain/shared";

export interface SelectablePrompt {
  id: string;
  track: "romance" | "amistad" | "ambos";
  nivel: 1 | 2 | 3;
  categoria: string;
  dimensiones_relacionadas: readonly string[];
}

export interface SelectionInput<P extends SelectablePrompt> {
  bank: readonly P[];
  track: "romance" | "amistad";
  roundIndex: number;
  /** Ids already asked in this conversation. */
  used: ReadonlySet<string>;
  /** Weight of each model layer for this pair (e.g. its contribution share). */
  layerWeights: Readonly<Record<string, number>>;
  /** Stable per conversation (its id). */
  seed: string;
  /** 0 for the first offer of a round; +1 per "otras tres". */
  refresh: number;
  count: number;
  /** Round index from which level 1, 2, 3 is offered. */
  levelFromRound: readonly [number, number, number];
}

/** Floor so a question on a layer with ~0 weight still has a chance. */
const MIN_LAYER_WEIGHT = 0.05;
/** Jitter range: the score is multiplied by a value in [1 − J, 1]. */
const JITTER = 0.35;

export function levelForRound(roundIndex: number, levelFromRound: readonly [number, number, number]): 1 | 2 | 3 {
  if (roundIndex >= levelFromRound[2]) return 3;
  return roundIndex >= levelFromRound[1] ? 2 : 1;
}

function scoreOf(prompt: SelectablePrompt, weights: Readonly<Record<string, number>>, jitter: number): number {
  const base = prompt.dimensiones_relacionadas.reduce((sum, d) => sum + Math.max(MIN_LAYER_WEIGHT, weights[d] ?? 0), 0);
  return (base / prompt.dimensiones_relacionadas.length) * (1 - JITTER * jitter);
}

/** Candidates of the right track, unused, preferring the round level then lower ones. */
function candidates<P extends SelectablePrompt>(input: SelectionInput<P>): P[] {
  const level = levelForRound(input.roundIndex, input.levelFromRound);
  const fresh = input.bank.filter((p) => (p.track === "ambos" || p.track === input.track) && !input.used.has(p.id));
  const exact = fresh.filter((p) => p.nivel === level);
  return exact.length >= input.count ? exact : [...exact, ...fresh.filter((p) => p.nivel < level), ...fresh.filter((p) => p.nivel > level)];
}

function ranked<P extends SelectablePrompt>(input: SelectionInput<P>): P[] {
  const random = mulberry32(fnv1a32(`${input.seed}:${input.roundIndex}`));
  return candidates(input)
    .map((prompt) => ({ prompt, score: scoreOf(prompt, input.layerWeights, random()) }))
    .sort((x, y) => y.score - x.score || x.prompt.id.localeCompare(y.prompt.id))
    .map((x) => x.prompt);
}

/** Greedy pick of `count` prompts with distinct categories when possible. */
function pickVaried<P extends SelectablePrompt>(pool: readonly P[], count: number): P[] {
  const out: P[] = [];
  const categories = new Set<string>();
  for (const p of pool) {
    if (out.length === count) break;
    if (!categories.has(p.categoria)) {
      out.push(p);
      categories.add(p.categoria);
    }
  }
  for (const p of pool) {
    if (out.length === count) break;
    if (!out.includes(p)) out.push(p);
  }
  return out;
}

export function selectPrompts<P extends SelectablePrompt>(input: SelectionInput<P>): P[] {
  const order = ranked(input);
  if (order.length === 0) return [];
  const pages = Math.max(1, Math.ceil(order.length / input.count));
  const skip = (input.refresh % pages) * input.count;
  const rotated = [...order.slice(skip), ...order.slice(0, skip)];
  return pickVaried(rotated, Math.min(input.count, order.length));
}
