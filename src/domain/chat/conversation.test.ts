import { describe, expect, it } from "vitest";

import {
  canAcceptFree,
  canAnswer,
  cleanChatText,
  currentRound,
  isMyTurn,
  isRoundRevealed,
  stageOf,
  visibleRoundCount,
  type ConversationFacts,
} from "./conversation";

function facts(a: number[], b: number[], free: [boolean, boolean] = [false, false], total = 3): ConversationFacts {
  return { totalRounds: total, answered: { a: new Set(a), b: new Set(b) }, freeReady: { a: free[0], b: free[1] } };
}

describe("conversation stages", () => {
  it("starts in round 0 with both sides to answer", () => {
    const f = facts([], []);
    expect(currentRound(f)).toBe(0);
    expect(stageOf(f)).toBe("rounds");
    expect(isMyTurn(f, "a")).toBe(true);
    expect(visibleRoundCount(f)).toBe(1);
  });

  it("waits on a round until both answered and reveals only then", () => {
    const f = facts([0], []);
    expect(currentRound(f)).toBe(0);
    expect(isMyTurn(f, "a")).toBe(false);
    expect(isMyTurn(f, "b")).toBe(true);
    expect(isRoundRevealed(f, 0)).toBe(false);
    expect(isRoundRevealed(facts([0], [0]), 0)).toBe(true);
  });

  it("never lets a side run ahead or answer twice", () => {
    const f = facts([0], []);
    expect(canAnswer(f, "a", 1)).toBe(false);
    expect(canAnswer(f, "a", 0)).toBe(false);
    expect(canAnswer(f, "b", 0)).toBe(true);
    expect(canAnswer(f, "b", 1)).toBe(false);
  });

  it("moves to the invitation, then free chat only when both accept", () => {
    const done = facts([0, 1, 2], [0, 1, 2]);
    expect(stageOf(done)).toBe("invite");
    expect(canAcceptFree(done, "a")).toBe(true);
    const half = facts([0, 1, 2], [0, 1, 2], [true, false]);
    expect(stageOf(half)).toBe("invite");
    expect(canAcceptFree(half, "a")).toBe(false);
    expect(isMyTurn(half, "b")).toBe(true);
    expect(stageOf(facts([0, 1, 2], [0, 1, 2], [true, true]))).toBe("free");
  });

  it("cannot accept free chat during the rounds", () => {
    expect(canAcceptFree(facts([0], [0]), "a")).toBe(false);
  });
});

describe("cleanChatText", () => {
  it("trims, strips control and bidi characters and keeps line breaks", () => {
    expect(cleanChatText("  hola\u202E\u0007 \r\n\n\n\nmundo  ", 50)).toBe("hola\n\nmundo");
  });

  it("rejects empty and over-long text instead of truncating", () => {
    expect(cleanChatText(" \n\t ", 10)).toBeNull();
    expect(cleanChatText("a".repeat(11), 10)).toBeNull();
    expect(cleanChatText("ñ".repeat(10), 10)).toBe("ñ".repeat(10));
  });

  it("counts code points, not UTF-16 units", () => {
    expect(cleanChatText("\u{1F31F}".repeat(3), 3)).not.toBeNull();
  });
});
