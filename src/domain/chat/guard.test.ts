import { describe, expect, it } from "vitest";

import { CHAT_MODERATION } from "@/config/chat-moderation";

import { contactHints, foldText, guardChatText, hasLink, isOffensive } from "./guard";

describe("anonymity guard", () => {
  it("blocks links, including bare domains", () => {
    for (const text of ["mira https://ejemplo.com", "www.algo.mx", "entra a misitio.com/perfil", "bit.ly/abc"]) {
      expect(hasLink(text), text).toBe(true);
      expect(guardChatText(text, CHAT_MODERATION)).toEqual({ kind: "blocked", reason: "link" });
    }
  });

  it("does not take normal punctuation or an e-mail for a link", () => {
    expect(hasLink("Me gusta el café. También el té.")).toBe(false);
    expect(hasLink("hola@correo.com")).toBe(false);
  });

  it("warns (never blocks) about phones, e-mails and handles", () => {
    expect(contactHints("mi número es 55 1234 5678", CHAT_MODERATION)).toEqual(["phone"]);
    expect(contactHints("escríbeme a hola@correo.com", CHAT_MODERATION)).toEqual(["email"]);
    expect(contactHints("búscame como @zorrito_azul", CHAT_MODERATION)).toEqual(["handle"]);
    expect(contactHints("pásame tu insta, el mío es nutria", CHAT_MODERATION)).toEqual([]);
    expect(contactHints("te paso mi insta", CHAT_MODERATION)).toEqual(["handle"]);
    expect(guardChatText("mi cel 5512345678", CHAT_MODERATION)).toEqual({ kind: "ok", notice: ["phone"] });
  });

  it("does not flag years, times or short numbers as phones", () => {
    expect(contactHints("en 2026 a las 12:45, 3 de 5", CHAT_MODERATION)).toEqual([]);
  });
});

describe("offensive language", () => {
  it("blocks listed words and phrases regardless of case and accents", () => {
    expect(isOffensive("Eres un IMBÉCIL", CHAT_MODERATION)).toBe(true);
    expect(isOffensive("vete a la verga", CHAT_MODERATION)).toBe(true);
    expect(guardChatText("pendejo", CHAT_MODERATION)).toEqual({ kind: "blocked", reason: "offensive" });
  });

  it("does not flag the reviewed false positives", () => {
    for (const word of CHAT_MODERATION.revision.falsos_positivos_revisados) {
      expect(isOffensive(`me gusta ${word}`, CHAT_MODERATION), word).toBe(false);
    }
  });

  it("folds accents but keeps ñ", () => {
    expect(foldText("Ñandú Café ÁRBOL")).toBe("ñandu cafe arbol");
  });
});
