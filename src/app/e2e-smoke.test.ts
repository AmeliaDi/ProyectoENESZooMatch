/**
 * Fase 6 — End-to-end smoke test covering all 5 production bug fixes:
 *   1. Idempotent quiz submission + constellation deduplication (Fase 1)
 *   2. Diverse initial color assignment + color stability across refinements (Fase 2)
 *   3. Incremental romance & friendship matching + idempotent notifications (Fase 5)
 *   4. Mutual signal -> 3 sealed question rounds -> automatic free chat <= 300 graphemes (Fase 4)
 */
import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { CORE_ITEMS, MATCHING_CONFIG, QUIZ_ITEMS } from "@/config";
import { PSYCHOMETRIC_PARAMS } from "@/config/psychometric-params";
import { formatIdentity } from "@/domain/identity/format-identity";
import { buildMeasurementModel, scoreLatent } from "@/domain/psychometrics/latent";
import type { LikertValue, QuizSubmission } from "@/types/microtest";
import { adaptResult } from "@/ui/constellation/adapt-result";
import { parsePublicResult } from "@/ui/result/parse-result";

import {
  answerRound,
  askQuestion,
  confirmAdult,
  expressInterest,
  getConversation,
  sendMessage,
} from "@/application/chat";
import { getResult } from "@/application/get-result";
import { matchHandle } from "@/application/match-handle";
import { refineProfile } from "@/application/refine-profile";
import { submitQuiz, type SubmitQuizDeps } from "@/application/submit-quiz";
import {
  MemoryStore,
  instantScheduler,
  memoryMatches,
  memoryNotifications,
  memoryProfiles,
} from "@/application/testing/in-memory";
import { ConversationStore, memoryConversations } from "@/application/testing/memory-conversations";

const MODEL = buildMeasurementModel(PSYCHOMETRIC_PARAMS);
const USER_A = "00000000-0000-4000-8000-000000000101";
const USER_B = "00000000-0000-4000-8000-000000000202";
/** Fixed test seed: `hatchIdentity` is deterministic, so the alias is reproducible. */
const SECRET = "zm-test-secret";
const digest = (s: string) => createHash("sha256").update(s).digest("hex");

function buildCompatibleSubmission(variant: "A" | "B"): QuizSubmission {
  return {
    likert: CORE_ITEMS.filter((i) => i.tipo_respuesta === "likert_5").map((item, idx) => ({
      itemId: item.id,
      value: (variant === "A" ? (idx % 2 === 0 ? 5 : 4) : idx % 3 === 0 ? 4 : 5) as LikertValue,
    })),
    filters: CORE_ITEMS.filter((i) => i.tipo_respuesta === "seleccion_multiple").map((item) => {
      if (item.subcategoria === "identidad_genero") {
        return { itemId: item.id, selected: [variant === "A" ? "mujer" : "hombre"] };
      }
      if (item.subcategoria === "orientacion_sexual") {
        return { itemId: item.id, selected: ["bisexual/pansexual"] };
      }
      return { itemId: item.id, selected: ["relación seria", "amistad"] };
    }),
  };
}

describe("Fase 6 E2E smoke flow", () => {
  it("runs the full flow: 2 compatible users -> fixed colors -> incremental romance & amistad matches -> deduplicated constellation -> 3 sealed questions -> automatic free chat (<=300 graphemes)", async () => {
    const store = new MemoryStore();
    const profiles = memoryProfiles(store);
    const matches = memoryMatches(store);
    const notifications = memoryNotifications(store);
    const quizDeps = {
      profiles,
      matches,
      notifications,
      scheduler: instantScheduler,
      secret: SECRET,
      latentScorer: ((responses) =>
        scoreLatent(MODEL, responses, MATCHING_CONFIG.quality)) satisfies SubmitQuizDeps["latentScorer"],
    };
    const resultDeps = { profiles, matches, digest };

    // 1. User A submits core quiz (plus duplicate concurrent retry with same clientKey)
    const [subA1, subA2] = await Promise.all([
      submitQuiz({ userId: USER_A, submission: buildCompatibleSubmission("A"), clientKey: "e2e-a" }, quizDeps),
      submitQuiz({ userId: USER_A, submission: buildCompatibleSubmission("A"), clientKey: "e2e-a" }, quizDeps),
    ]);
    expect(subA1.ok).toBe(true);
    expect(subA2).toEqual(subA1);
    if (!subA1.ok) return;
    const hatchedA = subA1.value.profile.identity;
    const initialColorA = hatchedA.colorId;

    // 2. User A refines an optional module -> initial color stays fixed ("como inicia")
    const optionalItems = QUIZ_ITEMS.filter(
      (i) => i.modulo === "eneagrama" && i.tipo_respuesta === "likert_5",
    ).map((i, idx) => ({ itemId: i.id, value: (idx % 2 === 0 ? 1 : 5) as LikertValue }));
    const refinedA = await refineProfile(
      { userId: USER_A, module: "eneagrama", likert: optionalItems },
      quizDeps,
    );
    expect(refinedA.ok).toBe(true);
    if (!refinedA.ok) return;
    expect(refinedA.value.profile.identity.colorId).toBe(initialColorA);
    expect(refinedA.value.profile.identity).toEqual(hatchedA);

    // 3. User B submits compatible quiz -> matches computed in romance & amistad, User A sees User B automatically
    const subB = await submitQuiz(
      { userId: USER_B, submission: buildCompatibleSubmission("B"), clientKey: "e2e-b" },
      quizDeps,
    );
    expect(subB.ok).toBe(true);
    if (!subB.ok) return;
    expect(subB.value.profile.identity.colorId!).toMatch(/^ennea-/);

    const resA = await getResult(USER_A, resultDeps);
    const resB = await getResult(USER_B, resultDeps);
    expect(resA.ok && resB.ok).toBe(true);
    if (!resA.ok || !resB.ok) return;

    expect(resA.value.matches.romance.length).toBe(1);
    expect(resA.value.matches.amistad.length).toBe(1);
    expect(resB.value.matches.romance.length).toBe(1);
    expect(resB.value.matches.amistad.length).toBe(1);

    // The frozen name is one string: the reveal, the cielo and the chat all say it.
    const nameA = formatIdentity(resA.value.identity).title;
    const nameB = formatIdentity(resB.value.identity).title;
    expect(nameA).toBe(formatIdentity(subA1.value.profile.identity).title);
    expect(nameB).toBe(formatIdentity(subB.value.profile.identity).title);
    expect(formatIdentity(resA.value.matches.romance[0]!.identity).title).toBe(nameB);
    expect(formatIdentity(resA.value.matches.amistad[0]!.identity).title).toBe(nameB);
    expect(formatIdentity(resB.value.matches.romance[0]!.identity).title).toBe(nameA);
    expect(formatIdentity(resB.value.matches.amistad[0]!.identity).title).toBe(nameA);

    // Verify constellation adaptation has zero duplicate nodes
    const publicA = parsePublicResult(resA.value);
    expect(publicA).not.toBeNull();
    const adaptedA = adaptResult(publicA!);
    expect(adaptedA).not.toBeNull();
    const romanceIds = adaptedA!.matches.filter((n) => n.track === "romance").map((n) => n.id);
    expect(new Set(romanceIds).size).toBe(romanceIds.length);

    // Verify notifications are idempotent
    const notifCountBefore = store.notifications.filter((n) => n.userId === USER_A).length;
    await notifications.notifyMatches(USER_A);
    const notifCountAfter = store.notifications.filter((n) => n.userId === USER_A).length;
    expect(notifCountAfter).toBe(notifCountBefore);

    // 4. Mutual chat acceptance -> 3 guided questions -> automatic transition to free chat
    const convStore = new ConversationStore();
    let nowMs = Date.parse("2026-11-05T12:00:00Z");
    convStore.now = () => new Date(nowMs);
    convStore.addMatch("romance", USER_A, USER_B);
    convStore.addMatch("amistad", USER_A, USER_B);
    convStore.peers.set(USER_A, {
      userId: USER_A,
      identity: resB.value.matches.romance[0]!.identity,
    });
    convStore.peers.set(USER_B, {
      userId: USER_B,
      identity: resA.value.matches.romance[0]!.identity,
    });

    const chatDeps = () => ({
      conversations: memoryConversations(convStore),
      matches,
      digest,
      clock: { now: () => new Date((nowMs += 1000)) },
    });

    await confirmAdult(USER_A, chatDeps());
    await confirmAdult(USER_B, chatDeps());

    const handleAB = matchHandle(USER_A, USER_B, digest);
    const handleBA = matchHandle(USER_B, USER_A, digest);
    const sig1 = await expressInterest(USER_A, { match: handleAB, track: "romance" }, chatDeps());
    expect(sig1).toEqual({ ok: true, value: { state: "sent" } });
    const sig2 = await expressInterest(USER_B, { match: handleBA, track: "romance" }, chatDeps());
    expect(sig2.ok && sig2.value.state === "open").toBe(true);
    if (!sig2.ok || sig2.value.state !== "open") return;
    const convId = sig2.value.conversation;

    // Play the 3 guided question rounds (indices 0, 1, 2)
    for (let roundIdx = 0; roundIdx < 3; roundIdx++) {
      // Free message before completing 3 rounds is rejected with chat.not_allowed
      const earlyMsg = await sendMessage(
        convId,
        USER_A,
        { body: "Intento antes de completar 3 preguntas", clientKey: `00000000-0000-4000-9000-00000000000${roundIdx}` },
        chatDeps(),
      );
      expect(earlyMsg).toEqual({ ok: false, error: "chat.not_allowed" });

      const viewA = await getConversation(convId, USER_A, chatDeps());
      const asker = viewA.ok && viewA.value.ask ? USER_A : USER_B;
      const other = asker === USER_A ? USER_B : USER_A;
      const askerView = await getConversation(convId, asker, chatDeps());
      const promptId = askerView.ok ? askerView.value.ask?.suggestions[0]?.id : undefined;
      expect(promptId).toBeDefined();

      await askQuestion(convId, asker, { promptId: promptId! }, chatDeps());
      await answerRound(convId, asker, { round: roundIdx, body: `Respuesta sellada ${roundIdx} A` }, chatDeps());

      // While only one side answered, the answer remains sealed to the other side
      const midView = await getConversation(convId, other, chatDeps());
      expect(midView.ok && midView.value.rounds[roundIdx]?.revealed).toBe(false);
      expect(midView.ok && midView.value.rounds[roundIdx]?.theirs).toBeNull();

      await answerRound(convId, other, { round: roundIdx, body: `Respuesta sellada ${roundIdx} B` }, chatDeps());
    }

    // After Round 3 (idx = 2) is revealed, stage is automatically "free"
    const freeView = await getConversation(convId, USER_A, chatDeps());
    expect(freeView.ok && freeView.value.stage).toBe("free");
    expect(freeView.ok && freeView.value.completedRounds).toBe(3);
    expect(freeView.ok && freeView.value.ask).toBeNull();

    // In the chat header the other person reads exactly the same name string.
    if (!freeView.ok) throw new Error("expected the conversation to be open");
    expect(formatIdentity(freeView.value.peer.identity).title).toBe(nameB);
    const viewB = await getConversation(convId, USER_B, chatDeps());
    if (!viewB.ok) throw new Error("expected the conversation to be open");
    expect(formatIdentity(viewB.value.peer.identity).title).toBe(nameA);

    // Round 4 (idx = 3) is rejected
    expect(await askQuestion(convId, USER_A, { promptId: "p001" }, chatDeps())).toEqual({
      ok: false,
      error: "chat.conflict",
    });

    // Free message of 300 graphemes (with emoji + accents) is accepted; 301 is rejected
    const emoji = "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}";
    const valid300 = `¡Hola constelación! ${emoji} ` + "x".repeat(300 - 22);
    const sentOk = await sendMessage(
      convId,
      USER_A,
      { body: valid300, clientKey: "00000000-0000-4000-9000-000000000090" },
      chatDeps(),
    );
    expect(sentOk.ok).toBe(true);
    expect(sentOk.ok && sentOk.value.messages).toHaveLength(1);

    const invalid301 = valid300 + "y";
    const sentTooLong = await sendMessage(
      convId,
      USER_B,
      { body: invalid301, clientKey: "00000000-0000-4000-9000-000000000091" },
      chatDeps(),
    );
    expect(sentTooLong).toEqual({ ok: false, error: "request.invalid" });
  });
});

