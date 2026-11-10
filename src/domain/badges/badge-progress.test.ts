/**
 * The arithmetic of the derived grid (M-14): what the six counters mean when
 * the same person has several conversations, and which calendar the activity
 * window uses. `docs/INSIGNIAS.md` §2, §3 and §7 state the rules; these tests
 * are the reason the rules cannot drift while nobody reads them.
 */
import { describe, expect, it } from "vitest";

import { BADGES } from "@/config/badges";
import { BADGE_CATALOG } from "@/domain/badges/badge-catalog";
import { badgeProgress, unlockedBadgeIds, type BadgeConversationTally, type BadgeFacts } from "@/domain/badges/badge-progress";

const NOW = new Date("2026-11-10T12:00:00-06:00");
const DAY = 86_400_000;

const tally = (over: Partial<BadgeConversationTally> = {}): BadgeConversationTally => ({
  answeredRounds: 0,
  completedRounds: 0,
  freeChat: false,
  ...over,
});

const facts = (over: Partial<BadgeFacts> = {}): BadgeFacts => ({
  totalMatches: 0,
  quizzesCompleted: 0,
  conversations: [],
  activity: [],
  now: NOW,
  ...over,
});

describe("badgeProgress over several conversations", () => {
  it("takes the furthest conversation for rounds, never the sum", () => {
    const progress = badgeProgress(facts({
      conversations: [tally({ answeredRounds: 2, completedRounds: 2 }), tally({ answeredRounds: 3, completedRounds: 3 })],
    }));
    expect(progress.completedRounds).toBe(3);
    expect(progress.completedRounds).not.toBe(5);
  });

  it("counts conversations for the completed one, so three pairs do not equal three logros", () => {
    const progress = badgeProgress(facts({
      conversations: [tally({ answeredRounds: 1 }), tally({ answeredRounds: 4 }), tally({ answeredRounds: 0, completedRounds: 3 })],
    }));
    expect(progress.completedConversations).toBe(2);
  });

  it("separates what people did from what the clock revealed", () => {
    // Three rounds sealed by the 48 h timer with no answers at all: free chat is
    // open and the round counter moved, yet nobody completed a conversation.
    const progress = badgeProgress(facts({ conversations: [tally({ answeredRounds: 0, completedRounds: 3, freeChat: true })] }));
    expect(progress.completedConversations).toBe(0);
    expect(progress.completedRounds).toBe(3);
    expect(progress.hasFreeChat).toBe(true);
    const ids = unlockedBadgeIds(progress);
    expect(ids).not.toContain("conversacion_completada");
    expect(ids).toContain("tres_rondas");
    expect(ids).toContain("chat_libre");
  });

  it("unlocks nothing when nothing was done", () => {
    expect(unlockedBadgeIds(badgeProgress(facts()))).toEqual([]);
  });
});

describe("the activity window", () => {
  const { ventana_actividad_dias: window, zona_horaria: zone } = BADGES.politica;

  it("groups stamps by calendar day of the person, not by UTC slice", () => {
    // 06:30 Z is 00:30 in CDMX (the 9th); 04:30 Z is 22:30 of the 8th. One UTC
    // date, two days on the calendar of the person.
    const stamps = [new Date("2026-11-09T06:30:00Z"), new Date("2026-11-09T04:30:00Z")];
    const localDay = (stamp: Date) =>
      new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(stamp);
    expect(new Set(stamps.map((stamp) => stamp.toISOString().slice(0, 10))).size).toBe(1);
    expect(new Set(stamps.map(localDay)).size).toBe(2);
    expect(badgeProgress(facts({ activity: stamps })).activeDays).toBe(2);
  });

  it("counts a day once, however many things happened in it", () => {
    const sameDay = badgeProgress(facts({
      activity: [new Date("2026-11-09T15:00:00-06:00"), new Date("2026-11-09T21:00:00-06:00"), new Date("2026-11-09T23:59:00-06:00")],
    })).activeDays;
    expect(sameDay).toBe(1);
  });

  it("keeps exactly the window it declares: the first instant counts, one ms earlier does not", () => {
    const from = NOW.getTime() - (window - 1) * DAY;
    expect(badgeProgress(facts({ activity: [new Date(from)] })).activeDays).toBe(1);
    expect(badgeProgress(facts({ activity: [new Date(from - 1)] })).activeDays).toBe(0);
  });

  it("is a set of days, so it can never exceed the window", () => {
    const everyDay = Array.from({ length: window + 10 }, (_, i) => new Date(NOW.getTime() - i * DAY));
    expect(badgeProgress(facts({ activity: everyDay })).activeDays).toBeLessThanOrEqual(window);
  });

  it("meets the seven days of the badge inside the window it uses", () => {
    const badge = BADGE_CATALOG.find((b) => b.id === "semana_activa")!;
    if (badge.condicion.tipo !== "active_days") throw new Error("semana_activa must stay an active_days badge");
    expect(badge.condicion.min).toBeLessThanOrEqual(window);
    const seven = Array.from({ length: badge.condicion.min }, (_, i) => new Date(NOW.getTime() - i * DAY));
    expect(unlockedBadgeIds(badgeProgress(facts({ activity: seven }))).at(-1)).toBe("semana_activa");
  });
});

describe("unlockedBadgeIds", () => {
  it("returns catalogue ids only, in catalogue order", () => {
    const ids = unlockedBadgeIds(badgeProgress(facts({
      totalMatches: 4,
      quizzesCompleted: 3,
      activity: [NOW, new Date(NOW.getTime() - DAY)],
      conversations: [tally({ answeredRounds: 3, completedRounds: 3, freeChat: true })],
    })));
    const catalogue = BADGE_CATALOG.map((b) => b.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => catalogue.includes(id))).toBe(true);
    expect(ids).toEqual(catalogue.filter((id) => ids.includes(id)));
    expect(ids.some((id) => /\s/.test(id))).toBe(false);
  });

  it("only ever grows: raising one counter cannot lock a badge away", () => {
    const less = badgeProgress(facts({ quizzesCompleted: 2 }));
    const more = badgeProgress(facts({ quizzesCompleted: 3 }));
    expect(unlockedBadgeIds(more).length).toBeGreaterThan(unlockedBadgeIds(less).length);
    expect(unlockedBadgeIds(more)).toEqual(expect.arrayContaining(unlockedBadgeIds(less)));
  });
});
