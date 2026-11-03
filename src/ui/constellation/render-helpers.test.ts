/**
 * Unit tests for the constellation render helpers (pure, node environment).
 */

import { describe, expect, it } from "vitest";

import { getTrackThreshold } from "@/domain/constellation";
import type { CompatibilityBadge } from "@/types/microtest";

import {
  BADGE_LIMITS,
  affinityLabelY,
  isRadiantAffinity,
  RADIANT_AFFINITY_PERCENT,
  GHOST_ANIMAL_ID,
  GHOST_COLOR_ID,
  GHOST_OPACITY,
  HIT_RADIUS_PADDING,
  LINE_DASH,
  SPRITE_SIZE_FACTOR,
  buildDataKey,
  clamp,
  connectionsLabel,
  AFFINITY_LABEL_MIN_OPACITY,
  DIMMED_OPACITY,
  EDGE_OPACITY_MIN,
  EDGE_OPACITY_SPAN,
  affinityLabelOpacity,
  edgeStrokeOpacity,
  edgeStrokeWidth,
  glowLevel,
  formatAffinityPercent,
  matchAriaLabel,
  matchesForTrack,
  nodeOpacity,
  normalizeSimilarity,
  round2,
  selfAriaLabel,
  sliceBadges,
  trackNoun,
} from "./render-helpers";
import type { ConstellationMatchInput, ConstellationSelfInput } from "./types";

const ROMANCE_THRESHOLD = getTrackThreshold("romance");

function makeBadge(dimension: string, affinity: number): CompatibilityBadge {
  return { dimension, label: `Label ${dimension}`, affinity, icon: "general" };
}

const SELF: ConstellationSelfInput = {
  id: "me",
  animalId: "ajolotito",
  colorId: "rosa-pastel",
  colorHex: "#e8a0bf",
  animalName: "Ajolotito",
  colorName: "rosa pastel",
  alias: "Mar",
};

function makeMatch(id: string, similarity: number, track: "romance" | "amistad"): ConstellationMatchInput {
  return {
    id,
    animalId: "lobito",
    colorId: "ennea-1",
    colorHex: "#3b6fd4",
    animalName: "Lobito",
    colorName: "azul zafiro",
    alias: `Alias ${id}`,
    similarity,
    track,
    badges: [],
    chemistry: null,
    explanation: null,
  };
}

// ─── Tunables ────────────────────────────────────────────────────────────────

describe("render tunables", () => {
  it("keeps the tunables in the ranges the render tree assumes", () => {
    expect(SPRITE_SIZE_FACTOR).toBeGreaterThan(2);
    expect(HIT_RADIUS_PADDING).toBeGreaterThanOrEqual(8);
    expect(LINE_DASH[0]).toBeGreaterThan(0);
    expect(LINE_DASH[1]).toBeGreaterThan(0);
    expect(GHOST_OPACITY).toBeGreaterThan(0);
    expect(GHOST_OPACITY).toBeLessThan(1);
    expect(BADGE_LIMITS).toEqual({ romance: 5, amistad: 3 });
  });

  it("points ghosts at catalogue ids the sprite engine actually knows", () => {
    expect(GHOST_ANIMAL_ID).toBe("estrellita");
    expect(GHOST_COLOR_ID).toBe("ennea-neblina");
  });
});

// ─── Numeric mappings ────────────────────────────────────────────────────────

describe("clamp / normalizeSimilarity", () => {
  it("clamps to the given bounds", () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.4, 0, 1)).toBe(0.4);
  });

  it("maps the threshold to 0 and a perfect match to 1", () => {
    expect(normalizeSimilarity(ROMANCE_THRESHOLD, ROMANCE_THRESHOLD)).toBe(0);
    expect(normalizeSimilarity(1, ROMANCE_THRESHOLD)).toBe(1);
    const mid = (1 + ROMANCE_THRESHOLD) / 2;
    expect(normalizeSimilarity(mid, ROMANCE_THRESHOLD)).toBeCloseTo(0.5, 10);
  });

  it("clamps below-threshold input to 0 instead of going negative", () => {
    expect(normalizeSimilarity(0.2, ROMANCE_THRESHOLD)).toBe(0);
  });

  it("degrades safely if a threshold ever reached 1", () => {
    expect(normalizeSimilarity(1, 1)).toBe(1);
  });
});

describe("nodeOpacity", () => {
  it("keeps the weakest allowed match clearly visible", () => {
    expect(nodeOpacity(ROMANCE_THRESHOLD, ROMANCE_THRESHOLD)).toBeCloseTo(0.62, 10);
  });

  it("reaches full opacity at similarity 1", () => {
    expect(nodeOpacity(1, ROMANCE_THRESHOLD)).toBeCloseTo(1, 10);
  });

  it("is monotonically non-decreasing in similarity", () => {
    let previous = -1;
    for (let s = ROMANCE_THRESHOLD; s <= 1.0001; s += 0.02) {
      const value = nodeOpacity(Math.min(1, s), ROMANCE_THRESHOLD);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });
});

describe("edge stroke mapping", () => {
  it("scales width and opacity with similarity", () => {
    expect(edgeStrokeWidth(0)).toBeCloseTo(1, 10);
    expect(edgeStrokeWidth(1)).toBeCloseTo(2.6, 10);
    expect(edgeStrokeOpacity(0)).toBeCloseTo(EDGE_OPACITY_MIN, 10);
    expect(edgeStrokeOpacity(1)).toBeCloseTo(EDGE_OPACITY_MIN + EDGE_OPACITY_SPAN, 10);
    expect(edgeStrokeOpacity(0.5)).toBeGreaterThan(edgeStrokeOpacity(0));
  });

  it("never drops under the contrast floor", () => {
    for (const s of [-1, 0, 0.3, 0.7, 1, 2]) expect(edgeStrokeOpacity(s)).toBeGreaterThanOrEqual(EDGE_OPACITY_MIN);
  });

  it("never exceeds full opacity, so lines stay under the sprites", () => {
    expect(edgeStrokeOpacity(1)).toBeLessThan(1);
  });

  it("clamps out-of-range similarity", () => {
    expect(edgeStrokeWidth(-3)).toBeCloseTo(1, 10);
    expect(edgeStrokeWidth(9)).toBeCloseTo(2.6, 10);
  });
});

describe("affinity label and halo tiers", () => {
  it("keeps the % label above its floor on weak and dimmed stars", () => {
    expect(affinityLabelOpacity(DIMMED_OPACITY)).toBe(AFFINITY_LABEL_MIN_OPACITY);
    expect(affinityLabelOpacity(nodeOpacity(ROMANCE_THRESHOLD, ROMANCE_THRESHOLD))).toBe(AFFINITY_LABEL_MIN_OPACITY);
    expect(affinityLabelOpacity(1)).toBe(1);
    expect(affinityLabelOpacity(DIMMED_OPACITY, true)).toBe(1);
  });

  it("steps the halo with affinity, never down", () => {
    expect(glowLevel(ROMANCE_THRESHOLD, ROMANCE_THRESHOLD)).toBe(0);
    expect(glowLevel(1, ROMANCE_THRESHOLD)).toBe(2);
    let previous = 0;
    for (let s = ROMANCE_THRESHOLD; s <= 1.0001; s += 0.01) {
      const level = glowLevel(Math.min(1, s), ROMANCE_THRESHOLD);
      expect(level).toBeGreaterThanOrEqual(previous);
      previous = level;
    }
  });
});

describe("round2", () => {
  it("rounds to two decimals", () => {
    expect(round2(1.23456)).toBe(1.23);
    expect(round2(-1.236)).toBe(-1.24);
    expect(round2(0)).toBe(0);
  });
});

// ─── Copy + formatting ───────────────────────────────────────────────────────

describe("formatAffinityPercent", () => {
  it("turns a raw similarity into an integer percent string", () => {
    expect(formatAffinityPercent(0.873)).toBe("87");
    expect(formatAffinityPercent(1)).toBe("100");
    expect(formatAffinityPercent(0)).toBe("0");
  });

  it("clamps out-of-range values", () => {
    expect(formatAffinityPercent(4)).toBe("100");
    expect(formatAffinityPercent(-4)).toBe("0");
  });
});

describe("trackNoun", () => {
  it("returns the es-MX wording used inside sentences", () => {
    expect(trackNoun("romance")).toBe("romance");
    expect(trackNoun("amistad")).toBe("amistad");
  });
});

describe("matchAriaLabel", () => {
  it("matches the documented accessible-name shape exactly", () => {
    expect(matchAriaLabel("Ajolotito", "azul", 0.87, "romance")).toBe(
      "Ajolotito azul, 87 % de afinidad estimada en romance",
    );
  });

  it("drops an empty colour name without leaving a double space", () => {
    expect(matchAriaLabel("Lobito", "  ", 0.912, "amistad")).toBe(
      "Lobito, 91 % de afinidad estimada en amistad",
    );
  });
});

describe("selfAriaLabel", () => {
  it("names the centred node as the user", () => {
    expect(selfAriaLabel("Ajolotito", "rosa pastel", "Mar")).toBe(
      "Mar, Ajolotito rosa pastel, tú, el centro de tu constelación",
    );
  });

  it("omits a missing alias cleanly", () => {
    expect(selfAriaLabel("Ajolotito", "rosa pastel", "  ")).toBe(
      "Ajolotito rosa pastel, tú, el centro de tu constelación",
    );
  });
});

describe("connectionsLabel", () => {
  it("pluralises in es-MX", () => {
    expect(connectionsLabel(1)).toBe("1 conexión");
    expect(connectionsLabel(0)).toBe("0 conexiones");
    expect(connectionsLabel(7)).toBe("7 conexiones");
  });
});

describe("sliceBadges", () => {
  const badges = [
    makeBadge("d", 0.7),
    makeBadge("a", 0.95),
    makeBadge("c", 0.8),
    makeBadge("b", 0.95),
    makeBadge("e", 0.6),
    makeBadge("f", 0.5),
    makeBadge("g", 0.4),
  ];

  it("caps romance at 5 and amistad at 3", () => {
    expect(sliceBadges(badges, "romance")).toHaveLength(5);
    expect(sliceBadges(badges, "amistad")).toHaveLength(3);
  });

  it("sorts by affinity descending", () => {
    const affinities = sliceBadges(badges, "romance").map((badge) => badge.affinity);
    expect(affinities).toEqual([...affinities].sort((a, b) => b - a));
  });

  it("breaks ties by original order (stable)", () => {
    const top = sliceBadges(badges, "romance").slice(0, 2);
    expect(top.map((badge) => badge.dimension)).toEqual(["a", "b"]);
  });

  it("never mutates the input array", () => {
    const input = [...badges];
    sliceBadges(input, "romance");
    expect(input.map((badge) => badge.dimension)).toEqual(badges.map((badge) => badge.dimension));
  });

  it("returns fewer badges when there are not enough", () => {
    expect(sliceBadges([makeBadge("a", 0.9)], "romance")).toHaveLength(1);
    expect(sliceBadges([], "amistad")).toHaveLength(0);
  });
});

// ─── Data key + track filtering ──────────────────────────────────────────────

describe("buildDataKey", () => {
  const matches = [makeMatch("a", 0.9, "romance"), makeMatch("b", 0.8, "amistad")];

  it("is stable across fresh object identities", () => {
    const again = [makeMatch("a", 0.9, "romance"), makeMatch("b", 0.8, "amistad")];
    expect(buildDataKey({ ...SELF }, again)).toBe(buildDataKey(SELF, matches));
  });

  it("changes when a similarity changes", () => {
    const changed = [makeMatch("a", 0.91, "romance"), makeMatch("b", 0.8, "amistad")];
    expect(buildDataKey(SELF, changed)).not.toBe(buildDataKey(SELF, matches));
  });

  it("changes when a track changes", () => {
    const changed = [makeMatch("a", 0.9, "amistad"), makeMatch("b", 0.8, "amistad")];
    expect(buildDataKey(SELF, changed)).not.toBe(buildDataKey(SELF, matches));
  });

  it("changes when the order changes", () => {
    expect(buildDataKey(SELF, [matches[1]!, matches[0]!])).not.toBe(buildDataKey(SELF, matches));
  });

  it("changes when the user changes", () => {
    expect(buildDataKey({ ...SELF, id: "other" }, matches)).not.toBe(buildDataKey(SELF, matches));
  });
});

describe("matchesForTrack", () => {
  const matches = [
    makeMatch("low", ROMANCE_THRESHOLD, "romance"),
    makeMatch("mid", 0.87, "romance"),
    makeMatch("high", 0.95, "romance"),
    makeMatch("friend", 0.99, "amistad"),
    makeMatch("dup", 0.9, "romance"),
    { ...makeMatch("dup", 0.9, "romance") },
  ];

  it("keeps only the active track", () => {
    const result = matchesForTrack(matches, "romance", ROMANCE_THRESHOLD);
    expect(result.some((match) => match.id === "friend")).toBe(false);
  });

  it("drops matches at or below the threshold", () => {
    const result = matchesForTrack(matches, "romance", ROMANCE_THRESHOLD);
    expect(result.some((match) => match.id === "low")).toBe(false);
  });

  it("de-duplicates by id, keeping the first occurrence", () => {
    const result = matchesForTrack(matches, "romance", ROMANCE_THRESHOLD);
    expect(result.filter((match) => match.id === "dup")).toHaveLength(1);
  });

  it("sorts by similarity descending, then by id", () => {
    const result = matchesForTrack(matches, "romance", ROMANCE_THRESHOLD);
    expect(result.map((match) => match.id)).toEqual(["high", "dup", "mid"]);
  });

  it("returns an empty list for an empty sky", () => {
    expect(matchesForTrack([], "amistad", 0.75)).toEqual([]);
  });

  it("does not mutate the input", () => {
    const input = [...matches];
    matchesForTrack(input, "romance", ROMANCE_THRESHOLD);
    expect(input).toHaveLength(matches.length);
    expect(input.map((match) => match.id)).toEqual(matches.map((match) => match.id));
  });
});

describe("affinityLabelY", () => {
  it("sits above the sprite, and above the hearts in romance", () => {
    const plain = affinityLabelY(40, false);
    const withHearts = affinityLabelY(40, true);
    expect(plain).toBeLessThan(-20);
    expect(withHearts).toBeLessThan(plain);
  });
});

describe("isRadiantAffinity", () => {
  it("glows exactly when the shown percent reaches the track threshold", () => {
    for (const track of ["romance", "amistad"] as const) {
      const percent = RADIANT_AFFINITY_PERCENT[track];
      expect(isRadiantAffinity((percent - 0.51) / 100, track)).toBe(false);
      expect(isRadiantAffinity((percent - 0.5) / 100, track)).toBe(true);
      expect(isRadiantAffinity(1, track)).toBe(true);
      expect(isRadiantAffinity(0.3, track)).toBe(false);
    }
  });

  it("keeps gold rare: romance asks more than amistad and neither is near 100", () => {
    expect(RADIANT_AFFINITY_PERCENT.romance).toBeGreaterThanOrEqual(RADIANT_AFFINITY_PERCENT.amistad);
    expect(RADIANT_AFFINITY_PERCENT.romance).toBeLessThan(90);
  });
});
