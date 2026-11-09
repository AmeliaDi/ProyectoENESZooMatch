import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { EXPERIENCE } from "@/config";
import { experienceSchema } from "@/config/experience";
import { FORBIDDEN_COPY, OUTCOME_CLAIMS } from "@/testing/copy-guard";

import { COACH_COPY, COACH_DESKTOP_TIPS, COACH_LINKS, COACH_STEP_COPY, coachAnnouncement } from "./coach-copy";
import {
  COACH_INITIAL,
  COACH_INTERACTIVE_CLASSES,
  COACH_PASSTHROUGH_CLASSES,
  COACH_STEPS,
  SEEN_VALUE,
  centreBox,
  coachReducer,
  coachVariant,
  createCoachStore,
  currentStep,
  holeClipPath,
  padBox,
  persistsOnClose,
  type CoachAction,
  type CoachState,
  type KeyValueStorage,
} from "./coachmarks";

const KEY = EXPERIENCE.coachmarks.storageKey;

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

const throwing: KeyValueStorage = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
};

function run(actions: CoachAction[], from: CoachState = COACH_INITIAL): CoachState {
  return actions.reduce(coachReducer, from);
}

describe("coachmarks: steps", () => {
  it("has four mobile steps aimed at self, canvas and tracks", () => {
    expect(COACH_STEPS.map((s) => s.id)).toEqual(["self", "drag", "tap", "tracks"]);
    expect(COACH_STEPS.map((s) => s.target)).toEqual(["self", "canvas", "canvas", "tracks"]);
    expect(COACH_STEPS.find((s) => s.id === "drag")?.art).toBe("drag");
  });

  it("goes forward and back, clamped, and finishes after the last step", () => {
    const opened = run([{ type: "open", variant: "mobile" }]);
    expect(currentStep(opened)?.id).toBe("self");
    expect(run([{ type: "back" }], opened).step).toBe(0);
    const third = run([{ type: "next" }, { type: "next" }, { type: "back" }, { type: "next" }], opened);
    expect(currentStep(third)?.id).toBe("tap");
    const done = run([{ type: "next" }, { type: "next" }], third);
    expect(done).toMatchObject({ open: false, closedBy: "finish" });
  });

  it("can be skipped at any step and reopened from the start", () => {
    const skipped = run([{ type: "open", variant: "mobile" }, { type: "next" }, { type: "close", reason: "skip" }]);
    expect(skipped).toMatchObject({ open: false, closedBy: "skip" });
    expect(run([{ type: "next" }, { type: "back" }], skipped)).toEqual(skipped);
    const reopened = run([{ type: "open", variant: "mobile" }], skipped);
    expect(reopened).toMatchObject({ open: true, step: 0, closedBy: null });
  });

  it("desktop is a single tooltip with no stepped highlight", () => {
    const tip = run([{ type: "open", variant: "desktop" }]);
    expect(currentStep(tip)).toBeNull();
    expect(run([{ type: "next" }], tip)).toMatchObject({ open: false, closedBy: "finish" });
  });

  it("remembers finish and 'no volver a mostrar'; a mobile skip is only for now", () => {
    expect(persistsOnClose("finish", "mobile")).toBe(true);
    expect(persistsOnClose("never", "mobile")).toBe(true);
    expect(persistsOnClose("skip", "mobile")).toBe(false);
    expect(persistsOnClose("skip", "desktop")).toBe(true);
  });
});

describe("coachmarks: variant", () => {
  const max = EXPERIENCE.coachmarks.mobileMaxWidthPx;
  it("uses the mobile card for coarse pointers or narrow screens, the tooltip otherwise", () => {
    expect(coachVariant({ coarse: true, viewportWidth: 1400 }, max)).toBe("mobile");
    expect(coachVariant({ coarse: false, viewportWidth: max }, max)).toBe("mobile");
    expect(coachVariant({ coarse: false, viewportWidth: max + 1 }, max)).toBe("desktop");
  });
});

describe("coachmarks: seen store", () => {
  it("auto-opens only on the first visit", () => {
    const storage = memoryStorage();
    const first = createCoachStore(() => storage, KEY);
    expect(first.claimAutoOpen()).toBe(true);
    expect(first.claimAutoOpen()).toBe(false);
    expect(first.markSeen()).toBe(true);
    expect(storage.data[KEY]).toBe(SEEN_VALUE);
    const nextVisit = createCoachStore(() => storage, KEY);
    expect(nextVisit.hasSeen()).toBe(true);
    expect(nextVisit.claimAutoOpen()).toBe(false);
  });

  it("does not come back for someone who already completed it", () => {
    const store = createCoachStore(() => memoryStorage({ [KEY]: SEEN_VALUE }), KEY);
    expect(store.wouldAutoOpen()).toBe(false);
    expect(store.claimAutoOpen()).toBe(false);
  });

  it("treats a broken storage as not seen, never throws, and keeps it closed this session", () => {
    const store = createCoachStore(() => throwing, KEY);
    expect(() => store.hasSeen()).not.toThrow();
    expect(store.hasSeen()).toBe(false);
    expect(store.claimAutoOpen()).toBe(true);
    expect(store.markSeen()).toBe(false);
    expect(store.hasSeen()).toBe(true);
    expect(store.claimAutoOpen()).toBe(false);
  });

  it("survives a provider that throws or is missing", () => {
    const blocked = createCoachStore(() => {
      throw new Error("SecurityError");
    }, KEY);
    expect(blocked.claimAutoOpen()).toBe(true);
    expect(blocked.markSeen()).toBe(false);
    expect(createCoachStore(() => null, KEY).hasSeen()).toBe(false);
  });

  it("uses a versioned key from config", () => {
    expect(KEY).toMatch(/:v\d+$/);
    const raw = { ...structuredClone(EXPERIENCE), coachmarks: { ...EXPERIENCE.coachmarks, storageKey: "zoomatch:coach" } };
    expect(experienceSchema.safeParse(raw).success).toBe(false);
    const offGrid = { ...structuredClone(EXPERIENCE), coachmarks: { ...EXPERIENCE.coachmarks, highlightPadPx: 7 } };
    expect(experienceSchema.safeParse(offGrid).success).toBe(false);
  });
});

describe("coachmarks: geometry", () => {
  const viewport = { width: 400, height: 800 };
  it("pads, snaps to the 2 px grid and clamps to the viewport", () => {
    const box = padBox({ x: 3.4, y: 101.2, width: 50.3, height: 20 }, 8, viewport);
    for (const n of [box.x, box.y, box.width, box.height]) expect(n % 2).toBe(0);
    expect(box.x).toBe(0);
    expect(box.y).toBeLessThanOrEqual(93.2);
    expect(box.x + box.width).toBeGreaterThanOrEqual(3.4 + 50.3 + 8);
    expect(padBox({ x: 390, y: 790, width: 40, height: 40 }, 8, viewport)).toMatchObject({ x: 382, y: 782, width: 18, height: 18 });
  });

  it("centres the fallback on the canvas and cuts a hole for the dim", () => {
    expect(centreBox({ x: 0, y: 100, width: 300, height: 200 }, 64)).toEqual({ x: 118, y: 168, width: 64, height: 64 });
    expect(holeClipPath({ x: 10, y: 20, width: 30, height: 40 })).toContain("evenodd");
    expect(holeClipPath({ x: 10, y: 20, width: 30, height: 40 })).toContain("40px 60px");
  });
});

describe("coachmarks: copy", () => {
  const EMOJI = /\p{Extended_Pictographic}/u;
  const all = [
    ...Object.values(COACH_COPY),
    ...COACH_DESKTOP_TIPS,
    ...Object.values(COACH_STEP_COPY).flatMap((s) => [s.title, s.body]),
  ];

  it("has no forbidden words or emojis, and short titles", () => {
    for (const text of all) {
      expect(text, text).not.toMatch(FORBIDDEN_COPY);
      expect(text, text).not.toMatch(OUTCOME_CLAIMS);
      expect(text, text).not.toMatch(EMOJI);
    }
    for (const step of Object.values(COACH_STEP_COPY)) expect(step.title.split(/\s+/).length).toBeLessThanOrEqual(5);
  });

  it("links to how it is computed and to what you share", () => {
    expect(COACH_LINKS).toEqual({ how: "/ajustes#como-se-calcula", share: "/ajustes" });
  });

  it("announces each step politely and the closing", () => {
    const opened = run([{ type: "open", variant: "mobile" }, { type: "next" }]);
    expect(coachAnnouncement(opened)).toBe(`Paso 2 de 4. ${COACH_STEP_COPY.drag.title}. ${COACH_STEP_COPY.drag.body}`);
    expect(coachAnnouncement(run([{ type: "close", reason: "skip" }], opened))).toBe(COACH_COPY.closed);
    expect(coachAnnouncement(COACH_INITIAL)).toBe("");
  });
});

describe("coachmarks: coach.css", () => {
  const css = readFileSync(resolve("src/app/coach.css"), "utf8").replace(/\r/g, "");
  const rule = (cls: string): string => {
    const match = css.match(new RegExp(`\\.${cls}\\s*\\{([^}]*)\\}`));
    expect(match, cls).not.toBeNull();
    return match?.[1] ?? "";
  };

  it("never intercepts pointers outside the card", () => {
    for (const cls of COACH_PASSTHROUGH_CLASSES) expect(rule(cls)).toMatch(/pointer-events:\s*none/);
    for (const cls of COACH_INTERACTIVE_CLASSES) expect(rule(cls)).toMatch(/pointer-events:\s*auto/);
  });

  it("follows the atlas rules: no radius, no blur, no smooth gradients, px on the grid", () => {
    expect(css).not.toMatch(/border-radius|blur\(|backdrop-filter|(linear|radial|conic)-gradient/);
    for (const [, value] of css.matchAll(/box-shadow:\s*([^;]+);/g)) {
      expect(value, "box-shadow without blur").toMatch(/^0 0 0 /);
    }
    for (const [, n] of css.matchAll(/(?<![\w-])(\d+(?:\.\d+)?)px/g)) expect(Number(n) % 2, `${n}px`).toBe(0);
    expect(css).toContain("steps(var(--coach-drag-steps)");
    expect(css).toMatch(/prefers-reduced-motion[\s\S]*zm-coach-finger__grab--moving[\s\S]*animation: none/);
  });

  it("is imported by globals.css", () => {
    expect(readFileSync(resolve("src/app/globals.css"), "utf8")).toContain('@import "./coach.css";');
  });
});
