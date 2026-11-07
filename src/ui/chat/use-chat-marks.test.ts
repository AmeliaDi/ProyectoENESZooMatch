/**
 * What the sky learns from the interest store (docs/CHAT.md §13.3). A chat
 * already open when the page loads is not news; one that opens in front of the
 * viewer is, exactly once, and switching tracks must not invent an opening.
 */
import { describe, expect, it } from "vitest";

import type { InterestStateDto } from "@/contracts/chat";

import { chatMarksFor, firstNew } from "./use-chat-marks";

const CONVERSATION = "3f2b8c14-5d67-4a91-8e03-9b7c2d514a6f";

describe("chatMarksFor", () => {
  const states: Record<string, InterestStateDto> = {
    "romance:a": { state: "open", conversation: CONVERSATION },
    "romance:b": { state: "invited" },
    "romance:c": { state: "sent" },
    "amistad:d": { state: "open", conversation: "0b1e4f78-2c35-4d69-9a81-7e6f3c2b5d10" },
  };

  it("separa abiertos, invitaciones y señales propias, por vía", () => {
    const romance = chatMarksFor(states, "romance");
    expect([...romance.open]).toEqual(["a"]);
    expect([...romance.pending]).toEqual(["b"]);
    const amistad = chatMarksFor(states, "amistad");
    expect([...amistad.open]).toEqual(["d"]);
    expect([...amistad.pending]).toEqual([]);
  });

  it("guarda el id de conversación para poder abrirlo de un toque", () => {
    expect(chatMarksFor(states, "romance").conversations.get("a")).toBe(CONVERSATION);
    expect(chatMarksFor(states, "romance").conversations.get("b")).toBeUndefined();
  });

  it("una señal propia no marca el nodo: nadie ve una respuesta negativa", () => {
    const marks = chatMarksFor({ "romance:c": { state: "sent" } }, "romance");
    expect(marks.open.size).toBe(0);
    expect(marks.pending.size).toBe(0);
  });

  it("sin señales no marca nada", () => {
    const marks = chatMarksFor({}, "romance");
    expect(marks.open.size).toBe(0);
    expect(marks.pending.size).toBe(0);
    expect(marks.conversations.size).toBe(0);
  });
});

describe("firstNew", () => {
  it("al llegar no anuncia los chats que ya estaban abiertos", () => {
    expect(firstNew(null, new Set(["a", "b"]))).toBeNull();
  });

  it("anuncia el que se abrió delante de la persona", () => {
    expect(firstNew(new Set(["a"]), new Set(["a", "b"]))).toBe("b");
  });

  it("no vuelve a anunciar lo mismo en el siguiente sondeo", () => {
    expect(firstNew(new Set(["a", "b"]), new Set(["a", "b"]))).toBeNull();
  });

  it("cambiar de vía no inventa una apertura", () => {
    // The hook passes null when the track changes, exactly like arriving.
    expect(firstNew(null, new Set(["d"]))).toBeNull();
  });

  it("una conversación que se cerró y volvió a abrirse sí es novedad", () => {
    expect(firstNew(new Set(), new Set(["a"]))).toBe("a");
  });

  it("sirve igual para invitaciones: al llegar no suena lo que ya esperaba", () => {
    expect(firstNew(null, new Set(["b"]))).toBeNull();
    expect(firstNew(new Set(), new Set(["b"]))).toBe("b");
    expect(firstNew(new Set(["b"]), new Set(["b"]))).toBeNull();
  });
});