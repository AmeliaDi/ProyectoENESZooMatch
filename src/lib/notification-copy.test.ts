import { describe, expect, it } from "vitest";

import {
  NO_MATCH_MESSAGE_V2,
  generateNotificationCopy,
  generateWelcomeMessage,
  type NotificationContext,
} from "@/lib/notification-copy";
import type { NotificationType } from "@/types/microtest-v2";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** Push-notification bodies have to stay inside the OS rendering budget. */
const MAX_BODY_LENGTH = 280;

/** Clinical / technical vocabulary the affective copy must never use. */
const CLINICAL_PATTERN =
  /score|similarity|similar|vector|cosine|percentil|umbral|threshold|algoritmo|database|json|api|metric/i;

/** Binary-gendered person references the inclusive copy avoids. */
const GENDERED_WORDS = [
  "chico",
  "chica",
  "chavo",
  "chava",
  "usuario",
  "usuaria",
  "soltero",
  "soltera",
  "novio",
  "novia",
  "amigo",
  "amiga",
  "compañero",
  "compañera",
  "todos",
  "todas",
  "ellos",
  "ellas",
] as const;

/** Neutral "-x" / "-xs" marker used for inclusive Spanish (tranquilx, ellxs, unx). */
const NEUTRAL_X_PATTERN = /[A-Za-záéíóúñ]+xs?\b/i;

const USER_ANIMAL = "ajolotito";
const USER_COLOR = "verde esmeralda";
const MATCH_ANIMAL = "mantisita";
const MATCH_COLOR = "rosa pastel";

const ALL_TYPES: NotificationType[] = ["match_romance", "match_amistad", "no_match", "welcome"];

function context(overrides: Partial<NotificationContext> = {}): NotificationContext {
  return {
    userAnimal: USER_ANIMAL,
    userColor: USER_COLOR,
    matchCount: 1,
    matches: [{ animal: MATCH_ANIMAL, color: MATCH_COLOR, similarity: 0.86 }],
    ...overrides,
  };
}

function manyMatches(count: number): Array<{ animal: string; color: string; similarity: number }> {
  return Array.from({ length: count }, (_, index) => ({
    animal: `${MATCH_ANIMAL}-${index + 1}`,
    color: MATCH_COLOR,
    similarity: 0.9 - index * 0.01,
  }));
}

/** Every piece of copy produced by the generator, for whole-suite assertions. */
const ALL_COPY: Array<{ type: NotificationType; title: string; body: string }> = [
  ...ALL_TYPES.flatMap((type) =>
    [
      context({ matchCount: 1 }),
      context({ matchCount: 1, matches: undefined }),
      context({ matchCount: 3, matches: manyMatches(3) }),
      context({ matchCount: 0, matches: [] }),
    ].map((ctx) => ({ type, ...generateNotificationCopy(type, ctx) })),
  ),
  { type: "welcome", ...generateWelcomeMessage(USER_ANIMAL, USER_COLOR) },
  { type: "no_match", body: NO_MATCH_MESSAGE_V2, title: "Tu momento llegará 🌱" },
];

// ─── No-match message ─────────────────────────────────────────────────────────

describe("NO_MATCH_MESSAGE_V2", () => {
  it("reassures with inclusive language", () => {
    expect(NO_MATCH_MESSAGE_V2).toContain("tranquilx");
    expect(NO_MATCH_MESSAGE_V2).toMatch(NEUTRAL_X_PATTERN);
  });

  it("keeps the heart emoticon", () => {
    expect(NO_MATCH_MESSAGE_V2).toContain("<3");
  });

  it("frames the result as a statistics project, not a verdict", () => {
    expect(NO_MATCH_MESSAGE_V2).toContain("estadística");
    expect(NO_MATCH_MESSAGE_V2).toContain("valor");
  });

  it("stays under the 280-character notification budget", () => {
    expect(NO_MATCH_MESSAGE_V2.length).toBeLessThan(MAX_BODY_LENGTH);
  });

  it("avoids clinical vocabulary", () => {
    expect(NO_MATCH_MESSAGE_V2).not.toMatch(CLINICAL_PATTERN);
  });
});

// ─── Romance match copy ───────────────────────────────────────────────────────

describe("generateNotificationCopy — match_romance", () => {
  it("celebrates a single match with the universe metaphor", () => {
    const copy = generateNotificationCopy("match_romance", context());

    expect(copy.title).toContain("universo");
    expect(copy.body).toContain(USER_ANIMAL);
    expect(copy.body).toContain("ser extraordinario");
  });

  it("names the matched identity when the match details are known", () => {
    const copy = generateNotificationCopy("match_romance", context());

    expect(copy.body).toContain(MATCH_ANIMAL);
    expect(copy.body).toContain(MATCH_COLOR);
  });

  it("falls back to a single-match message without details", () => {
    const copy = generateNotificationCopy("match_romance", context({ matches: undefined }));

    expect(copy.title).toContain("universo");
    expect(copy.body).toContain(USER_ANIMAL);
    expect(copy.body).not.toContain(MATCH_ANIMAL);
    expect(copy.body.length).toBeGreaterThan(0);
  });

  it("switches to the plural and states the count for several matches", () => {
    const copy = generateNotificationCopy("match_romance", context({ matchCount: 3, matches: manyMatches(3) }));

    expect(copy.body).toContain("3");
    expect(copy.body).toContain("seres");
    expect(copy.body).not.toContain("un ser extraordinario");
    expect(copy.body).toMatch(NEUTRAL_X_PATTERN);
  });

  it("scales the count text to the number of matches", () => {
    for (const count of [2, 5, 8]) {
      const body = generateNotificationCopy(
        "match_romance",
        context({ matchCount: count, matches: manyMatches(count) }),
      ).body;

      expect(body).toContain(String(count));
      expect(body).toContain("seres");
    }
  });

  it("ignores the optional track field and follows the notification type", () => {
    const withTrack = generateNotificationCopy("match_romance", context({ track: "amistad" }));
    const withoutTrack = generateNotificationCopy("match_romance", context({ track: undefined }));

    expect(withTrack).toEqual(withoutTrack);
    expect(withTrack.title).toContain("universo");
  });

  it("is deterministic for the same context", () => {
    expect(generateNotificationCopy("match_romance", context())).toEqual(
      generateNotificationCopy("match_romance", context()),
    );
  });
});

// ─── Friendship match copy ────────────────────────────────────────────────────

describe("generateNotificationCopy — match_amistad", () => {
  it("opens with the 'vibra' metaphor for a single friendship match", () => {
    const copy = generateNotificationCopy("match_amistad", context());

    expect(copy.title).toContain("vibra");
    expect(copy.body).toContain(USER_ANIMAL);
    expect(copy.body).toContain(MATCH_ANIMAL);
    expect(copy.body).toContain("amistad");
  });

  it("never uses romance wording in the friendship track", () => {
    const copy = generateNotificationCopy("match_amistad", context());

    expect(copy.title).not.toContain("universo");
    expect(copy.body).not.toContain("ser extraordinario");
  });

  it("states the count when there are two or more matches", () => {
    for (const count of [2, 4]) {
      const copy = generateNotificationCopy(
        "match_amistad",
        context({ matchCount: count, matches: manyMatches(count) }),
      );

      expect(copy.title).toContain("vibra");
      expect(copy.body).toContain(String(count));
      expect(copy.body).toContain("amistades");
    }
  });

  it("falls back gracefully without match details", () => {
    const copy = generateNotificationCopy("match_amistad", context({ matches: undefined }));

    expect(copy.title).toContain("vibra");
    expect(copy.body).toContain(USER_ANIMAL);
    expect(copy.body).not.toContain(MATCH_ANIMAL);
  });
});

// ─── No-match copy ────────────────────────────────────────────────────────────

describe("generateNotificationCopy — no_match", () => {
  it("returns the shared comforting message verbatim", () => {
    const copy = generateNotificationCopy("no_match", context({ matchCount: 0, matches: [] }));

    expect(copy.body).toBe(NO_MATCH_MESSAGE_V2);
    expect(copy.title.length).toBeGreaterThan(0);
    expect(copy.title).not.toBe(copy.body);
  });

  it("does not depend on the match context", () => {
    expect(generateNotificationCopy("no_match", context({ matchCount: 9, matches: manyMatches(9) }))).toEqual(
      generateNotificationCopy("no_match", context({ matchCount: 0, matches: [] })),
    );
  });
});

// ─── Welcome copy ─────────────────────────────────────────────────────────────

describe("generateNotificationCopy — welcome", () => {
  it("greets the new profile and names its identity", () => {
    const copy = generateNotificationCopy("welcome", context());

    expect(copy.title).toContain("brilla");
    expect(copy.body).toContain(USER_ANIMAL);
    expect(copy.body).toContain(USER_COLOR);
  });

  it("delegates to generateWelcomeMessage", () => {
    expect(generateNotificationCopy("welcome", context())).toEqual(
      generateWelcomeMessage(USER_ANIMAL, USER_COLOR),
    );
  });
});

// ─── generateWelcomeMessage ───────────────────────────────────────────────────

describe("generateWelcomeMessage", () => {
  it("returns a title and a body that name the animal and the color", () => {
    const message = generateWelcomeMessage("mantisita", "rosa pastel");

    expect(message.title).toContain("brilla");
    expect(message.body).toContain("mantisita");
    expect(message.body).toContain("rosa pastel");
    expect(Object.keys(message).sort()).toEqual(["body", "title"]);
  });

  it("is deterministic and reacts to both arguments", () => {
    expect(generateWelcomeMessage(USER_ANIMAL, USER_COLOR)).toEqual(
      generateWelcomeMessage(USER_ANIMAL, USER_COLOR),
    );
    expect(generateWelcomeMessage(USER_ANIMAL, USER_COLOR).body).not.toBe(
      generateWelcomeMessage(MATCH_ANIMAL, USER_COLOR).body,
    );
    expect(generateWelcomeMessage(USER_ANIMAL, USER_COLOR).body).not.toBe(
      generateWelcomeMessage(USER_ANIMAL, MATCH_COLOR).body,
    );
  });
});

// ─── Whole-suite copy guarantees ──────────────────────────────────────────────

describe("all notification copy", () => {
  it("keeps every body under 280 characters", () => {
    for (const { type, body } of ALL_COPY) {
      expect(body.length, `${type} body is too long`).toBeLessThan(MAX_BODY_LENGTH);
    }
  });

  it("never exposes clinical or technical language", () => {
    for (const { type, title, body } of ALL_COPY) {
      expect(title, `${type} title`).not.toMatch(CLINICAL_PATTERN);
      expect(body, `${type} body`).not.toMatch(CLINICAL_PATTERN);
    }
  });

  it("uses inclusive language and avoids binary-gendered references", () => {
    for (const { type, title, body } of ALL_COPY) {
      const haystack = `${title} ${body}`.toLowerCase();
      for (const word of GENDERED_WORDS) {
        expect(haystack, `${type} copy contains '${word}'`).not.toContain(word);
      }
    }
  });

  it("always produces a non-empty title and body", () => {
    for (const { title, body } of ALL_COPY) {
      expect(title.trim().length).toBeGreaterThan(0);
      expect(body.trim().length).toBeGreaterThan(0);
    }
  });

  it("keeps the numeric similarity value out of the user-facing text", () => {
    const body = generateNotificationCopy("match_romance", context()).body;

    expect(body).not.toContain("0.86");
    expect(body).not.toContain("86");
  });
});
