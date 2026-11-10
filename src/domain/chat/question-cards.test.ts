import { describe, expect, it } from "vitest";

import { foldText } from "./guard";
import { mixCards, type CoincidenceQuestion, type QuestionCard } from "./question-cards";

const bankCard = (id: string, text = `pregunta ${id}`): QuestionCard => ({ id, text, category: "humor", origin: "bank" });
const BANK = [bankCard("p001"), bankCard("p002"), bankCard("p003")];
const shared = (text: string): CoincidenceQuestion => ({ text, category: "gustos" });

function mix(over: Partial<Parameters<typeof mixCards>[0]> = {}) {
  return mixCards({ bank: BANK, coincidences: [], usedTexts: new Set(), count: 3, take: 1, refresh: 0, ...over });
}

describe("mixCards", () => {
  it("leaves the offer alone when the pair shares nothing", () => {
    expect(mix().map((c) => c.id)).toEqual(["p001", "p002", "p003"]);
  });

  it("stays on the bank when the config switches the extra card off", () => {
    const cards = mix({ take: 0, coincidences: [shared("¿Qué playlist te sabes de memoria?")] });
    expect(cards.map((c) => c.origin)).toEqual(["bank", "bank", "bank"]);
  });

  it("lets a coincidence lead and the bank fill the rest", () => {
    const cards = mix({ coincidences: [shared("¿Qué playlist te sabes de memoria?")] });
    expect(cards.map((c) => c.origin)).toEqual(["coincidence", "bank", "bank"]);
    expect(cards.map((c) => c.text)).toEqual(["¿Qué playlist te sabes de memoria?", "pregunta p001", "pregunta p002"]);
  });

  it("never offers more cards than the turn has", () => {
    expect(mix({ take: 5, coincidences: [shared("una"), shared("dos"), shared("tres"), shared("cuatro")] })).toHaveLength(3);
  });

  it("drops a coincidence already asked in this conversation", () => {
    const asked = "¿Qué playlist te sabes de memoria?";
    expect(mix({ coincidences: [shared(asked)], usedTexts: new Set([foldText(asked)]) }).map((c) => c.id)).toEqual(["p001", "p002", "p003"]);
  });

  it("drops a coincidence the bank is already about to offer", () => {
    const cards = mix({ coincidences: [shared("Pregunta  P001")] });
    expect(cards.filter((c) => c.origin === "coincidence")).toHaveLength(0);
    expect(cards.map((c) => c.id)).toEqual(["p001", "p002", "p003"]);
  });

  it("counts a repeated question once whatever the casing or the accents", () => {
    const cards = mix({ take: 2, coincidences: [shared("¿Qué concierto TE urge?"), shared("qué concierto te urge")] });
    expect(cards.filter((c) => c.origin === "coincidence")).toHaveLength(1);
    expect(cards.map((c) => c.text)).toEqual(["¿Qué concierto TE urge?", "pregunta p001", "pregunta p002"]);
  });

  it("pages the pool on refresh and wraps around when it runs out", () => {
    const pool = [shared("una"), shared("dos"), shared("tres"), shared("cuatro")];
    const lead = (refresh: number) => mix({ coincidences: pool, refresh }).find((c) => c.origin === "coincidence")?.text;
    expect([lead(0), lead(1), lead(2), lead(3), lead(4)]).toEqual(["una", "dos", "tres", "cuatro", "una"]);
  });

  it("is deterministic: the same inputs always offer the same cards", () => {
    const pool = [shared("una"), shared("dos")];
    expect(mix({ coincidences: pool, take: 2 })).toEqual(mix({ coincidences: pool, take: 2 }));
  });
});
