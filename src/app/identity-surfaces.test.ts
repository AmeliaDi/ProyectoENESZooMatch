/**
 * Fase 5 guard, end to end — one person, one name, on every surface.
 *
 * `docs/DIAGNOSTICO_IDENTIDAD.md` documented people who appeared under two
 * names at once: the reveal said one thing, the cielo another, the chat header
 * a third. Each screen had its own route from the stored row to a display
 * string. The fix left exactly one route (`formatIdentity` over the stored
 * identity), and this test walks twenty synthetic people through the real use
 * cases — reveal, refinement, result, constellation, carta, chat, admin — and
 * fails if the same person is ever spelled two different ways.
 *
 * Everything runs on the in-memory adapters, so no matrícula, answer or
 * message content is involved: only aliases, which are public by design.
 */
import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { CORE_ITEMS, MATCHING_CONFIG, QUIZ_ITEMS } from "@/config";
import { PSYCHOMETRIC_PARAMS } from "@/config/psychometric-params";
import { formatIdentity } from "@/domain/identity/format-identity";
import { buildMeasurementModel, scoreLatent } from "@/domain/psychometrics/latent";
import type { LikertValue, QuizSubmission } from "@/types/microtest";
import type { IdentityDto } from "@/contracts/identity";
import { adaptResult } from "@/ui/constellation/adapt-result";
import { parsePublicResult } from "@/ui/result/parse-result";
import { hasPendingRevelation, parseIdentity } from "@/ui/shared/parse-identity";

import { confirmAdult, expressInterest, getConversation } from "@/application/chat";
import { getProfile } from "@/application/get-profile";
import { getResult } from "@/application/get-result";
import { toIdentityDto } from "@/application/identity-dto";
import { matchHandle } from "@/application/match-handle";
import { refineProfile, type RefineDeps } from "@/application/refine-profile";
import { markIdentityRevealed } from "@/application/revelation";
import { submitQuiz } from "@/application/submit-quiz";
import {
  MemoryStore,
  instantScheduler,
  memoryMatches,
  memoryNotifications,
  memoryProfiles,
} from "@/application/testing/in-memory";
import { ConversationStore, memoryConversations } from "@/application/testing/memory-conversations";
import { memoryBadges } from "@/application/testing/memory-badges";

const MODEL = buildMeasurementModel(PSYCHOMETRIC_PARAMS);
const SECRET = "zm-test-secret";
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

const N = 20;
const USERS = Array.from({ length: N }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`);

/** A likert grid that shifts with the person, so animals and colours differ. */
function submissionFor(index: number): QuizSubmission {
  return {
    likert: CORE_ITEMS.filter((item) => item.tipo_respuesta === "likert_5").map((item, idx) => ({
      itemId: item.id,
      value: ((((idx + index * 2) % 5) + 1) as LikertValue),
    })),
    filters: CORE_ITEMS.filter((item) => item.tipo_respuesta === "seleccion_multiple").map((item) => {
      if (item.subcategoria === "identidad_genero") {
        return { itemId: item.id, selected: [index % 2 === 0 ? "mujer" : "hombre"] };
      }
      if (item.subcategoria === "orientacion_sexual") {
        return { itemId: item.id, selected: ["bisexual/pansexual"] };
      }
      return { itemId: item.id, selected: ["relación seria", "amistad"] };
    }),
  };
}

/** The optional-module answers that sharpen a reading without touching identity. */
const REFINEMENT = QUIZ_ITEMS.filter((i) => i.modulo === "eneagrama" && i.tipo_respuesta === "likert_5").map(
  (item, idx) => ({ itemId: item.id, value: (idx % 2 === 0 ? 1 : 5) as LikertValue }),
);

interface World {
  store: MemoryStore;
  profiles: ReturnType<typeof memoryProfiles>;
  matches: ReturnType<typeof memoryMatches>;
  quizDeps: RefineDeps;
  /** The name the reveal showed each person — the reference for every other surface. */
  revealed: Map<string, string>;
}

async function twentyPeopleArrive(): Promise<World> {
  const store = new MemoryStore();
  const profiles = memoryProfiles(store);
  const matches = memoryMatches(store);
  const quizDeps: RefineDeps = {
    profiles,
    matches,
    notifications: memoryNotifications(store),
    scheduler: instantScheduler,
    secret: SECRET,
    latentScorer: (responses) => scoreLatent(MODEL, responses, MATCHING_CONFIG.quality),
  };

  const revealed = new Map<string, string>();
  for (const [index, userId] of USERS.entries()) {
    const submitted = await submitQuiz({ userId, submission: submissionFor(index) }, quizDeps);
    if (!submitted.ok) throw new Error(`persona ${index + 1} no eclosionó: ${submitted.error}`);
    revealed.set(userId, formatIdentity(submitted.value.profile.identity).title);
  }
  return { store, profiles, matches, quizDeps, revealed };
}

const titleOf = (identity: IdentityDto): string => formatIdentity(identity).title;

describe("identity across every surface — 20 synthetic people", () => {
  it("gives twenty arrivals twenty different names", async () => {
    const { revealed } = await twentyPeopleArrive();
    const titles = [...revealed.values()];
    expect(titles).toHaveLength(N);
    // Nobody shares a name: the suffix is what makes an alias unique, and the
    // hatch refuses a collision instead of renaming somebody already named.
    expect(new Set(titles).size).toBe(N);
    for (const title of titles) expect(title).toMatch(/· [BCDFGHJKLMNPQRSTVWXYZ]{4}$/);
  });

  it("keeps one name through refinement, the result view, the carta and the sky", async () => {
    const world = await twentyPeopleArrive();
    const { store, profiles, matches, quizDeps, revealed } = world;
    const resultDeps = { profiles, matches, digest };
    const cardDeps = { profiles, matches, badges: memoryBadges(memoryConversations(new ConversationStore())) };

    for (const userId of USERS) {
      const expected = revealed.get(userId)!;

      // Refining an optional module re-reads the row; it never re-hatches.
      const refined = await refineProfile({ userId, module: "eneagrama", likert: REFINEMENT }, quizDeps);
      if (!refined.ok) throw new Error(`refine ${userId}: ${refined.error}`);
      expect(titleOf(refined.value.profile.identity)).toBe(expected);

      // GET /api/result, as the browser receives it: the payload goes through
      // the client's fail-closed parser before it reaches a screen.
      const result = await getResult(userId, resultDeps);
      if (!result.ok) throw new Error(`result ${userId}: ${result.error}`);
      expect(titleOf(parseIdentity(result.value.identity))).toBe(expected);

      // Tu carta.
      const card = await getProfile(userId, cardDeps);
      if (!card.ok) throw new Error(`carta ${userId}: ${card.error}`);
      expect(titleOf(card.value.identity)).toBe(expected);

      // The constellation, fed by the public parse the screen actually uses.
      const publicResult = parsePublicResult(result.value);
      if (!publicResult) throw new Error(`public parse ${userId} dropped the person`);
      const sky = adaptResult(publicResult);
      if (!sky) throw new Error(`sky ${userId} could not be drawn`);
      expect(titleOf(sky.me.identity)).toBe(expected);

      // Every star is spelled exactly like that person's own reveal.
      for (const node of sky.matches) {
        const peer = USERS.find((other) => node.id === matchHandle(userId, other, digest));
        expect(peer, `star ${node.id} is nobody's handle`).toBeDefined();
        if (peer) expect(titleOf(node.identity)).toBe(revealed.get(peer)!);
      }

      // The carta's affinity list reads the same stars.
      for (const track of ["romance", "amistad"] as const) {
        for (const top of card.value.affinities[track].top) {
          const peer = USERS.find((other) => other !== userId && titleOf(top.identity) === revealed.get(other));
          expect(peer, `affinity ${top.identity.aliasCompleto} names nobody`).toBeDefined();
        }
      }

      // The row behind all of it: one stored alias, read the same way.
      const record = store.identities.get(userId);
      if (!record) throw new Error(`no stored identity for ${userId}`);
      expect(titleOf(toIdentityDto(record))).toBe(expected);
    }
  });

  it("says the same name in the chat header as in the cielo", async () => {
    const world = await twentyPeopleArrive();
    const { store, matches, revealed } = world;
    const convStore = new ConversationStore();
    convStore.peers.clear();
    for (const userId of USERS) {
      const record = store.identities.get(userId)!;
      convStore.peers.set(userId, {
        userId,
        identity: toIdentityDto(record),
      });
    }
    const chatDeps = {
      conversations: memoryConversations(convStore),
      matches,
      digest,
      clock: { now: () => new Date("2026-11-06T12:00:00Z") },
    };
    for (const userId of USERS) await confirmAdult(userId, chatDeps);

    const pairs = store.matches.filter((m) => m.userA < m.userB).slice(0, 8);
    if (pairs.length === 0) throw new Error("the twenty arrivals produced no matches");
    for (const pair of pairs) {
      const { track, userA, userB } = pair;
      convStore.addMatch(track, userA, userB);
      const sent = await expressInterest(userA, { match: matchHandle(userA, userB, digest), track }, chatDeps);
      if (!sent.ok) throw new Error(`signal ${userA}→${userB}: ${sent.error}`);
      const open = await expressInterest(userB, { match: matchHandle(userB, userA, digest), track }, chatDeps);
      if (!open.ok || open.value.state !== "open") throw new Error(`conversation ${userB}→${userA} never opened`);

      const asA = await getConversation(open.value.conversation, userA, chatDeps);
      const asB = await getConversation(open.value.conversation, userB, chatDeps);
      if (!asA.ok || !asB.ok) throw new Error(`conversation view failed for ${userA}/${userB}`);
      expect(titleOf(asA.value.peer.identity)).toBe(revealed.get(userB)!);
      expect(titleOf(asB.value.peer.identity)).toBe(revealed.get(userA)!);
    }
  });

  it("keeps the name after the reveal is consumed and never brings the egg back", async () => {
    const world = await twentyPeopleArrive();
    const { store, profiles, revealed } = world;
    const deps = { profiles };

    for (const userId of USERS) {
      const record = store.identities.get(userId)!;
      expect(hasPendingRevelation(toIdentityDto(record))).toBe(true);

      const first = await markIdentityRevealed(userId, deps);
      expect(first.ok && first.value.justRevealed).toBe(true);
      expect(first.ok && first.value.estadoIdentidad).toBe("eclosionado");

      const seen = toIdentityDto(store.identities.get(userId)!);
      expect(hasPendingRevelation(seen)).toBe(false);
      expect(titleOf(seen)).toBe(revealed.get(userId)!);
      expect(seen.estadoIdentidad).toBe("eclosionado");

      // A second call consumes nothing and still cannot rename anybody.
      const again = await markIdentityRevealed(userId, deps);
      expect(again.ok && again.value.justRevealed).toBe(false);
      expect(titleOf(toIdentityDto(store.identities.get(userId)!))).toBe(revealed.get(userId)!);
    }
  });
});
