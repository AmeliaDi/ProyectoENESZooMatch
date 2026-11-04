import { describe, expect, it } from "vitest";

import { levelForRound, selectPrompts, type SelectablePrompt } from "./prompt-selection";

const LEVELS = [0, 2, 4] as const;
const CATS = ["humor", "gustos", "valores", "campus"];

function bank(): SelectablePrompt[] {
  const out: SelectablePrompt[] = [];
  for (const nivel of [1, 2, 3] as const) {
    for (let i = 0; i < 8; i += 1) {
      out.push({
        id: `p${nivel}${i}`,
        track: i === 7 ? "romance" : "ambos",
        nivel,
        categoria: CATS[i % CATS.length]!,
        dimensiones_relacionadas: [i % 2 === 0 ? "valores" : "estilo"],
      });
    }
  }
  return out;
}

const base = {
  bank: bank(),
  track: "amistad" as const,
  roundIndex: 0,
  used: new Set<string>(),
  layerWeights: { valores: 0.9, estilo: 0.1 },
  seed: "conv-1",
  refresh: 0,
  count: 3,
  levelFromRound: LEVELS,
};

describe("question selection", () => {
  it("is deterministic for the same conversation, round and refresh", () => {
    expect(selectPrompts(base)).toEqual(selectPrompts(base));
    expect(selectPrompts(base)).toHaveLength(3);
  });

  it("progresses from level 1 to 3 with the rounds", () => {
    expect(levelForRound(0, LEVELS)).toBe(1);
    expect(levelForRound(2, LEVELS)).toBe(2);
    expect(levelForRound(5, LEVELS)).toBe(3);
    expect(selectPrompts({ ...base, roundIndex: 4 }).every((p) => p.nivel === 3)).toBe(true);
  });

  it("never offers used questions or another track", () => {
    const used = new Set(["p10", "p12", "p14"]);
    const cards = selectPrompts({ ...base, used });
    expect(cards.some((p) => used.has(p.id))).toBe(false);
    expect(cards.some((p) => p.track === "romance")).toBe(false);
  });

  it("varies categories and prefers the layers that connect the pair most", () => {
    const cards = selectPrompts(base);
    expect(new Set(cards.map((c) => c.categoria)).size).toBe(cards.length);
    const valores = cards.filter((c) => c.dimensiones_relacionadas.includes("valores")).length;
    expect(valores).toBeGreaterThanOrEqual(2);
  });

  it("offers different cards on 'otras tres' and differs between conversations", () => {
    const first = selectPrompts(base).map((p) => p.id);
    const second = selectPrompts({ ...base, refresh: 1 }).map((p) => p.id);
    expect(second).not.toEqual(first);
    const other = selectPrompts({ ...base, seed: "conv-2", layerWeights: {} }).map((p) => p.id);
    expect(other.length).toBe(3);
  });

  it("falls back to other levels when a level runs out, and returns [] when empty", () => {
    const used = new Set(bank().filter((p) => p.nivel === 1).map((p) => p.id));
    expect(selectPrompts({ ...base, used })).toHaveLength(3);
    expect(selectPrompts({ ...base, bank: [] })).toEqual([]);
  });
});
