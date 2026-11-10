/**
 * The badge read path (M-14): what the grid may say from the rows the chat and
 * the quizzes already store, and — just as important — what it must refuse to
 * say. `docs/INSIGNIAS.md` §5 states the two silences tested here: no date and
 * no "cero" when a read fails.
 */
import { describe, expect, it } from "vitest";

import { BADGES } from "@/config/badges";
import type { MessageRow } from "./chat/conversation-ports";
import { deriveBadges, type BadgeDeps } from "./profile-badges";
import { ANA, BEA } from "./testing/chat-world";
import { badgeAttempts, memoryBadges } from "./testing/memory-badges";
import { ConversationStore, memoryConversations } from "./testing/memory-conversations";

const NOW = new Date("2026-11-10T12:00:00-06:00");
const DAY = 86_400_000;
const HOUR = 3_600_000;
/** Text nobody may find in the profile payload: it belongs to a person, not to a counter. */
const PRIVATE = "texto-que-no-sale-de-aqui";

function fixture() {
  const store = new ConversationStore();
  store.now = () => NOW;
  return store;
}

function conversation(store: ConversationStore) {
  return store.open(ANA, BEA, "amistad");
}

function round(store: ConversationStore, conversationId: string, index: number, asker: string, at: Date): void {
  store.rounds.push({
    conversationId, index, asker, promptId: `p${index}`, customText: null,
    feedbackA: false, feedbackB: false, createdAt: at,
  });
}

function mark(store: ConversationStore, conversationId: string, author: string, index: number, passed = false): void {
  store.answers.push({ conversationId, author, round: index, body: passed ? "" : PRIVATE, passed });
}

function message(store: ConversationStore, conversationId: string, author: string, at: Date): MessageRow & { conversationId: string; clientKey: string } {
  const row = { id: store.nextId(), author, body: PRIVATE, at, conversationId, clientKey: `k${store.messages.length}` };
  store.messages.push(row);
  return row;
}

describe("deriveBadges", () => {
  it("says nothing when a read fails, instead of a grid of zeros", async () => {
    const store = fixture();
    conversation(store);
    const deps = memoryBadges(memoryConversations(store), [badgeAttempts("q1", NOW)], () => NOW, true);
    expect(await deriveBadges(ANA, 3, deps)).toBeNull();
  });

  it("reads the answers without their bodies and keeps only ids in the payload", async () => {
    const store = fixture();
    const row = conversation(store);
    const at = new Date(NOW.getTime() - DAY);
    for (let i = 0; i < 3; i += 1) {
      round(store, row.id, i, i % 2 === 0 ? ANA : BEA, new Date(at.getTime() + i * HOUR));
      mark(store, row.id, ANA, i);
      mark(store, row.id, BEA, i);
    }
    message(store, row.id, ANA, at);

    const base = memoryConversations(store);
    const seen: boolean[] = [];
    const deps: BadgeDeps = {
      ...memoryBadges(base, [badgeAttempts("q1", at)], () => NOW),
      conversations: {
        ...base,
        answersOf: async (ids, withBodies) => {
          seen.push(withBodies);
          return base.answersOf(ids, withBodies);
        },
      },
    };
    const ids = await deriveBadges(ANA, 1, deps);
    expect(seen).toEqual([false]);
    expect(ids).toEqual(expect.arrayContaining(["conversacion_completada", "tres_rondas", "chat_libre", "primer_match"]));
    expect(JSON.stringify(ids)).not.toContain(PRIVATE);
    expect(JSON.stringify(ids)).not.toContain(ANA);
  });

  it("does not call a clock reveal a conversation completed by people", async () => {
    const store = fixture();
    const row = conversation(store);
    // Three rounds older than the reveal window, each with only one mark: the
    // chat shows them, the arithmetic of the badge does not.
    for (let i = 0; i < 3; i += 1) {
      round(store, row.id, i, ANA, new Date(NOW.getTime() - (4 + i) * DAY));
      mark(store, row.id, ANA, i);
    }
    const ids = await deriveBadges(ANA, 0, memoryBadges(memoryConversations(store), [], () => NOW));
    expect(ids).toContain("tres_rondas");
    expect(ids).toContain("chat_libre");
    expect(ids).not.toContain("conversacion_completada");
  });

  it("counts a round where both chose Pasar: the round was done by people", async () => {
    const store = fixture();
    const row = conversation(store);
    const at = new Date(NOW.getTime() - DAY);
    round(store, row.id, 0, ANA, at);
    mark(store, row.id, ANA, 0, true);
    mark(store, row.id, BEA, 0, true);
    const ids = await deriveBadges(ANA, 0, memoryBadges(memoryConversations(store), [], () => NOW));
    expect(ids).toEqual(["conversacion_completada"]);
  });

  it("counts one badge for the quizzes, without saying which ones", async () => {
    const store = fixture();
    const sameDay = NOW;
    const attempts = [
      badgeAttempts("romance-core-1", new Date(sameDay.getTime() - HOUR)),
      badgeAttempts("amistad-core-2", new Date(sameDay.getTime() - 2 * HOUR)),
      badgeAttempts("picante-1", new Date(sameDay.getTime() - 3 * HOUR)),
    ];
    const ids = await deriveBadges(ANA, 0, memoryBadges(memoryConversations(store), attempts, () => NOW));
    expect(ids).toEqual(["tres_rompehielos"]);
    expect(JSON.stringify(ids)).not.toContain("picante");
    expect(JSON.stringify(ids)).not.toContain("romance");
  });

  it("can only understate the active days when the message window is full", async () => {
    const { tope_mensajes_ventana: cap, ventana_actividad_dias: window } = BADGES.politica;
    expect(cap).toBeLessThan(window * 10);

    const busy = (messagesPerDay: number, days: number) => {
      const store = fixture();
      const row = conversation(store);
      for (let day = 0; day < days; day += 1) {
        for (let n = 0; n < messagesPerDay; n += 1) {
          // Oldest first, the order the table returns.
          message(store, row.id, ANA, new Date(NOW.getTime() - (days - 1 - day) * DAY - (messagesPerDay - n) * 60_000));
        }
      }
      const realDays = new Set(store.messages.map((m) => m.at.toISOString().slice(0, 10))).size;
      return { store, ids: () => deriveBadges(ANA, 0, memoryBadges(memoryConversations(store), [], () => NOW)), realDays };
    };

    // Under the cap: seven real days, seven days claimed.
    const inside = busy(20, 7);
    expect(inside.realDays).toBe(7);
    expect(await inside.ids()).toContain("semana_activa");

    // Over the cap: the read sees the newest `cap`, so the older days drop out.
    const over = busy(50, 7);
    expect(over.store.messages.length).toBeGreaterThan(cap);
    const claimed = await over.ids();
    expect(claimed).not.toContain("semana_activa");
  });

  it("ignores the counterpart's stamps and keeps only what this person did", async () => {
    const store = fixture();
    const row = conversation(store);
    const at = new Date(NOW.getTime() - DAY);
    round(store, row.id, 0, BEA, at);
    mark(store, row.id, BEA, 0);
    message(store, row.id, BEA, at);
    store.update(row.id, { seenB: at, lastActor: BEA, updatedAt: at });
    // Nothing of ANA's own: no round opened, no message written, nothing seen.
    const ids = await deriveBadges(ANA, 0, memoryBadges(memoryConversations(store), [], () => NOW));
    expect(ids).toEqual([]);
  });
});
