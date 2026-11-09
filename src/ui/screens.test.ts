/**
 * Guards for the fase-3 screens that run in Node (no DOM): copy follows the
 * tone guide, pure helpers behave, and no screen reintroduces the legacy
 * palette, emojis, blur or radii.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { EXPERIENCE } from "@/config";
import type { AdminUser } from "@/contracts/admin";

import { ADMIN_COPY, ADMIN_REASON_LABELS, AUDIT_LABELS, REPORT_STATUS_LABELS, TAB_LABELS, USER_ACTION_COPY, confirmMatches } from "./admin/admin-copy";
import { pageCount } from "./admin/pager";
import { availableActions } from "./admin/user-detail";

import { cellsFor } from "./admin/pixel-bars";
import { categoryIcon } from "./design/category-icons";
import { dawnStars, sparkleCells } from "./design/dawn";
import { ICON_NAMES } from "./design/icons";
import {
  CHAT_COPY,
  CONVERSATION_COPY,
  INTEREST_COPY,
  SAFETY_COPY,
  attemptsMessage,
  charsCounter,
  charsLeft,
  errorCopy,
  formatCountdown,
  pausedMessage,
  roundsStage,
  stageLabel,
} from "./chat/chat-copy";
import { REPORT_REASON_LABELS } from "./chat/conversation-copy";
import { CONSTELLATION_COPY } from "./constellation/types";
import { MATRICULA_COPY } from "./entry/matricula-entry";
import { SOUND_INVITE_COPY } from "./feedback/sound-invite";
import { SOUND_COPY } from "./feedback/sound-settings";
import { LOST_COPY } from "./shared/lost-view";
import { ONBOARDING_PLATES } from "./entry/onboarding";
import { revealOrder } from "./quiz/reveal-order";
import { REFINE_COPY } from "./refine/refine-invite";
import { EXPLANATION_COPY_UI } from "./result/explanation-blocks";
import { FEW_PEOPLE_COPY, RESULT_FINE_COPY } from "./result/result-view";
import { EVIDENCE_SUMMARY } from "@/config/evidence-summary";
import { litStars } from "./result/why-bars";
import { CHAT_EVENT_LABELS } from "./settings/chat-security-section";
import { STATUS_COPY, STATUS_OPTION_COPY } from "@/domain/status/status-types";
import { FORBIDDEN_COPY, OUTCOME_CLAIMS } from "@/testing/copy-guard";
import { BADGE_SECTION_COPY } from "@/domain/badges/badge-catalog";

const EMOJI = /\p{Extended_Pictographic}/u;

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files(path, out);
    else if (/\.(tsx|css)$/.test(name)) out.push(path);
  }
  return out;
}

const SCREEN_FILES = [
  ...files(resolve("src/ui")).filter((f) => !/[\\/]dev[\\/]/.test(f)),
  resolve("src/app/globals.css"),
  resolve("src/app/screens.css"),
  resolve("src/app/card.css"),
  resolve("src/app/refine.css"),
  resolve("src/app/chat.css"),
  resolve("src/app/mobile.css"),
];

describe("copy", () => {
  const copy = [
    ...Object.values(MATRICULA_COPY),
    ...ONBOARDING_PLATES.flatMap((p) => [p.title, p.body]),
    FEW_PEOPLE_COPY,
    RESULT_FINE_COPY,
    ...Object.values(REFINE_COPY),
    ...Object.values(EXPLANATION_COPY_UI),
    EVIDENCE_SUMMARY.intro,
    EVIDENCE_SUMMARY.closing,
    ...EVIDENCE_SUMMARY.how,
    ...EVIDENCE_SUMMARY.unknowns,
    ...EVIDENCE_SUMMARY.layers.map((l) => l.text),
    ...Object.values(CONSTELLATION_COPY),
    ...Object.values(CHAT_COPY),
    ...Object.values(CONVERSATION_COPY),
    ...Object.values(INTEREST_COPY),
    ...Object.values(SAFETY_COPY),
    ...Object.values(REPORT_REASON_LABELS),
    ...["chat.cooldown", "chat.too_many_signals", "chat.link_blocked", "chat.offensive", "chat.slow_down", "chat.repeated"].map((c) => errorCopy(c) ?? ""),
    stageLabel("rounds", 2),
    charsLeft(1),
    charsLeft(-4),
    ...Object.values(CHAT_EVENT_LABELS),
    ...Object.values(SOUND_COPY),
    ...Object.values(SOUND_INVITE_COPY),
    ...Object.values(LOST_COPY),
    attemptsMessage(1),
    attemptsMessage(4),
    pausedMessage(300),
    ...Object.values(ADMIN_COPY),
    ...Object.values(TAB_LABELS),
    ...Object.values(AUDIT_LABELS),
    ...Object.values(REPORT_STATUS_LABELS),
    ...Object.values(ADMIN_REASON_LABELS),
    ...Object.values(USER_ACTION_COPY).flatMap((a) => [a.label, a.body]),
    ...Object.values(STATUS_COPY),
    ...Object.values(STATUS_OPTION_COPY).flatMap((o) => [o.label, o.hint]),
    ...Object.values(BADGE_SECTION_COPY),
  ];

  it("has no forbidden words or emojis", () => {
    for (const text of copy) {
      expect(text, text).not.toMatch(FORBIDDEN_COPY);
      expect(text, text).not.toMatch(OUTCOME_CLAIMS);
      expect(text, text).not.toMatch(EMOJI);
    }
  });

  it("keeps onboarding to three plates with titles of at most five words", () => {
    expect(ONBOARDING_PLATES).toHaveLength(3);
    for (const plate of ONBOARDING_PLATES) expect(plate.title.split(/\s+/).length).toBeLessThanOrEqual(5);
  });
});

describe("screen sources", () => {
  it("contain no legacy palette, emojis, blur or radii", () => {
    const legacy = /\b(text|bg|border|ring)-(ink|paper|clay|moss|leaf)\b|font-display|backdrop-blur|rounded-|blur\(|radial-gradient|\.grain\b/;
    for (const file of SCREEN_FILES) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(legacy);
      expect(source, file).not.toMatch(EMOJI);
    }
  });
});

describe("typography guards", () => {
  const globals = readFileSync(resolve("src/app/globals.css"), "utf8");

  it("disables ligatures globally (fi, fl, ff, ffi, ffl must not fuse)", () => {
    expect(globals).toMatch(/font-variant-ligatures:\s*none/);
    expect(globals).toMatch(/font-feature-settings:\s*"liga"\s*0,\s*"clig"\s*0,\s*"calt"\s*0/);
  });

  it("does not use optimizeLegibility (enables ligatures in some browsers)", () => {
    expect(globals).not.toMatch(/text-rendering:\s*optimizeLegibility/);
  });

  it("no screen CSS re-enables ligatures", () => {
    const reenable = /font-variant-ligatures:\s*(normal|common-ligatures|discretionary-ligatures)|font-feature-settings:[^;]*"liga"\s*1/;
    for (const file of SCREEN_FILES) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(reenable);
    }
  });
});

describe("chat lock copy", () => {
  it("is honest that the PIN is a lock, not encryption", () => {
    expect(CHAT_COPY.intro).toContain("No cifra los mensajes");
    expect(CHAT_COPY.weak).toBe("Elige uno que solo tú recuerdes.");
    expect(CHAT_COPY.empty).not.toMatch(/pronto|seguro que|vas a/i);
  });

  it("counts down calmly and pluralizes", () => {
    expect(formatCountdown(299)).toBe("4:59");
    expect(formatCountdown(60)).toBe("1:00");
    expect(formatCountdown(3600)).toBe("1 h 0 min");
    expect(pausedMessage(299)).toBe("Tómate un respiro: puedes intentar de nuevo en 4:59.");
    expect(attemptsMessage(1)).toBe("Ese PIN no es. Te queda 1 intento antes de una pausa.");
    expect(attemptsMessage(3)).toBe("Ese PIN no es. Te quedan 3 intentos antes de una pausa.");
  });

  it("names stages in words and never pressures", () => {
    expect(roundsStage(1, 3)).toBe("Pregunta 1 de 3");
    expect(roundsStage(2, 3)).toBe("Pregunta 2 de 3");
    expect(roundsStage(3, 3)).toBe("Pregunta 3 de 3");
    expect(stageLabel("rounds", 0)).toBe("Rondas de preguntas");
    expect(stageLabel("rounds", 2)).toBe("Rondas de preguntas · 2 rondas");
    expect(stageLabel("free", 3)).toBe("Chat libre");
    expect(stageLabel("paused", 3)).toBe("En pausa");
    expect(charsLeft(1)).toBe("1 carácter disponible");
    expect(charsCounter(12, 300)).toEqual({ visual: "12/300", spoken: "12 de 300 caracteres" });
    expect(SAFETY_COPY.closeBody).toBe("Puedes cerrarla sin explicar nada. Desaparecerá para las dos personas.");
    const calm = /prisa|rápido|ahora mismo|no te lo pierdas|solo hoy|urgente|visto|no respondió|te ignor/i;
    for (const text of [...Object.values(CONVERSATION_COPY), ...Object.values(INTEREST_COPY), ...Object.values(SAFETY_COPY)]) expect(text).not.toMatch(calm);
  });

  it("keeps the inclusive x out of text read by screen readers", () => {
    for (const text of [...Object.values(REPORT_REASON_LABELS), ...Object.values(SAFETY_COPY)]) expect(text).not.toMatch(/\b\w+x\b(?<!\bfax\b)/i);
  });

  it("keeps a single numeric input that no password manager claims", () => {
    const source = readFileSync(resolve("src/ui/chat/pin-input.tsx"), "utf8");
    expect(source.match(/<input\s/g)).toHaveLength(1);
    for (const attr of ['inputMode="numeric"', 'pattern="[0-9]*"', 'autoComplete="off"', 'name="chat-lock-code"', 'aria-hidden="true"']) {
      expect(source).toContain(attr);
    }
    expect(source).not.toMatch(/type="password"|name="[^"]*pass/);
  });
});

describe("pure helpers", () => {
  it("maps every domain category to a real icon and unknown keys to a fallback", () => {
    for (const key of ["personalidad", "afinidad_cultural", "intimidad_afecto", "valores_relacionales", "identidad"]) {
      expect(ICON_NAMES).toContain(categoryIcon(key));
    }
    expect(categoryIcon("valores_empatia")).toBe("valores_relacionales");
    expect(ICON_NAMES).toContain(categoryIcon("???"));
  });

  it("lights stars proportionally and clamps", () => {
    expect(litStars(0)).toBe(0);
    expect(litStars(55)).toBe(6);
    expect(litStars(140)).toBe(10);
  });

  it("scales admin bars and never hides a non-zero value", () => {
    expect(cellsFor(0, 10)).toBe(0);
    expect(cellsFor(1, 1000)).toBe(1);
    expect(cellsFor(10, 10)).toBe(24);
  });

  it("dawn: deterministic, in-bounds, your star is last and biggest", () => {
    const spec = { width: EXPERIENCE.dawn.gridWidth, height: EXPERIENCE.dawn.gridHeight, count: EXPERIENCE.dawn.stars, seed: EXPERIENCE.dawn.seed };
    const stars = dawnStars(spec);
    expect(dawnStars(spec)).toEqual(stars);
    expect(stars).toHaveLength(spec.count);
    expect(stars.at(-1)).toMatchObject({ mine: true, size: 3, order: spec.count - 1 });
    for (const s of stars) {
      expect(s.x + s.size).toBeLessThanOrEqual(spec.width);
      expect(s.y + s.size).toBeLessThanOrEqual(spec.height);
    }
    expect(sparkleCells(2)).toHaveLength(8);
  });

  it("reveal order is a deterministic permutation that starts near the centre", () => {
    const order = revealOrder(16, EXPERIENCE.reveal.seed);
    expect(revealOrder(16, EXPERIENCE.reveal.seed)).toEqual(order);
    expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: 256 }, (_, i) => i));
    const first = order[0] ?? 0;
    const [x, y] = [first % 16, Math.floor(first / 16)];
    expect(Math.abs(x - 7.5) + Math.abs(y - 7.5)).toBeLessThan(6);
  });
});

describe("admin console helpers (ADR-036)", () => {
  const user: AdminUser = {
    id: "aaaaaaaa-0000-4000-8000-000000000001",
    // A fresh account: the identity is still an egg, so it carries no name.
    identity: {
      estadoIdentidad: "huevo",
      aliasCompleto: null,
      aliasAnimal: null,
      aliasColor: null,
      aliasSufijo: null,
      animalId: null,
      colorId: null,
      colorHex: null,
      mbtiCode: null,
      enneagramCode: null,
      enneagramName: null,
      mark: null,
      revelacionVista: false,
      huevitoSeed: null,
    },
    createdAt: "2026-11-01T00:00:00.000Z", quizCompletedAt: null, eclosionadoEn: null, eliminadoEn: null,
    paused: false, adult: false, modules: 0,
    isAdmin: false, hasChatPin: false, romanceMatches: 0, amistadMatches: 0, conversations: 0, reportsReceived: 0,
  };

  it("requires the exact confirm word for destructive actions only", () => {
    expect(confirmMatches("delete", "borrar")).toBe(false);
    expect(confirmMatches("delete", " BORRAR ")).toBe(true);
    expect(confirmMatches("reset_quiz", "REINICIAR")).toBe(true);
    expect(confirmMatches("pause", "")).toBe(true);
  });

  it("offers only the actions that make sense and never deletes an admin", () => {
    expect(availableActions(user)).toEqual(["pause", "delete"]);
    expect(availableActions({ ...user, quizCompletedAt: "x", paused: true, hasChatPin: true })).toEqual(["reset_quiz", "resume", "reset_chat_pin", "delete"]);
    expect(availableActions({ ...user, isAdmin: true })).not.toContain("delete");
  });

  it("counts at least one page", () => {
    expect(pageCount(0, 25)).toBe(1);
    expect(pageCount(51, 25)).toBe(3);
  });
});
