import { describe, expect, it } from "vitest";

import type { ConversationDto } from "@/contracts/chat";
import type { IdentityDto } from "@/contracts/identity";

import { speechBlipNote, voiceProfileFor } from "./animal-voice";
import {
  buildEncounterScript,
  computeEncounterProgress,
  formatGiftMessage,
  giftIconPaths,
  MOCHILA_ITEMS,
  parseGiftMessage,
  resolveMySprite,
} from "./chat-mochila";

function makeIdentity(overrides: Partial<IdentityDto> = {}): IdentityDto {
  return {
    estadoIdentidad: "eclosionado",
    aliasCompleto: "ajolote azul añil · KMPQ",
    aliasAnimal: "ajolote",
    aliasColor: "azul añil",
    aliasSufijo: "KMPQ",
    animalId: "ajolote",
    colorId: "ennea-4",
    colorHex: "#3b5998",
    mbtiCode: "INFP",
    enneagramCode: "4w5",
    enneagramName: "El Individualista",
    mark: "sp",
    revelacionVista: true,
    huevitoSeed: null,
    ...overrides,
  };
}

function makeConvo(overrides: Partial<ConversationDto> = {}): ConversationDto {
  return {
    id: "convo-123",
    track: "amistad",
    stage: "rounds",
    pausedByMe: false,
    muted: false,
    peer: {
      identity: makeIdentity(),
    },
    me: {
      identity: makeIdentity({
        aliasCompleto: "jaguar dorado solar · ZXYW",
        aliasAnimal: "jaguar",
        aliasColor: "dorado solar",
        aliasSufijo: "ZXYW",
        animalId: "jaguar",
        colorId: "ennea-7",
        mark: "so",
      }),
    },
    completedRounds: 0,
    minRoundsForFree: 3,
    free: { canAccept: false, mine: false, theirs: false },
    rounds: [],
    ask: null,
    messages: [],
    hasOlder: false,
    limits: {
      answerChars: 240,
      messageChars: 300,
      customQuestionChars: 140,
    },
    reactions: ["✨", "🌿"],
    ...overrides,
  };
}

describe("chat-mochila & animal-voice", () => {
  it("compiles pixel art paths for every mochila item", () => {
    expect(MOCHILA_ITEMS.length).toBeGreaterThanOrEqual(8);
    for (const item of MOCHILA_ITEMS) {
      const paths = giftIconPaths(item.id);
      expect(paths.line.length).toBeGreaterThan(0);
      expect(paths.fill.length).toBeGreaterThan(0);
    }
  });

  it("unlocks mochila gifts progressively as interaction points increase", () => {
    const start = computeEncounterProgress(makeConvo(), 0);
    expect(start.points).toBe(0);
    expect(start.level).toBe(1);
    expect(start.unlockedItems.map((i) => i.id)).toEqual(["baya_dulce"]);
    expect(start.nextItem?.id).toBe("hoja_fresca");

    const active = computeEncounterProgress(
      makeConvo({
        stage: "free",
        completedRounds: 3,
        rounds: [
          {
            index: 0,
            question: "¿Café o té?",
            askedByMe: true,
            revealed: true,
            mine: "Café de olla",
            minePassed: false,
            theirs: "Té verde",
            theirsPassed: false,
            myReaction: "✨",
            theirReaction: "🌿",
            feedbackGiven: true,
          },
          {
            index: 1,
            question: "¿Rincón favorito?",
            askedByMe: false,
            revealed: true,
            mine: "Biblioteca",
            minePassed: false,
            theirs: "Jardín",
            theirsPassed: false,
            myReaction: "✨",
            theirReaction: null,
            feedbackGiven: false,
          },
        ],
        messages: [
          { id: "m1", mine: true, body: "Hola!", at: "2026-05-01T12:00:00Z" },
          { id: "m2", mine: false, body: "Qué onda!", at: "2026-05-01T12:01:00Z" },
        ],
      }),
      2,
    );

    expect(active.points).toBeGreaterThanOrEqual(15);
    expect(active.level).toBeGreaterThan(2);
    expect(active.unlockedItems.length).toBe(MOCHILA_ITEMS.length);
  });

  it("formats and parses gift messages", () => {
    const berry = MOCHILA_ITEMS[0]!;
    const msgSimple = formatGiftMessage(berry);
    const parsedSimple = parseGiftMessage(msgSimple);
    expect(parsedSimple?.item.id).toBe(berry.id);
    expect(parsedSimple?.summary).toContain(berry.name);

    expect(parseGiftMessage("Un mensaje normal sin regalo")).toBeNull();
  });

  it("builds chronological encounter script and detects gifts in messages", () => {
    const berry = MOCHILA_ITEMS[0]!;
    const convo = makeConvo({
      stage: "free",
      completedRounds: 1,
      rounds: [
        {
          index: 0,
          question: "¿Rincón favorito del campus?",
          askedByMe: false,
          revealed: true,
          mine: "La biblioteca al atardecer",
          minePassed: false,
          theirs: "Las bancas bajo los árboles",
          theirsPassed: false,
          myReaction: null,
          theirReaction: null,
          feedbackGiven: false,
        },
      ],
      messages: [
        {
          id: "m1",
          mine: true,
          body: formatGiftMessage(berry),
          at: "2026-05-01T14:00:00Z",
        },
        {
          id: "m2",
          mine: false,
          body: "¡Muchas gracias!",
          at: "2026-05-01T14:01:00Z",
        },
      ],
    });

    const lines = buildEncounterScript(convo, []);
    expect(lines.some((l) => l.kind === "round_question")).toBe(true);
    expect(lines.some((l) => l.kind === "round_theirs" && l.speaker === "peer")).toBe(true);
    expect(lines.some((l) => l.kind === "round_mine" && l.speaker === "me")).toBe(true);
    expect(lines.some((l) => l.kind === "gift" && l.gift?.id === berry.id)).toBe(true);
    expect(lines.at(-1)?.text).toBe("¡Muchas gracias!");
  });

  it("resolves viewer sprite from convo.me or deterministic fallback", () => {
    const withMe = resolveMySprite(makeConvo());
    expect(withMe.animalId).toBe("jaguar");
    expect(withMe.shortName).toBe("jaguar dorado solar");

    const withoutMe: ConversationDto = { ...makeConvo() };
    delete withoutMe.me;
    const fallback = resolveMySprite(withoutMe);
    expect(fallback.animalId).not.toBe("ajolote");
    expect(fallback.shortName).toContain("Tu ");
  });

  it("provides deterministic 8-bit voice profiles and speech blip notes", () => {
    const profileA = voiceProfileFor("ajolote", "ennea-4");
    const profileB = voiceProfileFor("ajolote", "ennea-4");
    expect(profileA).toEqual(profileB);
    expect(profileA.cryLabel.length).toBeGreaterThan(0);

    expect(speechBlipNote(profileA, 0)).toBeTruthy();
    expect(speechBlipNote(profileA, 3)).toBeTruthy();
  });
});
