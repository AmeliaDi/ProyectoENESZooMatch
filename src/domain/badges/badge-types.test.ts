/**
 * Tests for the badge system domain logic.
 * Verifies badge definitions, unlock conditions, and catalog integrity.
 */

import { describe, expect, it } from "vitest";

import { BADGE_CATALOG, getBadgeDefinition } from "@/domain/badges/badge-catalog";
import { checkBadgeUnlock, type BadgeProgress } from "@/domain/badges/badge-types";

const FORBIDDEN_WORDS = [
  "solo",
  "siempre",
  "nunca",
  "tienes que",
  "debes",
  "por que no",
  "deberias",
  "obligacion",
  "problema",
  "triste",
  "sola",
  "soledad",
];

describe("badge catalog", () => {
  it("has exactly 6 badges, each with its own icon", () => {
    expect(BADGE_CATALOG).toHaveLength(6);
    expect(new Set(BADGE_CATALOG.map((b) => b.icono)).size).toBe(BADGE_CATALOG.length);
  });

  it("every badge has a unique id", () => {
    const ids = BADGE_CATALOG.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every badge has non-empty nombre and descripcion", () => {
    for (const badge of BADGE_CATALOG) {
      expect(badge.nombre.length).toBeGreaterThan(0);
      expect(badge.descripcion.length).toBeGreaterThan(0);
    }
  });

  it("no badge copy contains forbidden words", () => {
    for (const badge of BADGE_CATALOG) {
      const text = `${badge.nombre} ${badge.descripcion}`.toLowerCase();
      for (const word of FORBIDDEN_WORDS) {
        expect(text, `${badge.id} contains "${word}"`).not.toContain(word);
      }
    }
  });

  it("getBadgeDefinition returns the correct badge or null", () => {
    expect(getBadgeDefinition("primer_match")?.id).toBe("primer_match");
    expect(getBadgeDefinition("semana_activa")?.id).toBe("semana_activa");
    expect(getBadgeDefinition("nonexistent")).toBeNull();
  });
});

describe("badge unlock conditions", () => {
  const baseProgress: BadgeProgress = {
    totalMatches: 0,
    completedConversations: 0,
    completedRounds: 0,
    hasFreeChat: false,
    activeDays: 0,
    quizzesCompleted: 0,
  };

  it("primer_match unlocks at 1 match", () => {
    const badge = getBadgeDefinition("primer_match")!;
    expect(checkBadgeUnlock(badge, baseProgress)).toBe(false);
    expect(checkBadgeUnlock(badge, { ...baseProgress, totalMatches: 1 })).toBe(true);
    expect(checkBadgeUnlock(badge, { ...baseProgress, totalMatches: 5 })).toBe(true);
  });

  it("conversacion_completada unlocks after 1 completed conversation", () => {
    const badge = getBadgeDefinition("conversacion_completada")!;
    expect(checkBadgeUnlock(badge, baseProgress)).toBe(false);
    expect(checkBadgeUnlock(badge, { ...baseProgress, completedConversations: 1 })).toBe(true);
  });

  it("tres_rondas unlocks at 3 completed rounds", () => {
    const badge = getBadgeDefinition("tres_rondas")!;
    expect(checkBadgeUnlock(badge, { ...baseProgress, completedRounds: 2 })).toBe(false);
    expect(checkBadgeUnlock(badge, { ...baseProgress, completedRounds: 3 })).toBe(true);
    expect(checkBadgeUnlock(badge, { ...baseProgress, completedRounds: 10 })).toBe(true);
  });

  it("chat_libre unlocks when free chat is available", () => {
    const badge = getBadgeDefinition("chat_libre")!;
    expect(checkBadgeUnlock(badge, baseProgress)).toBe(false);
    expect(checkBadgeUnlock(badge, { ...baseProgress, hasFreeChat: true })).toBe(true);
  });

  it("semana_activa unlocks at 7 active days", () => {
    const badge = getBadgeDefinition("semana_activa")!;
    expect(checkBadgeUnlock(badge, { ...baseProgress, activeDays: 6 })).toBe(false);
    expect(checkBadgeUnlock(badge, { ...baseProgress, activeDays: 7 })).toBe(true);
    expect(checkBadgeUnlock(badge, { ...baseProgress, activeDays: 30 })).toBe(true);
  });

  it("tres_rompehielos unlocks at 3 completed quizzes, counted as one number", () => {
    const badge = getBadgeDefinition("tres_rompehielos")!;
    expect(badge.condicion).toEqual({ tipo: "quizzes_completados", min: 3 });
    expect(checkBadgeUnlock(badge, { ...baseProgress, quizzesCompleted: 2 })).toBe(false);
    expect(checkBadgeUnlock(badge, { ...baseProgress, quizzesCompleted: 3 })).toBe(true);
    expect(checkBadgeUnlock(badge, { ...baseProgress, quizzesCompleted: 18 })).toBe(true);
  });

  it("conditions are independent: one progress change only affects its badge", () => {
    const progress: BadgeProgress = {
      ...baseProgress,
      totalMatches: 3,
    };
    expect(checkBadgeUnlock(getBadgeDefinition("primer_match")!, progress)).toBe(true);
    expect(checkBadgeUnlock(getBadgeDefinition("conversacion_completada")!, progress)).toBe(false);
    expect(checkBadgeUnlock(getBadgeDefinition("semana_activa")!, progress)).toBe(false);
  });

  it("semana_activa cuenta dias, no consecucion: 7 activos repartidos equivalen a 7 seguidos", () => {
    const badge = getBadgeDefinition("semana_activa")!;
    expect(badge.condicion).toEqual({ tipo: "active_days", min: 7 });
    expect(checkBadgeUnlock(badge, { ...baseProgress, activeDays: 7 })).toBe(true);
    expect(checkBadgeUnlock(badge, { ...baseProgress, activeDays: 8 })).toBe(true);
  });
});

describe("badge copy", () => {
  const RACHA_WORDS = ["seguidos", "seguidas", "racha", "streak"];

  it("no badge promises a streak", () => {
    for (const badge of BADGE_CATALOG) {
      const text = `${badge.nombre} ${badge.descripcion}`.toLowerCase();
      for (const word of RACHA_WORDS) {
        expect(text, `${badge.id} promete racha con "${word}"`).not.toContain(word);
      }
    }
  });
});
