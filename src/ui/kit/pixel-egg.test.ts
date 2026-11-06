/**
 * The egg's two config-backed numbers (Fase 3).
 *
 * `egg_crack_stages` and the aura ramp used to live in the component as literal
 * `4` and `0.1 + 0.06 * stage`. The literal silently disagreed with the config,
 * and the ramp was a fixed step that only ended at the CSS ceiling while the
 * stage count was exactly four. Both are pinned here: the helper is checked
 * against its bounds, and the source is scanned so a new literal cannot come
 * back.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { AVATAR_CONFIG } from "@/config";
import { EGG_AURA_MAX, EGG_AURA_MIN, eggAuraGlow, eggCrackStage } from "@/domain/avatars/egg-sprite";

const STAGES = AVATAR_CONFIG.identity.egg_crack_stages.valor;
const COMPONENT = resolve("src/ui/kit/pixel-egg.tsx");
const CSS = resolve("src/app/kit.css");

describe("egg aura ramp", () => {
  it("stays inside the bounds the CSS animates", () => {
    for (let stage = 0; stage <= STAGES; stage += 1) {
      const glow = eggAuraGlow(stage, STAGES);
      expect(glow).toBeGreaterThanOrEqual(EGG_AURA_MIN);
      expect(glow).toBeLessThanOrEqual(EGG_AURA_MAX);
    }
  });

  it("reaches exactly the CSS default at the last stage and the floor at stage 0", () => {
    expect(eggAuraGlow(0, STAGES)).toBeCloseTo(EGG_AURA_MIN, 10);
    expect(eggAuraGlow(STAGES, STAGES)).toBeCloseTo(EGG_AURA_MAX, 10);
    // kit.css declares the ceiling the component may set, so the two must agree.
    const declared = readFileSync(CSS, "utf8").match(/--egg-glow:\s*([\d.]+)/);
    expect(Number(declared?.[1])).toBeCloseTo(EGG_AURA_MAX, 10);
  });

  it("is monotonic and does not depend on how many stages the config asks for", () => {
    for (let stage = 1; stage <= STAGES; stage += 1) {
      expect(eggAuraGlow(stage, STAGES)).toBeGreaterThan(eggAuraGlow(stage - 1, STAGES));
    }
    // Same top value whether the core is drawn in 3, 4 or 6 crack stages.
    for (const stages of [1, 3, 6, 12]) {
      expect(eggAuraGlow(stages, stages)).toBeCloseTo(EGG_AURA_MAX, 10);
    }
  });

  it("clamps progress outside the stage range", () => {
    expect(eggAuraGlow(-3, STAGES)).toBeCloseTo(EGG_AURA_MIN, 10);
    expect(eggAuraGlow(STAGES * 4, STAGES)).toBeCloseTo(EGG_AURA_MAX, 10);
  });
});

describe("pixel-egg source", () => {
  const source = () => readFileSync(COMPONENT, "utf8").replace(/\r/g, "");

  it("takes the crack stage count from the config, never a literal", () => {
    expect(source()).toMatch(/AVATAR_CONFIG\.identity\.egg_crack_stages\.valor/);
    expect(source()).not.toMatch(/CRACK_STAGES\s*=\s*\d/);
  });

  it("leaves the aura ramp to the domain helper", () => {
    expect(source()).toMatch(/eggAuraGlow\(\s*stage,\s*CRACK_STAGES\s*\)/);
    expect(source()).not.toMatch(/0\.\d+\s*\+\s*0\.\d+\s*\*\s*stage/);
  });

  it("keeps the last stage reachable at full core progress", () => {
    // The component feeds `eggCrackStage` straight through, so the sprite must
    // be able to show stage `STAGES`; a `stages - 1` clamp here would strand it.
    expect(eggCrackStage(100, 100, STAGES)).toBe(STAGES);
    expect(eggCrackStage(0, 100, STAGES)).toBe(0);
  });
});
