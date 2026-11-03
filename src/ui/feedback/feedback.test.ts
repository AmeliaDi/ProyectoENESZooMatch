import { afterEach, describe, expect, it, vi } from "vitest";

import { EXPERIENCE } from "@/config";

import { runFeedback, type FeedbackDeps } from "./feedback";
import {
  DEFAULT_FEEDBACK_PREFS,
  getFeedbackPrefsServerSnapshot,
  getFeedbackPrefsSnapshot,
  parseFeedbackPrefs,
  readFeedbackPrefs,
  resetFeedbackPrefsMemory,
  writeFeedbackPrefs,
  type FeedbackPrefs,
  type PrefsStore,
} from "./feedback-prefs";
import { vibrate } from "./haptics";
import { createLimiter } from "./throttle";

const KEY = EXPERIENCE.feedback.storageKey;
const THROTTLE = EXPERIENCE.feedback.throttleMs;

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

afterEach(() => {
  resetFeedbackPrefsMemory();
  vi.unstubAllGlobals();
});

describe("feedback preferences", () => {
  it("are off by default, on the server and with an empty store", () => {
    expect(DEFAULT_FEEDBACK_PREFS).toEqual({ sound: false, haptics: false });
    expect(getFeedbackPrefsServerSnapshot()).toEqual({ sound: false, haptics: false });
    expect(readFeedbackPrefs(memoryStore())).toEqual({ sound: false, haptics: false });
    expect(readFeedbackPrefs(null)).toEqual({ sound: false, haptics: false });
    expect(getFeedbackPrefsSnapshot()).toEqual({ sound: false, haptics: false });
  });

  it("only an explicit true turns something on", () => {
    expect(parseFeedbackPrefs("{not json")).toEqual(DEFAULT_FEEDBACK_PREFS);
    expect(parseFeedbackPrefs("null")).toEqual(DEFAULT_FEEDBACK_PREFS);
    expect(parseFeedbackPrefs('{"sound":"yes","haptics":1}')).toEqual(DEFAULT_FEEDBACK_PREFS);
    expect(parseFeedbackPrefs('{"sound":true}')).toEqual({ sound: true, haptics: false });
  });

  it("round-trips and clears the key when both are off", () => {
    const store = memoryStore();
    expect(writeFeedbackPrefs({ sound: true, haptics: true }, store)).toBe(true);
    expect(readFeedbackPrefs(store)).toEqual({ sound: true, haptics: true });
    writeFeedbackPrefs({ sound: false, haptics: false }, store);
    expect(store.data.has(KEY)).toBe(false);
  });

  it("stores nothing but the two flags", () => {
    const store = memoryStore();
    writeFeedbackPrefs({ sound: true, haptics: false }, store);
    expect(JSON.parse(store.data.get(KEY) ?? "{}")).toEqual({ sound: true, haptics: false });
  });

  it("survives a broken localStorage", () => {
    expect(() => readFeedbackPrefs(brokenStore)).not.toThrow();
    expect(readFeedbackPrefs(brokenStore)).toEqual(DEFAULT_FEEDBACK_PREFS);
    expect(writeFeedbackPrefs({ sound: true, haptics: true }, brokenStore)).toBe(false);
  });

  it("keeps an in-session choice when storage is missing", () => {
    writeFeedbackPrefs({ sound: true, haptics: false }, null);
    expect(getFeedbackPrefsSnapshot()).toEqual({ sound: true, haptics: false });
    expect(getFeedbackPrefsSnapshot()).toBe(getFeedbackPrefsSnapshot());
  });
});

describe("limiter", () => {
  it("lets the first event through and drops repeats inside the window", () => {
    const limiter = createLimiter(THROTTLE);
    expect(limiter.tryFire(1000)).toBe(true);
    expect(limiter.tryFire(1000 + THROTTLE - 1)).toBe(false);
    expect(limiter.tryFire(1000 + THROTTLE)).toBe(true);
  });

  it("dropped events do not extend the window", () => {
    const limiter = createLimiter(100);
    expect(limiter.tryFire(0)).toBe(true);
    expect(limiter.tryFire(60)).toBe(false);
    expect(limiter.tryFire(100)).toBe(true);
  });
});

function deps(prefs: FeedbackPrefs, now: () => number) {
  const sound = vi.fn<FeedbackDeps["sound"]>();
  const buzz = vi.fn<FeedbackDeps["vibrate"]>();
  const d: FeedbackDeps = { prefs: () => prefs, limiter: createLimiter(THROTTLE), now, sound, vibrate: buzz, config: EXPERIENCE.feedback };
  return { ...d, sound, vibrate: buzz };
}

describe("runFeedback", () => {
  it("does nothing while both are off", () => {
    const d = deps({ sound: false, haptics: false }, () => 0);
    expect(runFeedback("answer", d)).toEqual({ sound: false, haptics: false });
    expect(d.sound).not.toHaveBeenCalled();
    expect(d.vibrate).not.toHaveBeenCalled();
  });

  it("fires one chip and one buzz per event, with the configured parameters", () => {
    let t = 0;
    const d = deps({ sound: true, haptics: true }, () => t);
    runFeedback("join", d);
    t += THROTTLE / 2;
    runFeedback("answer", d);
    expect(d.sound).toHaveBeenCalledTimes(1);
    expect(d.sound).toHaveBeenCalledWith(EXPERIENCE.feedback.sounds.join);
    expect(d.vibrate).toHaveBeenCalledWith(EXPERIENCE.feedback.vibration.join);
    t += THROTTLE;
    runFeedback("answer", d);
    expect(d.sound).toHaveBeenCalledTimes(2);
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

describe("feedback config", () => {
  it("keeps the chip quiet and short", () => {
    for (const tone of Object.values(EXPERIENCE.feedback.sounds)) {
      expect(tone.volume).toBeLessThanOrEqual(0.2);
      expect(tone.durationMs).toBeLessThanOrEqual(250);
    }
  });
});
