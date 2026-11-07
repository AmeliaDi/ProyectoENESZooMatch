import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SOUND, SOUND_EVENTS, soundDurationMs, type SoundCategory } from "@/config";
import { defaultSoundPrefs, type SoundPrefs } from "@/domain/audio/policy";

import { installAudioUnlock, isAudioUnlocked, playRecipe, resetAudioEngine, unlockAudio } from "./audio-engine";
import { runSound, type SoundDeps } from "./feedback";
import { vibrate } from "./haptics";
import {
  DEFAULT_SOUND_PREFS,
  getSoundPrefsServerSnapshot,
  getSoundPrefsSnapshot,
  parseSoundPrefs,
  readSoundPrefs,
  resetSoundPrefsMemory,
  writeSoundPrefs,
  type PrefsStore,
} from "./sound-prefs";

const KEY = SOUND.storageKey;
const NOON = 12 * 60;

function memoryStore(initial: Record<string, string> = {}): PrefsStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const brokenStore: PrefsStore = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
  removeItem: () => {
    throw new Error("SecurityError");
  },
};

function onPrefs(extra: Partial<SoundPrefs> = {}): SoundPrefs {
  const base = defaultSoundPrefs(SOUND);
  return { ...base, sound: true, categories: { ...base.categories }, quiet: { ...base.quiet }, ...extra };
}

afterEach(() => {
  resetSoundPrefsMemory();
  resetAudioEngine();
  vi.unstubAllGlobals();
});

describe("sound preferences", () => {
  it("are off by default, on the server and with an empty store", () => {
    expect(DEFAULT_SOUND_PREFS.sound).toBe(false);
    expect(DEFAULT_SOUND_PREFS.haptics).toBe(false);
    expect(DEFAULT_SOUND_PREFS.toque).toBe(false);
    expect(getSoundPrefsServerSnapshot()).toBe(DEFAULT_SOUND_PREFS);
    expect(readSoundPrefs(memoryStore())).toEqual(DEFAULT_SOUND_PREFS);
    expect(readSoundPrefs(null)).toEqual(DEFAULT_SOUND_PREFS);
    expect(getSoundPrefsSnapshot()).toEqual(DEFAULT_SOUND_PREFS);
  });

  it("only an explicit true turns a switch on", () => {
    for (const raw of ["{not json", "null", "3", '"yes"', '{"sound":"yes","haptics":1,"toque":"on"}']) {
      expect(parseSoundPrefs(raw).sound, raw).toBe(false);
    }
    expect(parseSoundPrefs('{"sound":true}')).toMatchObject({ sound: true, haptics: false, toque: false });
  });

  it("keeps a category on unless it was explicitly turned off", () => {
    expect(parseSoundPrefs('{"sound":true}').categories).toEqual({ conexion: true, logros: true, interfaz: true });
    expect(parseSoundPrefs('{"categories":{"logros":false,"bogus":false}}').categories).toEqual({
      conexion: true,
      logros: false,
      interfaz: true,
    });
  });

  it("clamps a corrupt volume and rejects malformed quiet hours", () => {
    expect(parseSoundPrefs('{"volume":99}').volume).toBe(SOUND.master.maximo);
    expect(parseSoundPrefs('{"volume":-1}').volume).toBe(SOUND.master.minimo);
    expect(parseSoundPrefs('{"volume":"loud"}').volume).toBe(SOUND.master.porDefecto);
    expect(parseSoundPrefs('{"quiet":{"enabled":true,"inicio":"25:00","fin":"nope"}}').quiet).toEqual({
      enabled: true,
      inicio: SOUND.silencio.inicio,
      fin: SOUND.silencio.fin,
    });
  });

  it("round-trips and clears the key when everything is back to default", () => {
    const store = memoryStore();
    const prefs = onPrefs({ haptics: true });
    expect(writeSoundPrefs(prefs, store)).toBe(true);
    expect(readSoundPrefs(store)).toEqual(prefs);
    writeSoundPrefs(DEFAULT_SOUND_PREFS, store);
    expect(store.data.has(KEY)).toBe(false);
  });

  it("stores only device preferences, never anything about the person", () => {
    const store = memoryStore();
    writeSoundPrefs(onPrefs(), store);
    expect(Object.keys(JSON.parse(store.data.get(KEY) ?? "{}")).sort()).toEqual([
      "categories", "haptics", "quiet", "sound", "toque", "volume",
    ]);
  });

  it("survives a broken localStorage", () => {
    expect(() => readSoundPrefs(brokenStore)).not.toThrow();
    expect(readSoundPrefs(brokenStore)).toEqual(DEFAULT_SOUND_PREFS);
    expect(writeSoundPrefs(onPrefs(), brokenStore)).toBe(false);
  });

  it("keeps an in-session choice when storage is missing, with a stable snapshot", () => {
    const prefs = onPrefs();
    writeSoundPrefs(prefs, null);
    expect(getSoundPrefsSnapshot()).toEqual(prefs);
    expect(getSoundPrefsSnapshot()).toBe(getSoundPrefsSnapshot());
  });
});

function deps(prefs: SoundPrefs, nowMs = 10_000) {
  const play = vi.fn<SoundDeps["play"]>();
  const buzz = vi.fn<SoundDeps["vibrate"]>();
  const lastFired = new Map<SoundCategory, number>();
  const d: SoundDeps = {
    prefs: () => prefs,
    now: () => nowMs,
    minutes: () => NOON,
    hidden: () => false,
    unlocked: () => true,
    play,
    vibrate: buzz,
    config: SOUND,
    lastFired,
  };
  return { ...d, play, vibrate: buzz, lastFired };
}

describe("runSound", () => {
  it("does nothing while the master switch is off", () => {
    const d = deps(defaultSoundPrefs(SOUND));
    expect(runSound("match_nuevo", d)).toEqual({ sound: false, haptics: false, block: "disabled" });
    expect(d.play).not.toHaveBeenCalled();
    expect(d.vibrate).not.toHaveBeenCalled();
    expect(d.lastFired.size).toBe(0);
  });

  it("plays the recipe at the master volume and records the category time", () => {
    const d = deps(onPrefs({ volume: 0.4 }), 5_000);
    expect(runSound("badge", d)).toEqual({ sound: true, haptics: false, block: null });
    expect(d.play).toHaveBeenCalledWith("badge", 0.4);
    expect(d.lastFired.get("logros")).toBe(5_000);
    expect(d.vibrate).not.toHaveBeenCalled();
  });

  it("vibrates only with haptics on and a configured pattern", () => {
    const d = deps(onPrefs({ haptics: true }));
    expect(runSound("join", d)).toEqual({ sound: true, haptics: true, block: null });
    expect(d.vibrate).toHaveBeenCalledWith(SOUND.eventos.join.vibracion);

    const noPattern = deps(onPrefs({ haptics: true }));
    expect(runSound("tap", noPattern)).toEqual({ sound: true, haptics: false, block: null });
    expect(noPattern.vibrate).not.toHaveBeenCalled();
  });

  it("stays silent in a hidden tab and before the first gesture", () => {
    const hidden = deps(onPrefs());
    expect(runSound("mensaje_nuevo", { ...hidden, hidden: () => true }).block).toBe("hidden");
    expect(hidden.play).not.toHaveBeenCalled();

    const locked = deps(onPrefs());
    expect(runSound("mensaje_nuevo", { ...locked, unlocked: () => false }).block).toBe("locked");
    expect(locked.play).not.toHaveBeenCalled();
  });

  it("never stacks two sounds of one category inside the cooldown", () => {
    const d = deps(onPrefs());
    const cooldown = SOUND.categorias.conexion.cooldownMs;
    expect(runSound("mensaje_nuevo", d).sound).toBe(true);
    expect(runSound("match_nuevo", { ...d, now: () => 10_000 + cooldown - 1 }).block).toBe("cooldown");
    expect(runSound("match_nuevo", { ...d, now: () => 10_000 + cooldown }).sound).toBe(true);
    expect(d.play).toHaveBeenCalledTimes(2);
  });

  it("keeps the categories independent", () => {
    const d = deps(onPrefs());
    expect(runSound("mensaje_nuevo", d).sound).toBe(true);
    expect(runSound("badge", d).sound).toBe(true);
    expect(runSound("answer", d).sound).toBe(true);
    expect(d.play).toHaveBeenCalledTimes(3);
  });

  it("keeps the button tick opt-in", () => {
    expect(runSound("toque", deps(onPrefs())).block).toBe("toque");
    expect(runSound("toque", deps(onPrefs({ toque: true }))).sound).toBe(true);
  });

  it("clamps a volume that arrived outside the configured range", () => {
    const d = deps(onPrefs({ volume: 42 }));
    runSound("answer", d);
    expect(d.play).toHaveBeenCalledWith("answer", SOUND.master.maximo);
  });
});

describe("haptics", () => {
  it("never vibrates with reduced motion or without the API", () => {
    const spy = vi.fn(() => true);
    vi.stubGlobal("navigator", { vibrate: spy });
    vi.stubGlobal("window", { matchMedia: () => ({ matches: true }) });
    expect(vibrate([10])).toBe(false);
    expect(spy).not.toHaveBeenCalled();

    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
    expect(vibrate([10])).toBe(true);
    expect(spy).toHaveBeenCalledWith([10]);

    vi.stubGlobal("navigator", {});
    expect(vibrate([10])).toBe(false);
  });
});

// ─── Web Audio engine, against a fake context ───────────────────────────────

function param(value = 0) {
  return {
    value,
    setValueAtTime: () => undefined,
    linearRampToValueAtTime: () => undefined,
    exponentialRampToValueAtTime: () => undefined,
    setTargetAtTime: () => undefined,
  };
}

interface FakeSource {
  stopped: boolean;
  startAt: number | null;
  stopAt: number | null;
  start: (t: number) => void;
  stop: (t?: number) => void;
  connect: (next: unknown) => unknown;
  disconnect: () => void;
  addEventListener: (type: string, cb: () => void) => void;
}

function fakeSource(extra: Record<string, unknown> = {}): FakeSource {
  const node: FakeSource = {
    stopped: false,
    startAt: null,
    stopAt: null,
    connect: (next) => next,
    disconnect: () => undefined,
    start: (t) => {
      node.startAt = t;
    },
    stop: (t) => {
      node.stopAt = t ?? null;
      // stop() with no time is immediate; stop(t) only schedules the end.
      if (t === undefined) node.stopped = true;
    },
    addEventListener: () => undefined,
    ...extra,
  };
  return node;
}

const created: FakeAudioContext[] = [];

class FakeAudioContext {
  state: "suspended" | "running" = "suspended";
  currentTime = 0;
  sampleRate = 8_000;
  destination = { connect: (n: unknown) => n, disconnect: () => undefined };
  resumeCalls = 0;
  readonly sources: FakeSource[] = [];

  constructor() {
    created.push(this);
  }

  resume(): Promise<void> {
    this.resumeCalls += 1;
    this.state = "running";
    return Promise.resolve();
  }

  createGain() {
    return { gain: param(1), connect: (next: unknown) => next, disconnect: () => undefined };
  }

  createOscillator(): FakeSource {
    const node = fakeSource({ type: "square", frequency: param(440) });
    this.sources.push(node);
    return node;
  }

  createBufferSource(): FakeSource {
    const node = fakeSource({ buffer: null, loop: false });
    this.sources.push(node);
    return node;
  }

  createBiquadFilter() {
    return { type: "bandpass", frequency: param(440), Q: param(1), connect: (n: unknown) => n, disconnect: () => undefined };
  }

  createBuffer(_channels: number, frames: number) {
    const data = new Float32Array(frames);
    return { getChannelData: () => data };
  }
}

function fakeWindow() {
  const listeners = new Map<string, Set<() => void>>();
  return {
    AudioContext: FakeAudioContext,
    listeners,
    addEventListener: (type: string, cb: () => void) => {
      let set = listeners.get(type);
      if (!set) {
        set = new Set();
        listeners.set(type, set);
      }
      set.add(cb);
    },
    removeEventListener: (type: string, cb: () => void) => void listeners.get(type)?.delete(cb),
    dispatch: (type: string) => {
      for (const cb of [...(listeners.get(type) ?? [])]) cb();
    },
  };
}

function engineContext(): FakeAudioContext {
  const ctx = created.at(-1);
  if (!ctx) throw new Error("the engine never created an AudioContext");
  return ctx;
}

describe("audio engine", () => {
  let win: ReturnType<typeof fakeWindow>;

  beforeEach(() => {
    created.length = 0;
    win = fakeWindow();
    vi.stubGlobal("window", win);
  });

  it("creates no context while sound is off, and detaches on cleanup", () => {
    expect(isAudioUnlocked()).toBe(false);
    const detach = installAudioUnlock(() => false);
    win.dispatch("pointerdown");
    win.dispatch("keydown");
    expect(isAudioUnlocked()).toBe(false);
    expect(created).toHaveLength(0);
    expect(win.listeners.get("pointerdown")?.size).toBe(1);
    detach();
    expect(win.listeners.get("pointerdown")?.size).toBe(0);
    expect(win.listeners.get("keydown")?.size).toBe(0);
  });

  it("unlocks on the first gesture and detaches its listeners", () => {
    installAudioUnlock(() => true);
    win.dispatch("pointerdown");
    expect(isAudioUnlocked()).toBe(true);
    expect(created).toHaveLength(1);
    expect(engineContext().resumeCalls).toBe(1);
    expect(win.listeners.get("pointerdown")?.size).toBe(0);
    expect(win.listeners.get("keydown")?.size).toBe(0);
  });

  it("reuses one context for every recipe", () => {
    unlockAudio();
    playRecipe("answer", 0.5);
    playRecipe("badge", 0.5);
    expect(created).toHaveLength(1);
  });

  it("stops the previous recipe of a category instead of stacking it", () => {
    unlockAudio();
    const ctx = engineContext();
    playRecipe("match_nuevo", 0.5);
    const first = [...ctx.sources];
    expect(first).toHaveLength(SOUND.eventos.match_nuevo.voces.length);
    expect(first.every((s) => !s.stopped)).toBe(true);

    playRecipe("mensaje_nuevo", 0.5);
    expect(first.every((s) => s.stopped)).toBe(true);
    expect(ctx.sources.slice(first.length)).toHaveLength(SOUND.eventos.mensaje_nuevo.voces.length);
  });

  it("schedules every voice and ends exactly at the recipe duration", () => {
    unlockAudio();
    const ctx = engineContext();
    for (const id of SOUND_EVENTS) {
      const before = ctx.sources.length;
      playRecipe(id, 0.5);
      const voices = ctx.sources.slice(before);
      expect(voices, id).toHaveLength(SOUND.eventos[id].voces.length);
      const start = Math.min(...voices.map((s) => s.startAt ?? 0));
      const end = Math.max(...voices.map((s) => s.stopAt ?? 0));
      expect(end - start, id).toBeCloseTo(soundDurationMs(id) / 1000, 6);
    }
  });

  it("is a no-op without Web Audio and never throws", () => {
    vi.stubGlobal("window", {});
    expect(unlockAudio()).toBe(false);
    expect(() => playRecipe("answer", 0.5)).not.toThrow();
  });
});

describe("catalogue coverage", () => {
  it("has a recipe for every declared event, within its duration limit", () => {
    expect(Object.keys(SOUND.eventos).sort()).toEqual([...SOUND_EVENTS].sort());
    for (const id of SOUND_EVENTS) {
      expect(SOUND.eventos[id].voces.length, id).toBeGreaterThan(0);
      expect(soundDurationMs(id), id).toBeLessThanOrEqual(id === "eclosion" ? SOUND.limites.eclosionMs : SOUND.limites.generalMs);
    }
  });
});