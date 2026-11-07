import { describe, expect, it } from "vitest";

import { SOUND, type SoundCategory, type SoundEventId } from "@/config";

import {
  defaultSoundPrefs,
  masterVolume,
  soundBlock,
  vibrationFor,
  type PlayContext,
  type SoundPrefs,
} from "./policy";

const NOON = 12 * 60;

function on(): SoundPrefs {
  return { ...defaultSoundPrefs(SOUND), sound: true, categories: { ...defaultSoundPrefs(SOUND).categories } };
}

function ctx(overrides: Partial<PlayContext> = {}): PlayContext {
  return {
    prefs: on(),
    hidden: false,
    minutes: NOON,
    nowMs: 10_000,
    lastFiredMs: {},
    unlocked: true,
    ...overrides,
  };
}

function check(id: SoundEventId, context: PlayContext) {
  const category: SoundCategory = SOUND.eventos[id].categoria;
  return soundBlock(id, category, SOUND.categorias[category].cooldownMs, context);
}

describe("defaultSoundPrefs", () => {
  it("starts everything off and takes the quiet window from config", () => {
    const prefs = defaultSoundPrefs(SOUND);
    expect(prefs.sound).toBe(false);
    expect(prefs.haptics).toBe(false);
    expect(prefs.toque).toBe(false);
    expect(prefs.volume).toBe(SOUND.master.porDefecto);
    expect(prefs.categories).toEqual({ conexion: true, logros: true, interfaz: true });
    expect(prefs.quiet).toEqual({
      enabled: SOUND.silencio.activadoPorDefecto,
      inicio: SOUND.silencio.inicio,
      fin: SOUND.silencio.fin,
    });
  });
});

describe("soundBlock", () => {
  it("lets a configured, visible, unlocked event through", () => {
    expect(check("match_nuevo", ctx())).toBeNull();
  });

  it("stays silent while the master switch is off", () => {
    expect(check("match_nuevo", ctx({ prefs: defaultSoundPrefs(SOUND) }))).toBe("disabled");
  });

  it("honours the category switch", () => {
    const prefs = on();
    expect(check("badge", ctx({ prefs: { ...prefs, categories: { ...prefs.categories, logros: false } } }))).toBe("category");
    expect(check("match_nuevo", ctx({ prefs: { ...prefs, categories: { ...prefs.categories, logros: false } } }))).toBeNull();
  });

  it("keeps the button tick opt-in even with sound on", () => {
    expect(check("toque", ctx())).toBe("toque");
    expect(check("toque", ctx({ prefs: { ...on(), toque: true } }))).toBeNull();
  });

  it("honours the quiet window, including the wrap past midnight", () => {
    const prefs = { ...on(), quiet: { enabled: true, inicio: "22:00", fin: "08:00" } };
    expect(check("mensaje_nuevo", ctx({ prefs, minutes: 23 * 60 }))).toBe("quiet");
    expect(check("mensaje_nuevo", ctx({ prefs, minutes: 3 * 60 }))).toBe("quiet");
    expect(check("mensaje_nuevo", ctx({ prefs, minutes: NOON }))).toBeNull();
    expect(check("mensaje_nuevo", ctx({ prefs: { ...prefs, quiet: { ...prefs.quiet, enabled: false } }, minutes: 23 * 60 }))).toBeNull();
  });

  it("never makes noise in a hidden tab", () => {
    expect(check("match_nuevo", ctx({ hidden: true }))).toBe("hidden");
  });

  it("never makes noise before a gesture unlocked the context", () => {
    expect(check("match_nuevo", ctx({ unlocked: false }))).toBe("locked");
  });

  it("reports preferences before environment, environment before rate", () => {
    const prefs = defaultSoundPrefs(SOUND);
    expect(check("match_nuevo", ctx({ prefs, hidden: true, unlocked: false, lastFiredMs: { conexion: 9_999 } }))).toBe("disabled");
    expect(check("match_nuevo", ctx({ hidden: true, unlocked: false, lastFiredMs: { conexion: 9_999 } }))).toBe("hidden");
    expect(check("match_nuevo", ctx({ unlocked: false, lastFiredMs: { conexion: 9_999 } }))).toBe("locked");
  });

  it("drops a second sound of the same category inside its cooldown only", () => {
    const cooldown = SOUND.categorias.conexion.cooldownMs;
    const lastFiredMs = { conexion: 10_000 };
    expect(check("mensaje_nuevo", ctx({ nowMs: 10_000 + cooldown - 1, lastFiredMs }))).toBe("cooldown");
    expect(check("mensaje_nuevo", ctx({ nowMs: 10_000 + cooldown, lastFiredMs }))).toBeNull();
    expect(check("badge", ctx({ nowMs: 10_000 + 1, lastFiredMs }))).toBeNull();
  });
});

describe("masterVolume", () => {
  it("clamps a corrupt preference into the configured range", () => {
    expect(masterVolume({ ...on(), volume: 0.5 }, SOUND)).toBe(0.5);
    expect(masterVolume({ ...on(), volume: 9 }, SOUND)).toBe(SOUND.master.maximo);
    expect(masterVolume({ ...on(), volume: -3 }, SOUND)).toBe(SOUND.master.minimo);
  });
});

describe("vibrationFor", () => {
  it("follows the haptics switch and only returns configured patterns", () => {
    expect(vibrationFor("answer", on(), SOUND)).toBeNull();
    const prefs = { ...on(), haptics: true };
    expect(vibrationFor("answer", prefs, SOUND)).toEqual(SOUND.eventos.answer.vibracion);
    expect(vibrationFor("tap", prefs, SOUND)).toBeNull();
    expect(vibrationFor("eclosion", prefs, SOUND)).toEqual(SOUND.eventos.eclosion.vibracion);
  });
});