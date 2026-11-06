import { describe, expect, it } from "vitest";

import {
  NO_MATCH_MESSAGE,
  generateNotificationCopy,
  generateWelcomeMessage,
  nameFrozenMessage,
  type NotificationContext,
} from "@/domain/messages/notification-copy";
import { EGG_DISPLAY_NAME, formatIdentity } from "@/domain/identity/format-identity";
import type { NotificationType } from "@/types/microtest";

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

/**
 * Names here are always the output of `formatIdentity()`. The generator only
 * interpolates them: it never sees an animal, a colour or a catalogue id, so a
 * second name route cannot appear inside a notification.
 */
const USER_NAME = formatIdentity({
  estadoIdentidad: "eclosionado",
  aliasCompleto: "tortuguita gris neblina · DRRS",
  mbtiCode: "INFP",
  enneagramCode: "4w5",
}).title;

const MATCH_NAME = formatIdentity({
  estadoIdentidad: "eclosionado",
  aliasCompleto: "mariquita rosa pastel · VWXZ",
  mbtiCode: "ESFJ",
  enneagramCode: "2w1",
}).title;

const ALL_TYPES: NotificationType[] = ["match_romance", "match_amistad", "no_match", "welcome", "identity"];

function context(overrides: Partial<NotificationContext> = {}): NotificationContext {
  return {
    userName: USER_NAME,
    matchCount: 1,
    matches: [MATCH_NAME],
    ...overrides,
  };
}

function manyMatches(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${MATCH_NAME} ${index + 1}`);
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
  { type: "welcome", ...generateWelcomeMessage(USER_NAME) },
  { type: "no_match", body: NO_MATCH_MESSAGE, title: "Tu momento llegará" },
];

// ─── No-match message ─────────────────────────────────────────────────────────

describe("NO_MATCH_MESSAGE", () => {
  it("keeps the exact product literal", () => {
    expect(NO_MATCH_MESSAGE).toBe(
      "aun no llega ese ser especial pero tranquilx solo es un proyecto de estadistica, no de amor <3",
    );
  });

  it("reassures with inclusive language", () => {
    expect(NO_MATCH_MESSAGE).toContain("tranquilx");
    expect(NO_MATCH_MESSAGE).toMatch(NEUTRAL_X_PATTERN);
  });

  it("keeps the heart emoticon", () => {
    expect(NO_MATCH_MESSAGE).toContain("<3");
  });

  it("frames the result as a statistics project, not a verdict", () => {
    expect(NO_MATCH_MESSAGE).toContain("estadistica");
    expect(NO_MATCH_MESSAGE).toContain("amor");
  });

  it("stays under the 280-character notification budget", () => {
    expect(NO_MATCH_MESSAGE.length).toBeLessThan(MAX_BODY_LENGTH);
  });

  it("avoids clinical vocabulary", () => {
    expect(NO_MATCH_MESSAGE).not.toMatch(CLINICAL_PATTERN);
  });
});

// ─── Romance match copy ───────────────────────────────────────────────────────

describe("generateNotificationCopy — match_romance", () => {
  it("celebrates a single match with the universe metaphor", () => {
    const copy = generateNotificationCopy("match_romance", context());

    expect(copy.title).toContain("universo");
    expect(copy.body).toContain(USER_NAME);
    expect(copy.body).toContain("ser extraordinario");
  });

  it("names the matched identity when the match details are known", () => {
    const copy = generateNotificationCopy("match_romance", context());

    expect(copy.body).toContain(MATCH_NAME);
  });

  it("falls back to a single-match message without details", () => {
    const copy = generateNotificationCopy("match_romance", context({ matches: undefined }));

    expect(copy.title).toContain("universo");
    expect(copy.body).toContain(USER_NAME);
    expect(copy.body).not.toContain(MATCH_NAME);
    expect(copy.body.length).toBeGreaterThan(0);
  });

  it("switches to the plural and states the count for several matches", () => {
    const copy = generateNotificationCopy(
      "match_romance",
      context({ matchCount: 3, matches: manyMatches(3) }),
    );

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
    expect(copy.body).toContain(USER_NAME);
    expect(copy.body).toContain(MATCH_NAME);
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

      expect(copy.body).toContain(String(count));
      expect(copy.body).toContain("amistades");
    }
  });

  it("falls back gracefully without match details", () => {
    const copy = generateNotificationCopy("match_amistad", context({ matches: undefined }));

    expect(copy.title).toContain("vibra");
    expect(copy.body).toContain(USER_NAME);
    expect(copy.body).not.toContain(MATCH_NAME);
  });
});

// ─── No-match copy ────────────────────────────────────────────────────────────

describe("generateNotificationCopy — no_match", () => {
  it("returns the shared comforting message verbatim", () => {
    const copy = generateNotificationCopy("no_match", context({ matchCount: 0, matches: [] }));

    expect(copy.body).toBe(NO_MATCH_MESSAGE);
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
  it("greets the new profile with its frozen name", () => {
    const copy = generateNotificationCopy("welcome", context());

    expect(copy.title).toContain("brilla");
    expect(copy.body).toContain(USER_NAME);
  });

  it("delegates to generateWelcomeMessage", () => {
    expect(generateNotificationCopy("welcome", context())).toEqual(
      generateWelcomeMessage(USER_NAME),
    );
  });
});

describe("generateWelcomeMessage", () => {
  it("names the identity once and promises it will not move", () => {
    const message = generateWelcomeMessage(MATCH_NAME);

    expect(message.title).toContain("brilla");
    expect(message.body).toContain(MATCH_NAME);
    expect(message.body).toContain("fijo para siempre");
    expect(Object.keys(message).sort()).toEqual(["body", "title"]);
  });

  it("is deterministic and reacts to its argument", () => {
    expect(generateWelcomeMessage(USER_NAME)).toEqual(generateWelcomeMessage(USER_NAME));
    expect(generateWelcomeMessage(USER_NAME).body).not.toBe(generateWelcomeMessage(MATCH_NAME).body);
  });
});

describe("nameFrozenMessage", () => {
  it("tells the person the name is now fixed", () => {
    const message = nameFrozenMessage(USER_NAME);

    expect(message.body).toContain(USER_NAME);
    expect(message.body).toContain("Ya no cambia");
    expect(message.body.length).toBeLessThan(MAX_BODY_LENGTH);
  });

  it("never mentions a recalculated animal or colour", () => {
    const message = nameFrozenMessage(USER_NAME);
    const haystack = `${message.title} ${message.body}`;

    for (const forbidden of ["animal", "color_id", "cálculo", "recalcul", "huevito"]) {
      expect(haystack, haystack).not.toContain(forbidden);
    }
  });

  it("is the copy the `identity` notification type serves", () => {
    expect(generateNotificationCopy("identity", context())).toEqual(nameFrozenMessage(USER_NAME));
  });
});

// ─── Golden rule: no second name route ────────────────────────────────────────

describe("notification copy never rebuilds an identity", () => {
  it("renders an unusable or egg identity as the huevito, never as a blank name", () => {
    const egg = formatIdentity({ estadoIdentidad: "huevo" });

    expect(egg.title).toBe(EGG_DISPLAY_NAME);
    expect(egg.subtitle).toContain("cascarón");
    expect(formatIdentity({}).title).toBe(EGG_DISPLAY_NAME);
  });

  it("carries the canonical name through untouched, so the wire and the notice match", () => {
    for (const type of ALL_TYPES) {
      if (type === "no_match") continue;
      const copy = generateNotificationCopy(type, context({ matchCount: 1 }));

      expect(copy.body).toContain(USER_NAME);
    }
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
