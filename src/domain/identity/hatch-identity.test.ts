import { describe, expect, it } from "vitest";

import { AVATAR_CONFIG, CATALOG, CATALOG_ANIMALS, CATALOG_COLORS, MATCHING_CONFIG } from "@/config";
import type { LatentProfile } from "@/types/latent";

import {
  EGG_DISPLAY_NAME,
  formatIdentity,
  parseAliasParts,
} from "./format-identity";
import {
  agreeColor,
  eggCosmeticSeed,
  formatAgreedAnimalColor,
  hatchIdentity,
  isBlockedSuffix,
  isValidAliasCompleto,
  SAFE_SUFFIX_REGEX,
  SAFE_WORD_PHRASE_REGEX,
  suffixFromDigestHex,
} from "./hatch-identity";

const FACTOR_IDS = [
  "mbti_ei",
  "mbti_sn",
  "mbti_tf",
  "mbti_jp",
  "ennea_1",
  "ennea_2",
  "ennea_3",
  "ennea_4",
  "ennea_5",
  "ennea_6",
  "ennea_7",
  "ennea_8",
  "ennea_9",
  "sub_sp",
  "sub_so",
  "sub_sx",
  "hex_h",
  "hex_e",
  "hex_x",
  "hex_a",
  "hex_c",
  "hex_o",
] as const;

function makeSyntheticLatentProfile(seed: number): LatentProfile {
  let state = (seed >>> 0) || 1;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  const theta: Record<string, number> = {};
  const se: Record<string, number> = {};
  for (const id of FACTOR_IDS) {
    theta[id] = (next() * 2 - 1) * 1.8;
    se[id] = 0.15 + next() * 0.35;
  }
  // Give ~70% of synthetic profiles a defined primary/wing Enneagram peak and ~30% high-entropy
  // so both wing colors, pure base colors, and posterior-weighted colors (including neblina) are exercised.
  const mode = next();
  if (mode > 0.3) {
    const dominant = 1 + Math.floor(next() * 9);
    for (let t = 1; t <= 9; t += 1) {
      theta[`ennea_${t}`] = -0.6 + next() * 0.2;
    }
    theta[`ennea_${dominant}`] = 2.2 + next() * 0.6;
    if (mode > 0.5) {
      const wing = next() > 0.5 ? (dominant === 9 ? 1 : dominant + 1) : (dominant === 1 ? 9 : dominant - 1);
      theta[`ennea_${wing}`] = 1.1 + next() * 0.5;
    }
  } else {
    for (let t = 1; t <= 9; t += 1) {
      theta[`ennea_${t}`] = (next() * 2 - 1) * 0.15;
    }
  }
  return {
    theta,
    se,
    quality: 1,
    answered: 60,
  };
}

describe("domain/identity — Fase 2: hatchIdentity & grammatical concordance", () => {
  const SECRET = "test-server-secret-v1-zoomatch-fixed-identity";

  it("validates grammatical concordance across the entire 103 animals × 28 colors table (2,884 pairs)", () => {
    expect(CATALOG_ANIMALS.length).toBe(103);
    expect(CATALOG_COLORS.length).toBe(28);

    const pairs: string[] = [];

    for (const animal of CATALOG_ANIMALS) {
      expect(animal.diminutivo).toBe(animal.diminutivo_es);
      expect(["masculino", "femenino"]).toContain(animal.genero);
      expect(SAFE_WORD_PHRASE_REGEX.test(animal.diminutivo)).toBe(true);

      for (const color of CATALOG_COLORS) {
        const agreed = agreeColor(color, animal.genero);
        const fullPhrase = formatAgreedAnimalColor(animal, color);
        pairs.push(fullPhrase);

        expect(SAFE_WORD_PHRASE_REGEX.test(agreed)).toBe(true);

        if (color.invariable) {
          expect(agreed).toBe(color.masculino);
          expect(color.masculino).toBe(color.femenino);
        } else if (animal.genero === "femenino") {
          expect(agreed).toBe(color.femenino);
          expect(agreed).not.toBe(color.masculino);
          const words = agreed.split(" ");
          expect(words[0]!.endsWith("a") || words[words.length - 1]!.endsWith("a")).toBe(true);
        } else {
          expect(agreed).toBe(color.masculino);
          expect(agreed).not.toBe(color.femenino);
          const words = agreed.split(" ");
          expect(words[0]!.endsWith("o") || words[words.length - 1]!.endsWith("o")).toBe(true);
        }

        // Verify iconic concordance rules from specification
        if (animal.id === "tortuga" && color.id === "ennea-neblina") {
          expect(fullPhrase).toBe("tortuguita gris neblina");
        }
        if (animal.id === "zorro" && color.id === "ennea-8") {
          expect(fullPhrase).toBe("zorrito rojo carmín");
        }
        if (animal.id === "ballena" && color.id === "ennea-8") {
          expect(fullPhrase).toBe("ballenita roja carmín");
        }
      }
    }

    expect(pairs.length).toBe(103 * 28);
  });

  it("is 100% deterministic and pure", () => {
    const latentA = makeSyntheticLatentProfile(42);
    const latentB: LatentProfile = {
      ...latentA,
      theta: { ...latentA.theta },
      se: { ...latentA.se },
    };

    const id1 = hatchIdentity({ userId: "user-0001", latent: latentA }, SECRET, CATALOG);
    const id2 = hatchIdentity({ userId: "user-0001", latent: latentB }, SECRET, CATALOG);

    expect(id1).toEqual(id2);
    expect(Object.isFrozen(id1)).toBe(true);
  });

  it("derives the suffix and tie-breaker solely from HMAC(secret, userId) so profile changes cannot alter the suffix", () => {
    const latent1 = makeSyntheticLatentProfile(100);
    const latent2 = makeSyntheticLatentProfile(999);

    const id1 = hatchIdentity({ userId: "user-fixed-seed", latent: latent1 }, SECRET, CATALOG);
    const id2 = hatchIdentity({ userId: "user-fixed-seed", latent: latent2 }, SECRET, CATALOG);

    expect(id1.aliasSufijo).toBe(id2.aliasSufijo);
    expect(SAFE_SUFFIX_REGEX.test(id1.aliasSufijo)).toBe(true);
    // No vowels (A, E, I, O, U) in suffix
    expect(/[AEIOU]/.test(id1.aliasSufijo)).toBe(false);
  });

  it("retries deterministically when a suffix is blocked or collides with an existing alias_completo", () => {
    const latent = makeSyntheticLatentProfile(7);
    const first = hatchIdentity({ userId: "collision-user", latent }, SECRET, CATALOG);

    const existing = new Set<string>([first.aliasCompleto]);
    const second = hatchIdentity(
      { userId: "collision-user", latent },
      SECRET,
      CATALOG,
      { existingAliases: existing },
    );

    expect(second.aliasAnimal).toBe(first.aliasAnimal);
    expect(second.aliasColor).toBe(first.aliasColor);
    expect(second.aliasSufijo).not.toBe(first.aliasSufijo);
    expect(second.aliasCompleto).not.toBe(first.aliasCompleto);
    // Re-running with the same existing set gives the exact same deterministic retry
    const secondRepeat = hatchIdentity(
      { userId: "collision-user", latent },
      SECRET,
      CATALOG,
      { existingAliases: existing },
    );
    expect(secondRepeat.aliasCompleto).toBe(second.aliasCompleto);
  });

  it("rejects all blocked suffixes and invalid characters", () => {
    for (const blocked of AVATAR_CONFIG.identity.blocked_suffixes.valor) {
      expect(isBlockedSuffix(blocked)).toBe(true);
    }
    expect(isBlockedSuffix("AB12")).toBe(true); // vowel + digits
    expect(isBlockedSuffix("DRRS")).toBe(false);
    expect(
      isValidAliasCompleto(
        "tortuguita gris neblina · DRRS",
        "tortuguita",
        "gris neblina",
        "DRRS",
      ),
    ).toBe(true);
    expect(
      isValidAliasCompleto(
        "tortuguita gris neblina 🐢 · DRRS",
        "tortuguita",
        "gris neblina 🐢",
        "DRRS",
      ),
    ).toBe(false);
  });

  it("generates 5,000 unique, valid, blockage-free identities across 5,000 synthetic profiles with diverse color distribution", () => {
    const N = 5000;
    const existingAliases = new Set<string>();
    const colorCounts = new Map<string, number>();
    const animalCounts = new Map<string, number>();
    const maxLen = AVATAR_CONFIG.identity.max_alias_length.valor;

    for (let i = 0; i < N; i += 1) {
      const userId = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
      const latent = makeSyntheticLatentProfile(i + 1);
      const hatched = hatchIdentity(
        { userId, latent },
        SECRET,
        CATALOG,
        { existingAliases },
      );

      expect(hatched.estadoIdentidad).toBe("eclosionado");
      expect(hatched.aliasCompleto.length).toBeLessThanOrEqual(maxLen);
      expect(
        isValidAliasCompleto(
          hatched.aliasCompleto,
          hatched.aliasAnimal,
          hatched.aliasColor,
          hatched.aliasSufijo,
        ),
      ).toBe(true);
      expect(isBlockedSuffix(hatched.aliasSufijo)).toBe(false);
      expect(/[AEIOU0-9]/.test(hatched.aliasSufijo)).toBe(false);
      expect(existingAliases.has(hatched.aliasCompleto)).toBe(false);

      existingAliases.add(hatched.aliasCompleto);
      colorCounts.set(hatched.colorId, (colorCounts.get(hatched.colorId) ?? 0) + 1);
      animalCounts.set(hatched.animalId, (animalCounts.get(hatched.animalId) ?? 0) + 1);
    }

    expect(existingAliases.size).toBe(N);
    // All 28 colors are represented, and "ennea-neblina" is never an universal fallback (< 8%)
    expect(colorCounts.size).toBe(28);
    const neblinaShare = (colorCounts.get("ennea-neblina") ?? 0) / N;
    expect(neblinaShare).toBeLessThan(0.08);
    expect(animalCounts.size).toBeGreaterThanOrEqual(50);
  });

  it("formats egg and hatched identities via formatIdentity without recalculating", () => {
    const eggView = formatIdentity({ estadoIdentidad: "huevo" });
    expect(eggView.isEgg).toBe(true);
    expect(eggView.title).toBe(EGG_DISPLAY_NAME);
    expect(eggView.suffix).toBeNull();

    const hatchedView = formatIdentity({
      estadoIdentidad: "eclosionado",
      animalId: "tortuga",
      colorId: "ennea-neblina",
      aliasAnimal: "tortuguita",
      aliasColor: "gris neblina",
      aliasSufijo: "DRRS",
      aliasCompleto: "tortuguita gris neblina · DRRS",
      mbtiCode: "INFP",
      enneagramCode: "4w5",
      enneagramArchetype: "El Individualista",
    });

    expect(hatchedView.isEgg).toBe(false);
    expect(hatchedView.title).toBe("tortuguita gris neblina · DRRS");
    expect(hatchedView.shortName).toBe("tortuguita gris neblina");
    expect(hatchedView.suffix).toBe("DRRS");
    expect(hatchedView.subtitle).toBe("INFP · 4w5, el individualista");
    // Subtitle NEVER contains an animal or color name
    expect(hatchedView.subtitle).not.toContain("mariquita");
    expect(hatchedView.subtitle).not.toContain("tortuguita");
    expect(hatchedView.subtitle).not.toContain("gris neblina");

    const parsed = parseAliasParts("osito de anteojos azul profundo · KLMN");
    expect(parsed).toEqual({
      aliasAnimal: "osito de anteojos",
      aliasColor: "azul profundo",
      aliasSufijo: "KLMN",
    });
  });

  it("produces deterministic egg cosmetic seeds and valid suffixes from hex digests", () => {
    const seedA = eggCosmeticSeed("User-ABC", SECRET);
    const seedB = eggCosmeticSeed("  user-abc ", SECRET);
    expect(seedA).toBe(seedB);

    const sfx = suffixFromDigestHex("deadbeef0123456789abcdef0123456789abcdef0123456789abcdef01234567");
    expect(SAFE_SUFFIX_REGEX.test(sfx)).toBe(true);
  });
});
