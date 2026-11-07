/**
 * The sound decision inside an open conversation: arriving is not news, a
 * sealed answer turning over outranks a message, and neither paging backwards
 * nor a muted conversation ever chimes.
 */
import { describe, expect, it } from "vitest";

import { conversationSound, type ConversationSoundView } from "./conversation-sound";

function view(over: Partial<ConversationSoundView> = {}): ConversationSoundView {
  return { muted: false, rounds: [], messages: [], ...over };
}

const theirs = (id: string, at = `2026-11-07T10:0${id.slice(-1)}:00Z`) => ({ id, mine: false, at });
const ours = (id: string, at = `2026-11-07T10:0${id.slice(-1)}:00Z`) => ({ id, mine: true, at });
const round = (index: number, revealed: boolean) => ({ index, revealed });

describe("conversationSound", () => {
  it("al abrir no suena lo que ya estaba en la conversación", () => {
    expect(conversationSound(null, view({ messages: [theirs("m1")], rounds: [round(0, true)] }))).toBeNull();
  });

  it("un mensaje de la otra persona suena una sola vez", () => {
    const before = view({ messages: [theirs("m1")] });
    const after = view({ messages: [theirs("m1"), theirs("m2")] });
    expect(conversationSound(before, after)).toBe("mensaje_nuevo");
    expect(conversationSound(after, after)).toBeNull();
  });

  it("el primer mensaje de un chat libre también es novedad", () => {
    expect(conversationSound(view(), view({ messages: [theirs("m1")] }))).toBe("mensaje_nuevo");
  });

  it("lo que escribo yo no suena", () => {
    const before = view({ messages: [theirs("m1")] });
    expect(conversationSound(before, view({ messages: [theirs("m1"), ours("m2")] }))).toBeNull();
  });

  it("una respuesta sellada que se revela gana sobre un mensaje nuevo", () => {
    const before = view({ rounds: [round(0, false)], messages: [theirs("m1")] });
    const after = view({ rounds: [round(0, true)], messages: [theirs("m1"), theirs("m2")] });
    expect(conversationSound(before, after)).toBe("respuesta_revelada");
  });

  it("una ronda que ya estaba revelada no vuelve a sonar", () => {
    const state = view({ rounds: [round(0, true), round(1, true)] });
    expect(conversationSound(state, state)).toBeNull();
  });

  it("revelar la segunda ronda sí suena aunque la primera ya lo estuviera", () => {
    const before = view({ rounds: [round(0, true), round(1, false)] });
    expect(conversationSound(before, view({ rounds: [round(0, true), round(1, true)] }))).toBe("respuesta_revelada");
  });

  it("una conversación silenciada no suena nunca", () => {
    const before = view({ rounds: [round(0, false)], messages: [theirs("m1")] });
    const after = view({ muted: true, rounds: [round(0, true)], messages: [theirs("m1"), theirs("m2")] });
    expect(conversationSound(before, after)).toBeNull();
  });

  it("cargar mensajes antiguos no inventa un mensaje nuevo", () => {
    const before = view({ messages: [theirs("m3")] });
    const after = view({ messages: [theirs("m1"), theirs("m2"), theirs("m3")] });
    expect(conversationSound(before, after)).toBeNull();
  });

  it("una página antigua que llega después del último mensaje tampoco suena", () => {
    const before = view({ messages: [theirs("m3")] });
    const after = view({ messages: [theirs("m3"), theirs("m1")] });
    expect(conversationSound(before, after)).toBeNull();
  });

  it("sin mensajes ni rondas nuevas no hay sonido", () => {
    expect(conversationSound(view(), view())).toBeNull();
  });
});