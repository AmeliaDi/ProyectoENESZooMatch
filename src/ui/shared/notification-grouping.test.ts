import { describe, expect, it } from "vitest";

import { groupNotifications, notificationSound, type IncomingNotification } from "./notification-grouping";

function n(id: string, type: string, created_at: string, read = false): IncomingNotification {
  return { id, type, title: `t-${id}`, body: `b-${id}`, read, created_at };
}

describe("groupNotifications", () => {
  it("folds each kind into one toast with the newest first", () => {
    const toasts = groupNotifications(
      [n("1", "match_romance", "2026-01-01"), n("2", "match_romance", "2026-01-02"), n("3", "welcome", "2026-01-01")],
      new Set(),
      5,
    );
    expect(toasts).toHaveLength(2);
    expect(toasts[0]).toMatchObject({ id: "2", tone: "romance", title: "t-2", ids: ["2", "1"] });
    expect(toasts[0]?.body).toBe("b-2 (y 1 aviso más)");
    expect(toasts[1]).toMatchObject({ tone: "neutral", body: "b-3" });
  });

  it("skips read and dismissed notifications and respects the cap", () => {
    const toasts = groupNotifications(
      [n("1", "match_romance", "1", true), n("2", "match_amistad", "1"), n("3", "welcome", "1"), n("4", "no_match", "1")],
      new Set(["3"]),
      1,
    );
    expect(toasts.map((t) => t.id)).toEqual(["2"]);
  });

  it("folds chat news into one quiet toast without a count", () => {
    const chat = (id: string, at: string): IncomingNotification => ({
      id, type: "chat", title: "Tienes novedades en tus chats", body: "", read: false, created_at: at,
    });
    const toasts = groupNotifications([chat("1", "2026-01-01"), chat("2", "2026-01-02"), chat("3", "2026-01-03")], new Set(), 3);
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toMatchObject({ id: "3", tone: "neutral", title: "Tienes novedades en tus chats", body: "", ids: ["3", "2", "1"] });
    expect(toasts[0]?.action).toEqual({ href: "/chats", label: "Ir a tus chats" });
  });

  it("never invents urgency: bodies are passed through unchanged", () => {
    const [toast] = groupNotifications([n("1", "match_amistad", "1")], new Set(), 3);
    expect(toast?.body).toBe("b-1");
    expect(toast?.body).not.toMatch(/prisa|ahora mismo|solo hoy/i);
    expect(toast?.action).toBeUndefined();
  });
});

describe("notificationSound", () => {
  it("al llegar no suena lo que ya esperaba", () => {
    expect(notificationSound(null, [n("1", "match_romance", "1")])).toBeNull();
  });

  it("un match nuevo suena, sea romántico o de amistad", () => {
    expect(notificationSound(new Set(), [n("1", "match_romance", "1")])).toBe("match_nuevo");
    expect(notificationSound(new Set(), [n("1", "match_amistad", "1")])).toBe("match_nuevo");
  });

  it("las novedades de chat suenan a mensaje", () => {
    expect(notificationSound(new Set(), [n("1", "chat", "1")])).toBe("mensaje_nuevo");
  });

  it("un match gana sobre el chat y nunca pide dos sonidos a la vez", () => {
    expect(notificationSound(new Set(), [n("1", "chat", "1"), n("2", "match_amistad", "2")])).toBe("match_nuevo");
  });

  it("lo ya visto, lo leído y lo que no tiene sonido se quedan callados", () => {
    const seen = new Set(["1"]);
    expect(notificationSound(seen, [n("1", "match_romance", "1")])).toBeNull();
    expect(notificationSound(seen, [n("2", "match_romance", "1", true)])).toBeNull();
    expect(notificationSound(seen, [n("3", "welcome", "1"), n("4", "no_match", "1"), n("5", "identity", "1")])).toBeNull();
  });

  it("sin avisos no hay sonido", () => {
    expect(notificationSound(new Set(), [])).toBeNull();
  });
});
