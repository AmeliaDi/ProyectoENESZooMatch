/**
 * Game Boy Encounter Mochila (gift bag) and Registro (battle/dialogue log)
 * helpers. Pure, deterministic functions: interaction points unlock gifts as
 * the two people answer rounds, react and exchange messages.
 *
 * Every gift icon is drawn on the same 12×12 pixel grid as `src/ui/design/icons.ts`
 * (`#` = crisp 1px line, `+` = Bayer 50% dither fill), so there are zero raw
 * emoji characters in UI source files.
 */
import type { ConversationDto } from "@/contracts/chat";
import { getAllAnimalIds } from "@/domain/avatars/pixel-sprites";
import { formatIdentity } from "@/domain/identity/format-identity";
import { fnv1a32 } from "@/domain/shared";
import { bayerLit } from "@/ui/design/bayer";

export type GiftItemId =
  | "baya_dulce"
  | "hoja_fresca"
  | "cafe_enes"
  | "galleta_dorada"
  | "flor_jardin"
  | "piedra_estelar"
  | "elixir_nocturno"
  | "corona_astral";

export interface MochilaItem {
  readonly id: GiftItemId;
  readonly name: string;
  readonly category: string;
  readonly description: string;
  readonly reactionText: string;
  readonly minPoints: number;
  readonly drawing: readonly string[];
}

export const MOCHILA_ITEMS: readonly MochilaItem[] = [
  {
    id: "baya_dulce",
    name: "Baya Dulce",
    category: "Fruta",
    description: "Fruta silvestre del campus para romper el hielo.",
    reactionText: "dio un brinquito alegre al probar la Baya Dulce.",
    minPoints: 0,
    drawing: [
      ".....##.....",
      "....####....",
      "...##..##...",
      "..########..",
      ".##++++++##.",
      ".#++++++++#.",
      ".#++++++++#.",
      ".#++++++++#.",
      "..#++++++#..",
      "...######...",
      "............",
      "............",
    ],
  },
  {
    id: "hoja_fresca",
    name: "Hoja de Menta",
    category: "Planta",
    description: "Hoja aromática que refresca el encuentro.",
    reactionText: "olfateó la Hoja de Menta y movió las orejas con curiosidad.",
    minPoints: 1,
    drawing: [
      "........###.",
      "......##++#.",
      "....##++++#.",
      "...#+++++#..",
      "..#++++##...",
      "..#++##+#...",
      "..###++#....",
      "...#++#.....",
      "..#..#......",
      ".#..........",
      "............",
      "............",
    ],
  },
  {
    id: "cafe_enes",
    name: "Café de la ENES",
    category: "Bebida",
    description: "Taza calientita para seguir platicando entre clases.",
    reactionText: "tomó un sorbo de Café de la ENES y entró en confianza.",
    minPoints: 2,
    drawing: [
      "...#....#...",
      "....#....#..",
      "...#....#...",
      ".########...",
      ".#++++++###.",
      ".#++++++#.#.",
      ".#++++++#.#.",
      ".#++++++###.",
      "..######....",
      ".##########.",
      "............",
      "............",
    ],
  },
  {
    id: "galleta_dorada",
    name: "Galleta Pixel",
    category: "Postre",
    description: "Crujiente y recién horneada; sube el ánimo al instante.",
    reactionText: "compartió la Galleta Pixel haciendo soniditos de felicidad.",
    minPoints: 4,
    drawing: [
      "............",
      "...######...",
      "..#++++++#..",
      ".#+##++##+#.",
      ".#++++++++#.",
      ".#+++##+++#.",
      ".#++++++++#.",
      ".#+##++##+#.",
      "..#++++++#..",
      "...######...",
      "............",
      "............",
    ],
  },
  {
    id: "flor_jardin",
    name: "Flor del Jardín",
    category: "Detalle",
    description: "Cortada junto al sendero de la biblioteca.",
    reactionText: "guardó la Flor del Jardín junto a su plataforma.",
    minPoints: 6,
    drawing: [
      "....####....",
      "..##++++##..",
      ".#++####++#.",
      ".#+#++++#+#.",
      "..##++++##..",
      "....####....",
      ".....##.....",
      "...######...",
      ".....##.....",
      "....####....",
      "............",
      "............",
    ],
  },
  {
    id: "piedra_estelar",
    name: "Piedra Estelar",
    category: "Reliquia",
    description: "Fragmento brillante que guarda buena conversación.",
    reactionText: "hizo brillar la Piedra Estelar con un destello dorado.",
    minPoints: 8,
    drawing: [
      ".....##.....",
      "....#++#....",
      "...#++++#...",
      ".##########.",
      "..#++++++#..",
      "...#++++#...",
      "..#++##++#..",
      ".#++#..#++#.",
      ".###....###.",
      "............",
      "............",
      "............",
    ],
  },
  {
    id: "elixir_nocturno",
    name: "Poción Estelar",
    category: "Poción",
    description: "Frasco luminoso para pláticas largas cuando ya hay confianza.",
    reactionText: "recibió la Poción Estelar y subió su energía al máximo.",
    minPoints: 11,
    drawing: [
      "....####....",
      ".....##.....",
      "....####....",
      "...#....#...",
      "..#++++++#..",
      ".#++++++++#.",
      ".#++++++++#.",
      ".#++++++++#.",
      "..########..",
      "............",
      "............",
      "............",
    ],
  },
  {
    id: "corona_astral",
    name: "Corona Astral",
    category: "Insignia",
    description: "Insignia máxima de complicidad en la constelación.",
    reactionText: "se puso la Corona Astral y celebró con un salto doble.",
    minPoints: 15,
    drawing: [
      "............",
      ".#...##...#.",
      ".##.#++#.##.",
      ".#+#++++#+#.",
      ".#++++++++#.",
      ".#++++++++#.",
      ".##########.",
      ".##########.",
      "............",
      "............",
      "............",
      "............",
    ],
  },
] as const;

export interface GiftSvgPaths {
  readonly line: string;
  readonly fill: string;
}

const giftPathCache = new Map<GiftItemId, GiftSvgPaths>();

/** Compiles a 12×12 gift drawing into crisp SVG path strings. */
export function giftIconPaths(id: GiftItemId): GiftSvgPaths {
  const cached = giftPathCache.get(id);
  if (cached) return cached;
  const item = MOCHILA_ITEMS.find((m) => m.id === id) ?? MOCHILA_ITEMS[0]!;
  const compile = (match: (cell: string, x: number, y: number) => boolean): string => {
    const parts: string[] = [];
    item.drawing.forEach((row, y) => {
      let x = 0;
      while (x < row.length) {
        if (!match(row[x] ?? ".", x, y)) {
          x += 1;
          continue;
        }
        const start = x;
        while (x < row.length && match(row[x] ?? ".", x, y)) x += 1;
        parts.push(`M${start} ${y}h${x - start}v1h${start - x}z`);
      }
    });
    return parts.join("");
  };
  const paths: GiftSvgPaths = {
    line: compile((cell) => cell === "#"),
    fill: compile((cell, x, y) => cell === "+" && bayerLit(x, y, 0.5)),
  };
  giftPathCache.set(id, paths);
  return paths;
}

const GIFT_PREFIX = /^\[Regalo:\s*([^\]]+)\]\s*(.*)$/;

/** Builds the wire-safe chat message string when gifting an item in free chat. */
export function formatGiftMessage(item: MochilaItem): string {
  return `[Regalo: ${item.name}] Te regaló ${item.name}: ${item.description}`;
}

export interface ParsedGiftMessage {
  readonly item: MochilaItem;
  readonly summary: string;
}

/** Detects whether a free-chat message body is a Mochila gift. */
export function parseGiftMessage(body: string): ParsedGiftMessage | null {
  const match = GIFT_PREFIX.exec(body.trim());
  if (!match) return null;
  const rawName = (match[1] ?? "").trim().toLowerCase();
  const item = MOCHILA_ITEMS.find((m) => m.name.toLowerCase() === rawName || m.id === rawName);
  if (!item) return null;
  const summary = (match[2] ?? "").trim() || `Regaló ${item.name}.`;
  return { item, summary };
}

export interface LocalGiftEntry {
  readonly id: string;
  readonly itemId: GiftItemId;
  readonly at: string;
}

export interface EncounterProgress {
  readonly points: number;
  readonly level: number;
  readonly bondPercent: number;
  readonly unlockedItems: readonly MochilaItem[];
  readonly lockedItems: readonly MochilaItem[];
  readonly nextItem: MochilaItem | null;
  readonly pointsToNext: number;
}

/**
 * Computes interaction points, bond level, and unlocked Mochila gifts from
 * the conversation's real rounds, reactions, messages and local gifts.
 */
export function computeEncounterProgress(
  convo: Pick<ConversationDto, "rounds" | "completedRounds" | "messages">,
  localGiftsCount = 0,
): EncounterProgress {
  let points = 0;
  for (const r of convo.rounds) {
    points += 1; // Question opened
    if (r.mine !== null || r.minePassed) points += 1;
    if (r.revealed) points += 2;
    if (r.myReaction !== null) points += 1;
    if (r.theirReaction !== null) points += 1;
  }
  points += convo.messages.length;
  points += Math.min(3, Math.max(0, localGiftsCount));

  const unlockedItems = MOCHILA_ITEMS.filter((item) => points >= item.minPoints);
  const lockedItems = MOCHILA_ITEMS.filter((item) => points < item.minPoints);
  const nextItem = lockedItems[0] ?? null;
  const pointsToNext = nextItem ? Math.max(0, nextItem.minPoints - points) : 0;

  const level = Math.min(99, 1 + Math.floor(points / 2));
  const maxPointsRef = MOCHILA_ITEMS[MOCHILA_ITEMS.length - 1]?.minPoints ?? 15;
  const bondPercent = Math.min(100, Math.max(8, Math.round((points / maxPointsRef) * 100)));

  return {
    points,
    level,
    bondPercent,
    unlockedItems,
    lockedItems,
    nextItem,
    pointsToNext,
  };
}

export type DialogueSpeaker = "peer" | "me" | "system";
export type DialogueKind = "intro" | "round_question" | "round_mine" | "round_theirs" | "message" | "gift";

export interface DialogueLine {
  readonly id: string;
  readonly speaker: DialogueSpeaker;
  readonly speakerName: string;
  readonly kind: DialogueKind;
  readonly text: string;
  readonly badge: string;
  readonly at?: string;
  readonly gift?: MochilaItem;
}

/**
 * Builds the chronological script of the encounter for both the Game Boy
 * dialogue box and the full Registro de conversación.
 */
export function buildEncounterScript(
  convo: ConversationDto,
  localGifts: readonly LocalGiftEntry[] = [],
): DialogueLine[] {
  const peerName = formatIdentity(convo.peer.identity).shortName;
  const myName = convo.me ? formatIdentity(convo.me.identity).shortName : "Tu animalito";
  const lines: DialogueLine[] = [
    {
      id: `intro-${convo.id}`,
      speaker: "system",
      speakerName: "Encuentro",
      kind: "intro",
      text: `¡${peerName} apareció en la arena! Hablen por turnos para subir su vínculo y desbloquear regalos en la mochila.`,
      badge: "Inicio",
    },
  ];

  for (const round of convo.rounds) {
    const roundBadge = `Ronda ${round.index + 1}`;
    lines.push({
      id: `round-q-${round.index}`,
      speaker: round.askedByMe ? "me" : "peer",
      speakerName: round.askedByMe ? `Tú (${myName})` : peerName,
      kind: "round_question",
      text: `Pregunta: «${round.question}»`,
      badge: roundBadge,
    });
    if (round.mine !== null) {
      lines.push({
        id: `round-m-${round.index}`,
        speaker: "me",
        speakerName: `Tú (${myName})`,
        kind: "round_mine",
        text: round.mine,
        badge: `${roundBadge} · Tú`,
      });
    } else if (round.minePassed) {
      lines.push({
        id: `round-mp-${round.index}`,
        speaker: "me",
        speakerName: `Tú (${myName})`,
        kind: "round_mine",
        text: "(Pasaste esta pregunta)",
        badge: `${roundBadge} · Tú`,
      });
    }
    if (round.revealed) {
      if (round.theirs !== null && !round.theirsPassed) {
        const reactSuffix = round.myReaction ? ` [${round.myReaction}]` : "";
        lines.push({
          id: `round-t-${round.index}`,
          speaker: "peer",
          speakerName: peerName,
          kind: "round_theirs",
          text: `${round.theirs}${reactSuffix}`,
          badge: `${roundBadge} · Su respuesta`,
        });
      } else {
        lines.push({
          id: `round-tp-${round.index}`,
          speaker: "peer",
          speakerName: peerName,
          kind: "round_theirs",
          text: "(Prefirió pasar esta pregunta)",
          badge: `${roundBadge} · Su respuesta`,
        });
      }
    }
  }

  for (const g of localGifts) {
    const item = MOCHILA_ITEMS.find((m) => m.id === g.itemId);
    if (!item) continue;
    lines.push({
      id: `local-gift-${g.id}`,
      speaker: "me",
      speakerName: `Tú (${myName})`,
      kind: "gift",
      text: `Lanzaste ${item.name} a ${peerName}. ¡${peerName} ${item.reactionText}`,
      badge: "Regalo",
      at: g.at,
      gift: item,
    });
  }

  for (const msg of convo.messages) {
    const parsedGift = parseGiftMessage(msg.body);
    if (parsedGift) {
      const sender = msg.mine ? `Tú (${myName})` : peerName;
      const receiver = msg.mine ? peerName : myName;
      lines.push({
        id: `msg-gift-${msg.id}`,
        speaker: msg.mine ? "me" : "peer",
        speakerName: sender,
        kind: "gift",
        text: `${sender} regaló ${parsedGift.item.name}. ¡${receiver} ${parsedGift.item.reactionText}`,
        badge: "Regalo",
        at: msg.at,
        gift: parsedGift.item,
      });
    } else {
      lines.push({
        id: `msg-${msg.id}`,
        speaker: msg.mine ? "me" : "peer",
        speakerName: msg.mine ? `Tú (${myName})` : peerName,
        kind: "message",
        text: msg.body,
        badge: "Chat",
        at: msg.at,
      });
    }
  }

  return lines;
}

const FALLBACK_COLORS = ["ennea-1", "ennea-2", "ennea-4", "ennea-5", "ennea-7", "ennea-9"] as const;

/**
 * Returns the viewer's own sprite coordinates `(animalId, colorId, mark)`,
 * falling back to a deterministic sprite derived from `convo.id` when `convo.me`
 * is absent in legacy fixtures.
 */
export function resolveMySprite(convo: ConversationDto): {
  readonly animalId: string;
  readonly colorId: string;
  readonly mark: "sp" | "so" | "sx" | null;
  readonly shortName: string;
} {
  const id = convo.me?.identity;
  if (id && id.animalId && id.colorId) {
    return {
      animalId: id.animalId,
      colorId: id.colorId,
      mark: id.mark,
      shortName: formatIdentity(id).shortName,
    };
  }
  const allAnimals = getAllAnimalIds();
  const h = fnv1a32(`me:${convo.id}`);
  const peerAnimal = convo.peer.identity.animalId;
  let animalIdx = h % allAnimals.length;
  if (allAnimals[animalIdx] === peerAnimal) {
    animalIdx = (animalIdx + 1) % allAnimals.length;
  }
  const animalId = allAnimals[animalIdx] ?? "nutria";
  const colorId = FALLBACK_COLORS[(h >>> 4) % FALLBACK_COLORS.length] ?? "ennea-4";
  return {
    animalId,
    colorId,
    mark: null,
    shortName: `Tu ${animalId}`,
  };
}
