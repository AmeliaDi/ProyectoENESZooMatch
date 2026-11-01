import { describe, expect, it } from "vitest";

import { groupNotifications, type IncomingNotification } from "./notification-grouping";

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

  it("never invents urgency: bodies are passed through unchanged", () => {
    const [toast] = groupNotifications([n("1", "match_amistad", "1")], new Set(), 3);
    expect(toast?.body).toBe("b-1");
    expect(toast?.body).not.toMatch(/prisa|ahora mismo|solo hoy/i);
  });
});
