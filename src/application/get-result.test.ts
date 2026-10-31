import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { NO_MATCH_MESSAGE } from "@/domain/messages/notification-copy";
import { FRIENDSHIP_VECTOR_LENGTH, ROMANCE_VECTOR_LENGTH } from "@/types/microtest";

import { getResult, type GetResultDeps } from "./get-result";
import type { CounterpartProfile, OwnProfile, StoredMatch } from "./ports";
import { MemoryStore, memoryMatches, memoryProfiles } from "./testing/in-memory";

const VIEWER = "00000000-0000-4000-8000-00000000000a";
const OTHER = "00000000-0000-4000-8000-00000000000b";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const OWN: OwnProfile = {
  alias: "zorrito ámbar",
  narrative: "Una narrativa",
  mbtiCode: "INFP",
  dimensionScores: {},
  romanceVector: Array<number>(ROMANCE_VECTOR_LENGTH).fill(0.6),
  amistadVector: Array<number>(FRIENDSHIP_VECTOR_LENGTH).fill(0.6),
  animal: { id: "zorrito", diminutivo_es: "zorrito", categoria_fauna: "mamifero" },
  color: { id: "ambar", nombre: "Ámbar", hex: "#FFBF00" },
};

const COUNTERPART: CounterpartProfile = {
  userId: OTHER,
  dimensionScores: {},
  mbtiCode: "ENFP",
  romanceVector: Array<number>(ROMANCE_VECTOR_LENGTH).fill(0.65),
  amistadVector: Array<number>(FRIENDSHIP_VECTOR_LENGTH).fill(0.65),
  animalId: "pulpito",
  colorId: "azul-abisal",
  colorHex: "#123456",
};

const MATCH: StoredMatch = {
  track: "amistad",
  otherUser: OTHER,
  otherAlias: "pulpito azul",
  otherAnimal: "pulpito",
  otherColor: "Azul abisal",
  similarity: 0.87,
  badges: [{ dimension: "personalidad_apertura", affinity: 0.9 }],
};

function wire(store: MemoryStore): GetResultDeps {
  return { profiles: memoryProfiles(store), matches: memoryMatches(store), digest: sha256 };
}

describe("getResult", () => {
  it("reports quiz.not_completed when the viewer has no profile", async () => {
    await expect(getResult(VIEWER, wire(new MemoryStore()))).resolves.toEqual({
      ok: false,
      error: "quiz.not_completed",
    });
  });

  it("returns an empty, well-formed result with the no-match copy", async () => {
    const store = new MemoryStore();
    store.own = OWN;
    const result = await getResult(VIEWER, wire(store));
    expect(result.ok && result.value).toMatchObject({
      alias: OWN.alias,
      matches: { romance: [], amistad: [] },
      no_match_message: NO_MATCH_MESSAGE,
    });
  });

  it("never leaks the counterpart user id and keeps handles stable per viewer", async () => {
    const store = new MemoryStore();
    store.own = OWN;
    store.stored = [MATCH];
    store.counterparts = [COUNTERPART];
    const first = await getResult(VIEWER, wire(store));
    const again = await getResult(VIEWER, wire(store));
    const other = await getResult(OTHER, wire(store));
    if (!first.ok || !again.ok || !other.ok) throw new Error("expected ok");

    expect(JSON.stringify(first.value)).not.toContain(OTHER);
    const handle = first.value.matches.amistad[0]?.id;
    expect(handle).toMatch(/^[0-9a-f]{16}$/);
    expect(again.value.matches.amistad[0]?.id).toBe(handle);
    expect(other.value.matches.amistad[0]?.id).not.toBe(handle);
  });

  it("builds an explanation when both vectors are valid and degrades otherwise", async () => {
    const store = new MemoryStore();
    store.own = OWN;
    store.stored = [MATCH];
    store.counterparts = [COUNTERPART];
    const full = await getResult(VIEWER, wire(store));
    expect(full.ok && full.value.matches.amistad[0]?.explanation).not.toBeNull();

    store.counterparts = [{ ...COUNTERPART, amistadVector: [0.5] }];
    const degraded = await getResult(VIEWER, wire(store));
    expect(degraded.ok && degraded.value.matches.amistad[0]?.explanation).toBeNull();
    expect(degraded.ok && degraded.value.matches.amistad[0]?.color_hex).toBe("#123456");
  });

  it("splits matches by track", async () => {
    const store = new MemoryStore();
    store.own = OWN;
    store.stored = [MATCH, { ...MATCH, track: "romance", similarity: 0.91 }];
    const result = await getResult(VIEWER, wire(store));
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.matches.romance).toHaveLength(1);
    expect(result.value.matches.amistad).toHaveLength(1);
    expect(result.value.matches.romance[0]?.narrative).toBe(
      "Conexión romántica del 91% con pulpito azul.",
    );
  });
});
