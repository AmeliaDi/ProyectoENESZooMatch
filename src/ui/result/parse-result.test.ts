import { describe, expect, it } from "vitest";

import type { MatchEntryDto, ResultDto } from "@/contracts/result";
import { formatIdentity } from "@/domain/identity/format-identity";
import { explainPair } from "@/domain/explainability";
import { MATCHING_CONFIG, pairScore } from "@/domain/matching";
import { NO_MATCH_MESSAGE as DOMAIN_NO_MATCH_MESSAGE } from "@/domain/messages/notification-copy";
import { INCLUSIVE_X } from "@/testing/copy-guard";
import { parseIdentity } from "@/ui/shared/parse-identity";

import { NO_MATCH_MESSAGE, normalizeBadges, parsePublicResult } from "./parse-result";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const MAX_BODY_LENGTH = 280;

const FACTORS = [...new Set(Object.values(MATCHING_CONFIG.categories).flatMap((c) => Object.keys(c.factors)))];
const latent = (shift: number) => ({
  theta: Object.fromEntries(FACTORS.map((f, i) => [f, ((i * 7) % 5) / 5 - 0.4 + shift])),
  se: Object.fromEntries(FACTORS.map((f) => [f, 0.6])),
  quality: 1,
  answered: 60,
});
/** A real server explanation, so the parser is tested against the true DTO. */
const REAL_EXPLANATION = explainPair({
  score: pairScore(latent(0), latent(0.3), MATCHING_CONFIG.tracks.romance, MATCHING_CONFIG.categories),
  track: "romance",
  self: latent(0),
  other: latent(0.3),
  selfNarrative: { enneagramType: 2, mbti: "ENFJ" },
  otherNarrative: { enneagramType: 5, mbti: "INTP" },
});

/** Exactly what `getResult` sends for chemistry: percentage, wording and threshold. */
const CHEMISTRY = {
  percentage: 87,
  displayText: "87% de Compatibilidad",
  level: "quimica_fuerte",
  levelLabel: "Química fuerte",
  threshold: 0.78,
  relativePosition: 0.4,
};

/** The wire identity: the only place a name or an avatar comes from. */
function identityWire(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    estadoIdentidad: "eclosionado",
    aliasCompleto: "ajolotito verde bosque · 4K2P",
    aliasAnimal: "ajolotito",
    aliasColor: "verde bosque",
    aliasSufijo: "4K2P",
    animalId: "ajolotito",
    colorId: "ennea-6",
    colorHex: "#338547",
    mbtiCode: "ENFJ",
    enneagramCode: "4w5",
    enneagramName: "El individualista",
    mark: null,
    revelacionVista: true,
    huevitoSeed: null,
    ...overrides,
  };
}

/** A person who never hatched: no name, no avatar, only a cosmetic shell seed. */
const EGG_WIRE = {
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
  huevitoSeed: 9_876_543_210,
};

/** Counterpart identity, deliberately different from the owner's. */
const COUNTERPART = {
  aliasCompleto: "mantisita rosa pastel · 9QW2",
  aliasAnimal: "mantisita",
  aliasColor: "rosa pastel",
  aliasSufijo: "9QW2",
  animalId: "mantisita",
  colorId: "ennea-3",
  colorHex: "#f7c8dd",
  mbtiCode: "ISFP",
  enneagramCode: null,
  enneagramName: null,
};

function makeMatch(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "opaque-handle-1",
    identity: identityWire(COUNTERPART),
    similarity: 0.87,
    chemistry: CHEMISTRY,
    badges: [{ dimension: "valores_empatia", label: "ignored", affinity: 0.9, icon: "ignored" }],
    ...overrides,
  };
}

function makePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    identity: identityWire(),
    narrative: "Eres un ajolotito verde bosque con una capacidad infinita de regenerar.",
    matches: { romance: [makeMatch()], amistad: [] },
    no_match_message: NO_MATCH_MESSAGE,
    ...overrides,
  };
}

function parse(payload: Record<string, unknown>): ResultDto {
  const parsed = parsePublicResult(payload);
  expect(parsed).not.toBeNull();
  return parsed as ResultDto;
}

/** Removes a key entirely (as opposed to setting it to `undefined`). */
function without(payload: Record<string, unknown>, key: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(payload).filter(([entry]) => entry !== key));
}

// ─── No-match message ─────────────────────────────────────────────────────────

describe("NO_MATCH_MESSAGE", () => {
  it("comes from the domain, not from a second copy in the UI", () => {
    expect(DOMAIN_NO_MATCH_MESSAGE).toBe(NO_MATCH_MESSAGE);
  });

  // The screen and the notification are read aloud by the same operating
  // system, so the UI copy carries the rule the notification guard checks
  // (ADR-053): a pronounceable sentence, no -x, no emoticon.
  it("is a sentence somebody can read aloud", () => {
    expect(NO_MATCH_MESSAGE).toMatch(/^Todavía [a-z]/);
    expect(NO_MATCH_MESSAGE.endsWith(".")).toBe(true);
    expect(NO_MATCH_MESSAGE).not.toMatch(INCLUSIVE_X);
    expect(NO_MATCH_MESSAGE).not.toMatch(/<3|tranquilx|estadistica/);
  });

  it("frames the outcome as an empty pool, not a verdict on the person", () => {
    expect(NO_MATCH_MESSAGE).toContain("arriba del filtro");
    expect(NO_MATCH_MESSAGE).toContain("No es un veredicto sobre ti");
    expect(NO_MATCH_MESSAGE).toContain("cuando entre más gente");
  });

  it("stays under the 280-character notification budget", () => {
    expect(NO_MATCH_MESSAGE.length).toBeLessThan(MAX_BODY_LENGTH);
  });

  it("avoids clinical vocabulary", () => {
    expect(NO_MATCH_MESSAGE).not.toMatch(/score|similarity|vector|cosine|percentil|umbral/i);
  });
});

// ─── Result parsing ───────────────────────────────────────────────────────────

describe("parsePublicResult", () => {
  it("parses a complete API payload into the real `ResultDto`", () => {
    const result = parse(makePayload());

    expect(Object.keys(result).sort()).toEqual([
      "few_people",
      "identity",
      "matches",
      "narrative",
      "no_match_message",
    ]);
    expect(result.identity.aliasCompleto).toBe("ajolotito verde bosque · 4K2P");
    expect(result.identity.animalId).toBe("ajolotito");
    expect(result.identity.colorId).toBe("ennea-6");
    expect(result.narrative).toContain("ajolotito");
    expect(result.matches.romance).toHaveLength(1);
    expect(result.matches.amistad).toHaveLength(0);
    expect(result.no_match_message).toBe(NO_MATCH_MESSAGE);
  });

  it("keeps identity as the single name route (no flat alias/animal/color fields)", () => {
    const result = parse(makePayload());

    expect(result.identity).toEqual(parseIdentity(identityWire()));
    for (const legacy of ["alias", "animal", "color", "color_hex", "mbti_code", "mark"]) {
      expect(result, legacy).not.toHaveProperty(legacy);
    }
  });

  it("separates the title from the subtitle, which is the reported bug", () => {
    const mine = formatIdentity(parse(makePayload()).identity);

    expect(mine.title).toBe("ajolotito verde bosque · 4K2P");
    expect(mine.subtitle).toBe("ENFJ · 4w5");
    // A subtitle assembled by hand (`animal + " " + color`) is exactly the bug.
    expect(mine.subtitle).not.toContain("ajolotito");
    expect(mine.subtitle).not.toContain("verde bosque");
  });

  it("accepts empty match lists as a valid no-match result", () => {
    const result = parse(makePayload({ matches: { romance: [], amistad: [] } }));
    expect(result.matches).toEqual({ romance: [], amistad: [] });
  });

  it("rejects payloads that are not objects", () => {
    for (const raw of [null, undefined, 42, "profile", [], true]) {
      expect(parsePublicResult(raw)).toBeNull();
    }
  });

  it("rejects payloads with missing required fields", () => {
    for (const key of ["identity", "narrative", "matches"]) {
      expect(parsePublicResult(without(makePayload(), key)), `missing ${key}`).toBeNull();
    }
  });

  it("rejects payloads with wrongly typed required fields", () => {
    expect(parsePublicResult(makePayload({ narrative: null }))).toBeNull();
    expect(parsePublicResult(makePayload({ narrative: 7 }))).toBeNull();
    expect(parsePublicResult(makePayload({ identity: "ajolotito" }))).toBeNull();
  });

  it("rejects an invalid matches field", () => {
    expect(parsePublicResult(makePayload({ matches: [] }))).toBeNull();
    expect(parsePublicResult(makePayload({ matches: null }))).toBeNull();
    expect(parsePublicResult(makePayload({ matches: "romance" }))).toBeNull();
    expect(parse(makePayload({ matches: { romance: [makeMatch()] } })).matches.amistad).toEqual([]);
  });

  it("drops the whole result when its owner is still an egg", () => {
    expect(parsePublicResult(makePayload({ identity: EGG_WIRE }))).toBeNull();
    expect(parsePublicResult(makePayload({ identity: without(identityWire(), "estadoIdentidad") }))).toBeNull();
    expect(parsePublicResult(makePayload({ identity: null }))).toBeNull();
  });

  it("fails closed on an owner identity that cannot be named or drawn", () => {
    for (const broken of [
      { aliasCompleto: null },
      { aliasCompleto: 7 },
      { aliasCompleto: "sin separador", aliasSufijo: null },
      { animalId: null },
      { colorId: null },
      { aliasCompleto: "x".repeat(80) },
    ]) {
      expect(parsePublicResult(makePayload({ identity: identityWire(broken) })), JSON.stringify(broken)).toBeNull();
    }
  });

  it("keeps a hatched owner whose cosmetic hex or typology codes are unusable", () => {
    const result = parse(
      makePayload({
        identity: identityWire({ colorHex: "#GGGGGG", mbtiCode: 42, enneagramCode: "13w", enneagramName: null }),
      }),
    );

    expect(result.identity.aliasCompleto).toBe("ajolotito verde bosque · 4K2P");
    expect(result.identity.colorHex).toBeNull();
    expect(result.identity.mbtiCode).toBeNull();
    expect(result.identity.enneagramCode).toBeNull();
    expect(formatIdentity(result.identity).subtitle).toBe("");
  });

  it("treats `few_people` as a coarse boolean, never as a count", () => {
    expect(parse(makePayload({ few_people: true })).few_people).toBe(true);
    expect(parse(makePayload({ few_people: false })).few_people).toBe(false);
    expect(parse(makePayload({ few_people: "3" })).few_people).toBe(false);
    expect(parse(without(makePayload(), "few_people")).few_people).toBe(false);
  });

  it("falls back to the shared no-match message for optional text", () => {
    expect(parse(without(makePayload(), "no_match_message")).no_match_message).toBe(NO_MATCH_MESSAGE);
    expect(parse(makePayload({ no_match_message: 42 })).no_match_message).toBe(NO_MATCH_MESSAGE);
  });

  it("normalizes match entries instead of trusting the payload", () => {
    const result = parse(
      makePayload({
        matches: {
          romance: [
            makeMatch(),
            // an egg, a half-written identity, a non-object, a bad similarity and
            // an entry with no usable chemistry never become cards
            makeMatch({ identity: EGG_WIRE }),
            makeMatch({ identity: identityWire({ ...COUNTERPART, aliasCompleto: "sin separador", aliasSufijo: null }) }),
            "not-an-object",
            makeMatch({ similarity: "0.9" }),
            makeMatch({ chemistry: null }),
          ],
          amistad: "not-an-array",
        },
      }),
    );

    expect(result.matches.romance).toHaveLength(1);
    expect(result.matches.amistad).toEqual([]);

    const entry = result.matches.romance[0] as MatchEntryDto;
    expect(entry.similarity).toBeCloseTo(0.87, 12);
    expect(entry.identity.aliasCompleto).toBe("mantisita rosa pastel · 9QW2");
    expect(entry.id).toBe("opaque-handle-1");
    // Labels and icon keys always come from the local map, never from the server.
    expect(entry.badges).toEqual([
      { dimension: "valores_empatia", label: "Empatía", affinity: 0.9, icon: "valores_relacionales" },
    ]);
    expect(entry.explanation).toBeNull();
    expect(entry.layers).toEqual([]);
    expect(entry.shared).toEqual({ sections: [], mbti: null, enneagram: null });
  });

  it("keeps only the DTO fields, never an opaque payload extra", () => {
    const entry = parse(
      makePayload({
        matches: {
          romance: [makeMatch({ other_user_id: "20191234", romance_vector: [0.1, 0.2], answers: ["a"] })],
          amistad: [],
        },
      }),
    ).matches.romance[0] as MatchEntryDto;

    expect(Object.keys(entry).sort()).toEqual([
      "badges",
      "chemistry",
      "explanation",
      "id",
      "identity",
      "layers",
      "shared",
      "similarity",
    ]);
  });

  it("never leaks a matrícula, a counterpart id, a hash or the latent profile", () => {
    const result = parse(
      makePayload({
        matches: {
          romance: [
            makeMatch({ other_user_id: "20191234", romance_vector: [0.1, 0.2], theta: { apertura: 1.2 } }),
          ],
          amistad: [],
        },
      }),
    );
    const json = JSON.stringify(result);

    expect(json).not.toContain("20191234");
    expect(json).not.toContain("romance_vector");
    expect(json).not.toContain("theta");
    expect(Object.keys(result.identity).sort()).toEqual([
      "aliasAnimal",
      "aliasColor",
      "aliasCompleto",
      "aliasSufijo",
      "animalId",
      "colorHex",
      "colorId",
      "enneagramCode",
      "enneagramName",
      "estadoIdentidad",
      "huevitoSeed",
      "mark",
      "mbtiCode",
      "revelacionVista",
    ]);
  });

  it("drops malformed badges and humanizes unknown dimensions", () => {
    const entry = parse(
      makePayload({
        matches: {
          romance: [
            makeMatch({
              badges: [
                { dimension: "cultural_humor", affinity: 0.8 },
                { dimension: "dimension_desconocida", affinity: 0.4 },
                { dimension: "valores_confianza" },
                { affinity: 0.7 },
                "badge",
              ],
            }),
          ],
          amistad: [],
        },
      }),
    ).matches.romance[0] as MatchEntryDto;

    expect(entry.badges).toEqual([
      { dimension: "cultural_humor", label: "Humor", affinity: 0.8, icon: "afinidad_cultural" },
      {
        dimension: "dimension_desconocida",
        label: "dimension desconocida",
        affinity: 0.4,
        icon: "general",
      },
    ]);
  });

  it("labels every match category of the layered model with a friendly name and a known icon", () => {
    const categories = ["personalidad", "valores", "dealbreakers", "relacional", "estilo", "conflicto", "apego", "afecto", "mbti", "eneagrama", "big_five"];
    const entry = parse(
      makePayload({
        matches: { romance: [makeMatch({ badges: categories.map((dimension) => ({ dimension, affinity: 0.7 })) })], amistad: [] },
      }),
    ).matches.romance[0] as MatchEntryDto;
    // The card and the sheet read the badges through the same normaliser.
    for (const badge of normalizeBadges(entry.badges)) {
      expect(badge.label).not.toContain("_");
      expect(badge.label).not.toBe(badge.dimension);
      expect(badge.icon).not.toBe("general");
    }
    expect(entry.badges).toHaveLength(categories.length);
  });

  it("keeps every badge affinity inside [0, 1] for well-formed payloads", () => {
    const badges = normalizeBadges(parse(makePayload()).matches.romance[0]?.badges ?? []);
    for (const badge of badges) {
      expect(badge.affinity).toBeGreaterThanOrEqual(0);
      expect(badge.affinity).toBeLessThanOrEqual(1);
      expect(badge.icon.length).toBeGreaterThan(0);
      expect(badge.label.length).toBeGreaterThan(0);
    }
  });

  it("exposes the badge wording route so the sky and the list never disagree", () => {
    const entry = parse(makePayload()).matches.romance[0] as MatchEntryDto;
    expect(normalizeBadges(entry.badges)).toEqual(entry.badges);
    expect(normalizeBadges([{ dimension: "personalidad_apertura", affinity: 0.5 }])).toEqual([
      { dimension: "personalidad_apertura", label: "Curiosidad", affinity: 0.5, icon: "personalidad" },
    ]);
  });
});

// ─── Chemistry and explanation ────────────────────────────────────────────────

describe("parsePublicResult · server-computed chemistry", () => {
  function firstRomance(overrides: Record<string, unknown>): MatchEntryDto | undefined {
    return parse(makePayload({ matches: { romance: [makeMatch(overrides)], amistad: [] } })).matches
      .romance[0];
  }

  it("keeps a well-formed chemistry summary", () => {
    expect(firstRomance({ chemistry: CHEMISTRY })?.chemistry).toEqual(CHEMISTRY);
  });

  it("drops an entry whose chemistry is malformed and has no fallback", () => {
    expect(firstRomance({ chemistry: { percentage: "87" } })).toBeUndefined();
    expect(firstRomance({ chemistry: null })).toBeUndefined();
    expect(firstRomance({ chemistry: 42 })).toBeUndefined();
  });

  it("falls back to the explanation's chemistry when the top-level one is missing", () => {
    const explanation = { ...REAL_EXPLANATION, chemistry: CHEMISTRY };
    const entry = firstRomance({ chemistry: null, explanation });
    expect(entry?.chemistry).toEqual(CHEMISTRY);
    expect(entry?.similarity).toBeCloseTo(0.87, 12);
  });

  it("accepts exactly what the server builds (DTO contract)", () => {
    const wire = JSON.parse(JSON.stringify(REAL_EXPLANATION));
    expect(firstRomance({ explanation: wire })?.explanation).toEqual(wire);
  });

  it("rejects explanations missing the fields the UI renders", () => {
    expect(firstRomance({ explanation: { headline: "x" } })?.explanation).toBeNull();
    expect(firstRomance({ explanation: { ...REAL_EXPLANATION, connects: "no" } })?.explanation).toBeNull();
    expect(firstRomance({ explanation: { ...REAL_EXPLANATION, connects: [{ category: "x" }] } })?.explanation).toBeNull();
    expect(firstRomance({ explanation: { ...REAL_EXPLANATION, talk: null } })?.explanation).toBeNull();
    expect(firstRomance({ explanation: { ...REAL_EXPLANATION, confidence: { level: "baja" } } })?.explanation).toBeNull();
  });

  it("never forwards unknown fields such as vectors", () => {
    const entry = firstRomance({ romance_vector: [0.1, 0.2], user_id: "secret" }) as MatchEntryDto;
    expect(entry).not.toHaveProperty("romance_vector");
    expect(entry).not.toHaveProperty("user_id");
  });
});
