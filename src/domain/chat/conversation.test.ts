import { describe, expect, it } from "vitest";

import {
  canAcceptFree,
  canAnswer,
  canOpenRound,
  canReact,
  canSendMessage,
  canTogglePause,
  completedRounds,
  isMyTurn,
  isRoundRevealed,
  nextAsker,
  openRound,
  stageOf,
  type AnswerMark,
  type ConversationFacts,
  type RoundFacts,
} from "./conversation";

const POLICY = { minForFree: 3, revealHours: 48, maxRounds: 60 };
const T0 = new Date("2026-11-04T10:00:00Z");
const hours = (h: number) => new Date(T0.getTime() + h * 3_600_000);

function round(index: number, a: AnswerMark, b: AnswerMark, asker: "a" | "b" = index % 2 === 0 ? "a" : "b"): RoundFacts {
  return { index, asker, createdAt: T0, answered: { a, b } };
}

function facts(rounds: RoundFacts[], extra: Partial<ConversationFacts> = {}): ConversationFacts {
  return { rounds, freeReady: { a: false, b: false }, pausedBy: null, firstAsker: "a", ...extra };
}

const done = (n: number) => Array.from({ length: n }, (_, i) => round(i, "answer", "answer"));

describe("turns and sealed rounds", () => {
  it("starts with the first asker and alternates afterwards", () => {
    expect(nextAsker(facts([]))).toBe("a");
    expect(canOpenRound(facts([]), "a", T0, POLICY)).toBe(true);
    expect(canOpenRound(facts([]), "b", T0, POLICY)).toBe(false);
    expect(nextAsker(facts(done(1)))).toBe("b");
    expect(isMyTurn(facts([]), "a", T0, POLICY)).toBe(true);
    expect(isMyTurn(facts([]), "b", T0, POLICY)).toBe(false);
  });

  it("keeps a round sealed until both answered or passed", () => {
    const half = facts([round(0, "answer", null)]);
    expect(isRoundRevealed(half.rounds[0]!, T0, POLICY)).toBe(false);
    expect(openRound(half, T0, POLICY)?.index).toBe(0);
    expect(isMyTurn(half, "a", T0, POLICY)).toBe(false);
    expect(isMyTurn(half, "b", T0, POLICY)).toBe(true);
    expect(isRoundRevealed(round(0, "answer", "pass"), T0, POLICY)).toBe(true);
  });

  it("reveals by itself after the wait, without pressure on the other side", () => {
    const half = facts([round(0, "answer", null)]);
    expect(isRoundRevealed(half.rounds[0]!, hours(47.9), POLICY)).toBe(false);
    expect(isRoundRevealed(half.rounds[0]!, hours(48), POLICY)).toBe(true);
    expect(canAnswer(half, "b", 0, hours(48), POLICY)).toBe(false);
    expect(canOpenRound(half, "b", hours(48), POLICY)).toBe(true);
  });

  it("never lets a side answer twice, answer another round or ask while one is open", () => {
    const half = facts([round(0, "answer", null)]);
    expect(canAnswer(half, "a", 0, T0, POLICY)).toBe(false);
    expect(canAnswer(half, "b", 1, T0, POLICY)).toBe(false);
    expect(canAnswer(half, "b", 0, T0, POLICY)).toBe(true);
    expect(canOpenRound(half, "b", T0, POLICY)).toBe(false);
  });

  it("reacts only to a revealed answer of the other side", () => {
    expect(canReact(facts([round(0, "answer", null)]), "b", 0, T0, POLICY)).toBe(false);
    expect(canReact(facts([round(0, "answer", "answer")]), "b", 0, T0, POLICY)).toBe(true);
    expect(canReact(facts([round(0, "pass", "answer")]), "b", 0, T0, POLICY)).toBe(false);
  });
});

describe("free chat", () => {
  it("can be proposed only after the minimum of completed rounds", () => {
    expect(canAcceptFree(facts(done(2)), "a", T0, POLICY)).toBe(false);
    expect(completedRounds(facts(done(3)), T0, POLICY)).toBe(3);
    expect(canAcceptFree(facts(done(3)), "a", T0, POLICY)).toBe(true);
  });

  it("opens only when both accept, and the other side then sees it is their turn", () => {
    const half = facts(done(3), { freeReady: { a: true, b: false } });
    expect(stageOf(half)).toBe("rounds");
    expect(canSendMessage(half)).toBe(false);
    expect(isMyTurn(half, "b", T0, POLICY)).toBe(true);
    const both = facts(done(3), { freeReady: { a: true, b: true } });
    expect(stageOf(both)).toBe("free");
    expect(canSendMessage(both)).toBe(true);
  });
});

describe("pause", () => {
  it("stops everything and only who paused can resume", () => {
    const paused = facts(done(3), { freeReady: { a: true, b: true }, pausedBy: "b" });
    expect(stageOf(paused)).toBe("paused");
    expect(canSendMessage(paused)).toBe(false);
    expect(canOpenRound(paused, "b", T0, POLICY)).toBe(false);
    expect(canTogglePause(paused, "a", false)).toBe(false);
    expect(canTogglePause(paused, "b", false)).toBe(true);
    expect(canTogglePause(paused, "a", true)).toBe(false);
  });
});
