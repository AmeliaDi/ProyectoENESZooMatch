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

  it("never forces a type when the Enneagram is ambiguous", () => {
    const flat = profile("ESTP", 3);
    for (let t = 1; t <= 9; t++) flat.theta[`ennea_${t}`] = 0.1 * (t % 2);
    const spec = buildAvatarSpec(flat, PARAMS);
    expect(spec.enneagram.ambiguous).toBe(true);
    expect(spec).toMatchObject({ colorId: NEUTRAL_COLOR_ID, emblem: "neutro", enneagram: { type: null, wing: null } });
  });

  it("stays valid with no answers at all (missing modules widen, never invent)", () => {
    const spec = buildAvatarSpec(PRIOR, PARAMS);
    expect(CATALOG_ANIMALS.some((a) => a.id === spec.animalId)).toBe(true);
    expect(spec.colorId).toBe(NEUTRAL_COLOR_ID);
    expect(spec.mark).toBeNull();
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
