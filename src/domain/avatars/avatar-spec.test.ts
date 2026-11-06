import { describe, expect, it } from "vitest";

import { AVATAR_CONFIG, CATALOG_ANIMALS, CATALOG_COLORS, MATCHING_CONFIG, MBTI_CODES } from "@/config";
import type { LatentProfile } from "@/types/latent";

import {
  NEUTRAL_COLOR_ID,
  baseColorId,
  buildAvatarSpec,
  emblemForColor,
  pickSpecies,
  preferenceClarity,
  publicVisual,
  subtypeMark,
} from "./avatar-spec";

const PARAMS = {
  temperature: MATCHING_CONFIG.categories.eneagrama.kind === "distribution" ? MATCHING_CONFIG.categories.eneagrama.temperature : 1,
  ambiguityEntropy: MATCHING_CONFIG.scoring.enneagram_ambiguity_entropy,
};
const AXES = ["mbti_ei", "mbti_sn", "mbti_tf", "mbti_jp"] as const;
const POSITIVE = ["I", "N", "F", "P"] as const;

/** Profile with a clear MBTI code, a dominant Enneagram type and optional wing/subtype. */
function profile(code: string, type: number, opts: { wing?: number; strength?: number; sub?: "sp" | "so" | "sx"; subSe?: number } = {}): LatentProfile {
  const theta: Record<string, number> = {};
  const se: Record<string, number> = {};
  const strength = opts.strength ?? 1.5;
  AXES.forEach((f, k) => {
    theta[f] = code[k] === POSITIVE[k] ? strength : -strength;
    se[f] = 0.4;
  });
  for (let t = 1; t <= 9; t++) {
    theta[`ennea_${t}`] = t === type ? 2.5 : t === opts.wing ? 1.2 : -0.5;
    se[`ennea_${t}`] = 0.5;
  }
  for (const s of ["sp", "so", "sx"]) {
    theta[`sub_${s}`] = s === opts.sub ? 1.2 : -0.4;
    se[`sub_${s}`] = opts.subSe ?? (opts.sub ? 0.6 : 1);
  }
  return { theta, se, quality: 1, answered: 100 };
}

const PRIOR: LatentProfile = { theta: {}, se: {}, quality: 1, answered: 0 };

describe("buildAvatarSpec", () => {
  it("is deterministic", () => {
    const p = profile("INFP", 4, { wing: 5, sub: "sx" });
    expect(buildAvatarSpec(p, PARAMS)).toEqual(buildAvatarSpec(p, PARAMS));
  });

  it("takes the silhouette from the MBTI pool and the colour from the Enneagram", () => {
    for (const code of MBTI_CODES) {
      const spec = buildAvatarSpec(profile(code, 7, { wing: 8 }), PARAMS);
      expect(spec.mbtiCode).toBe(code);
      expect(AVATAR_CONFIG.species_pools.pools[code]).toContain(spec.animalId);
      expect(spec.colorId).toBe("ennea-7-w8");
      expect(spec.emblem).toBe("7");
    }
  });

  it("shows the wing as a tone: deep for the ring predecessor, light for the successor", () => {
    expect(buildAvatarSpec(profile("ENTJ", 1, { wing: 9 }), PARAMS).colorId).toBe("ennea-1-w9");
    expect(buildAvatarSpec(profile("ENTJ", 1, { wing: 2 }), PARAMS).colorId).toBe("ennea-1-w2");
  });

  it("omits the wing when neither neighbour is clearly ahead", () => {
    const spec = buildAvatarSpec(profile("ISFJ", 6), PARAMS);
    expect(spec.enneagram.wing).toBeNull();
    expect(spec.colorId).toBe("ennea-6");
  });

  it("never forces a type when the Enneagram is ambiguous, while diversifying colour across the palette", () => {
    const colorsSeen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const flat = profile("ESTP", 3);
      for (let t = 1; t <= 9; t++) flat.theta[`ennea_${t}`] = 0.05 * ((t + i) % 3);
      flat.theta.hex_h = (i - 20) * 0.07;
      const spec = buildAvatarSpec(flat, PARAMS, `user-${i}`);
      expect(spec.enneagram.ambiguous).toBe(true);
      expect(spec.emblem).toBe("neutro");
      expect(spec.enneagram.type).toBeNull();
      expect(spec.enneagram.wing).toBeNull();
      colorsSeen.add(spec.colorId);
    }
    expect(colorsSeen.size).toBeGreaterThan(8);
  });

  it("stays valid with no answers at all (missing modules widen, never invent)", () => {
    const spec = buildAvatarSpec(PRIOR, PARAMS);
    expect(CATALOG_ANIMALS.some((a) => a.id === spec.animalId)).toBe(true);
    expect(CATALOG_COLORS.some((c) => c.id === spec.colorId)).toBe(true);
    expect(spec.enneagram.ambiguous).toBe(true);
    expect(spec.enneagram.type).toBeNull();
    expect(spec.mark).toBeNull();
  });

  it("distributes N >= 5000 synthetic profiles (core-only, full, and ambiguous) with no colour above 12% and high entropy", () => {
    const N = 5000;
    const counts = new Map<string, number>();
    const allFactors = [
      ...AXES,
      "hex_h", "hex_e", "hex_x", "hex_a", "hex_c", "hex_o",
      "ennea_1", "ennea_2", "ennea_3", "ennea_4", "ennea_5", "ennea_6", "ennea_7", "ennea_8", "ennea_9",
      "sub_sp", "sub_so", "sub_sx",
    ];
    // Deterministic PRNG (Mulberry32)
    let state = 20261105;
    const rand = () => {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const randNormal = () => {
      const u1 = Math.max(1e-9, rand());
      const u2 = rand();
      return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    };

    for (let i = 0; i < N; i++) {
      const theta: Record<string, number> = {};
      const se: Record<string, number> = {};
      // 70% core-only (high SE on enneagram, narrow theta), 20% full modules, 10% flat/ambiguous
      const mode = i % 10;
      const enneaScale = mode < 7 ? 0.42 : mode < 9 ? 1.15 : 0.08;
      for (const f of allFactors) {
        if (f.startsWith("ennea_")) {
          theta[f] = randNormal() * enneaScale;
          se[f] = mode < 7 ? 0.78 : 0.45;
        } else {
          theta[f] = randNormal() * 0.85;
          se[f] = 0.55;
        }
      }
      const p: LatentProfile = { theta, se, quality: 1, answered: mode < 7 ? 38 : 96 };
      const spec = buildAvatarSpec(p, PARAMS, `synth-${i}`);
      counts.set(spec.colorId, (counts.get(spec.colorId) ?? 0) + 1);
    }

    const maxShare = Math.max(...[...counts.values()].map((c) => c / N));
    const neblinaShare = (counts.get(NEUTRAL_COLOR_ID) ?? 0) / N;
    let shannonEntropy = 0;
    for (const c of counts.values()) {
      const p = c / N;
      if (p > 0) shannonEntropy -= p * Math.log(p);
    }

    expect(maxShare).toBeLessThanOrEqual(0.12);
    expect(neblinaShare).toBeLessThanOrEqual(0.08);
    expect(neblinaShare).toBeGreaterThan(0.005);
    expect(shannonEntropy).toBeGreaterThanOrEqual(2.95);
  });

  it("only uses ids that exist in the catalogue", () => {
    const colors = new Set(CATALOG_COLORS.map((c) => c.id));
    for (const code of MBTI_CODES) {
      for (let type = 1; type <= 9; type++) {
        const spec = buildAvatarSpec(profile(code, type, { wing: type === 9 ? 1 : type + 1 }), PARAMS);
        expect(colors.has(spec.colorId), spec.colorId).toBe(true);
      }
    }
  });
});

describe("species within a pool", () => {
  it("maps clearer preferences to the more archetypal (first) species", () => {
    const pool = AVATAR_CONFIG.species_pools.pools.INTJ;
    expect(pickSpecies("INTJ", 0.99)).toBe(pool[0]);
    expect(pickSpecies("INTJ", 0)).toBe(pool[pool.length - 1]);
  });

  it("is monotone in clarity", () => {
    const pool = AVATAR_CONFIG.species_pools.pools.ENFP;
    const ranks = [0, 0.2, 0.3, 0.4, 0.5, 0.6, 0.9].map((c) => pool.indexOf(pickSpecies("ENFP", c)));
    expect([...ranks].sort((a, b) => b - a)).toEqual(ranks);
  });

  it("measures clarity in [0, 1) and grows with |θ|", () => {
    const mild = preferenceClarity(profile("ISTJ", 1, { strength: 0.2 }));
    const strong = preferenceClarity(profile("ISTJ", 1, { strength: 2 }));
    expect(mild).toBeGreaterThanOrEqual(0);
    expect(strong).toBeLessThan(1);
    expect(strong).toBeGreaterThan(mild);
  });

  it("assigns every species to at most one MBTI code", () => {
    const all = Object.values(AVATAR_CONFIG.species_pools.pools).flat();
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("subtype mark", () => {
  it("is drawn only when the subtype module was informative", () => {
    expect(subtypeMark(profile("INFJ", 2, { sub: "so" }))).toBe("so");
    expect(subtypeMark(profile("INFJ", 2, { sub: "so", subSe: 1 }))).toBeNull();
    expect(subtypeMark(PRIOR)).toBeNull();
  });
});

describe("privacy of the public visual", () => {
  const visual = { animalId: "kitsune", colorId: "ennea-4-w5", mark: "sx" as const };

  it("hides wing tone and mark by default", () => {
    expect(publicVisual(visual, false)).toEqual({ animalId: "kitsune", colorId: "ennea-4", mark: null });
  });

  it("shows them only with opt-in", () => {
    expect(publicVisual(visual, true)).toEqual(visual);
  });

  it("keeps the type emblem readable from the base colour", () => {
    expect(baseColorId("ennea-4-w5")).toBe("ennea-4");
    expect(emblemForColor("ennea-4-w5")).toBe("4");
    expect(emblemForColor(NEUTRAL_COLOR_ID)).toBe("neutro");
    expect(emblemForColor("otro")).toBeNull();
  });
});
