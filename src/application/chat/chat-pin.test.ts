import { beforeEach, describe, expect, it } from "vitest";

import { CHAT_CONFIG } from "@/config";
import { MS_PER_HOUR, MS_PER_MINUTE } from "@/domain/chat";
import type { Clock } from "@/domain/shared";

import { deleteMyData } from "../privacy";
import {
  MemoryStore,
  instantScheduler,
  memoryChatPins,
  memoryMatches,
  memoryMatriculas,
  memoryProfiles,
  plainPinHasher,
} from "../testing/in-memory";
import {
  assertChatOpen,
  cancelPinRecovery,
  changeChatPin,
  completePinRecovery,
  createChatPin,
  getChatActivity,
  getChatStatus,
  requestPinRecovery,
  unlockChat,
  type ChatRecoveryDeps,
} from ".";

const USER = "user-1";
const PIN = "4826";
const WRONG = "1357";
const MATRICULA = "000000001";
const T0 = new Date("2026-11-02T12:00:00.000Z").getTime();

let store: MemoryStore;
let now = T0;
let deps: ChatRecoveryDeps;
const clock: Clock = { now: () => new Date(now) };

beforeEach(() => {
  store = new MemoryStore();
  now = T0;
  store.matriculas.set(USER, MATRICULA);
  deps = { pins: memoryChatPins(store), hasher: plainPinHasher, matricula: memoryMatriculas(store), clock };
});

const create = () => createChatPin(USER, { pin: PIN, confirm: PIN }, deps);

async function failBlock() {
  for (let i = 0; i < CHAT_CONFIG.attempts.perStep; i += 1) await unlockChat(USER, WRONG, deps);
}

describe("create", () => {
  it("rejects trivial PINs and mismatched confirmations", async () => {
    expect(await createChatPin(USER, { pin: "1234", confirm: "1234" }, deps)).toEqual({ ok: false, error: { code: "chat.pin_weak" } });
    expect(await createChatPin(USER, { pin: PIN, confirm: "4827" }, deps)).toEqual({ ok: false, error: { code: "chat.pin_mismatch" } });
    expect(store.chatPins.size).toBe(0);
  });

  it("creates once and records the event", async () => {
    expect((await create()).ok).toBe(true);
    expect(await create()).toEqual({ ok: false, error: { code: "chat.pin_exists" } });
    expect(store.chatEvents.map((e) => e.kind)).toEqual(["created"]);
  });
});

describe("unlock", () => {
  beforeEach(create);

  it("gives a generic error with the attempts left", async () => {
    const result = await unlockChat(USER, WRONG, deps);
    expect(result).toEqual({ ok: false, error: { code: "chat.pin_invalid", attemptsLeft: 4 } });
  });

  it("pauses after five failures and refuses even the right PIN meanwhile", async () => {
    await failBlock();
    const paused = await unlockChat(USER, PIN, deps);
    expect(paused).toEqual({ ok: false, error: { code: "chat.pin_paused", retryAfter: 60 } });
    expect(store.chatEvents.map((e) => e.kind)).toContain("paused");
    now += MS_PER_MINUTE;
    expect((await unlockChat(USER, PIN, deps)).ok).toBe(true);
  });

  it("grows the pause and resets it after a success", async () => {
    await failBlock();
    now += MS_PER_MINUTE;
    await failBlock();
    expect(await unlockChat(USER, PIN, deps)).toMatchObject({ error: { retryAfter: 5 * 60 } });
    now += 5 * MS_PER_MINUTE;
    expect((await unlockChat(USER, PIN, deps)).ok).toBe(true);
    expect(store.chatPins.get(USER)?.attempts).toMatchObject({ failedAttempts: 0, pauseStep: 0, lockedUntil: null });
    await failBlock();
    expect(await unlockChat(USER, PIN, deps)).toMatchObject({ error: { retryAfter: 60 } });
  });

  it("allows only a reset after four pauses of 60 minutes", async () => {
    for (const minutes of [1, 5, 15, 60, 60, 60, 60]) {
      await failBlock();
      now += minutes * MS_PER_MINUTE;
    }
    expect(await unlockChat(USER, PIN, deps)).toEqual({ ok: false, error: { code: "chat.reset_required" } });
    expect(await assertChatOpen(USER, deps)).toEqual({ ok: false, error: { code: "chat.reset_required" } });
    const status = await getChatStatus(USER, true, deps);
    expect(status.ok && status.value).toMatchObject({ resetOnly: true, unlocked: false });
  });

  it("counts recent failures as an aggregate, not as events", async () => {
    await unlockChat(USER, WRONG, deps);
    await unlockChat(USER, WRONG, deps);
    const activity = await getChatActivity(USER, 10, deps);
    expect(activity.ok && activity.value.recentFailures).toBe(2);
    expect(store.chatEvents).toHaveLength(1);
  });
});

describe("change", () => {
  beforeEach(create);

  it("needs the current PIN and keeps the new one", async () => {
    expect((await changeChatPin(USER, { current: WRONG, pin: "5093", confirm: "5093" }, deps)).ok).toBe(false);
    expect((await changeChatPin(USER, { current: PIN, pin: "5093", confirm: "5093" }, deps)).ok).toBe(true);
    expect((await unlockChat(USER, "5093", deps)).ok).toBe(true);
    expect(store.chatEvents.map((e) => e.kind)).toEqual(["created", "changed"]);
  });
});

describe("recovery", () => {
  beforeEach(create);

  it("rejects a wrong matrícula with a generic error", async () => {
    expect(await requestPinRecovery(USER, "000000002", deps)).toEqual({ ok: false, error: { code: "chat.recovery_invalid" } });
    expect(store.chatPins.get(USER)?.recoveryRequestedAt).toBeNull();
  });

  it("closes chats during the 24 h wait and only then accepts a new PIN", async () => {
    const requested = await requestPinRecovery(USER, MATRICULA, deps);
    expect(requested).toEqual({ ok: true, value: { readyAt: "2026-11-03T12:00:00.000Z" } });
    expect(await unlockChat(USER, PIN, deps)).toEqual({ ok: false, error: { code: "chat.recovery_pending" } });
    expect(await assertChatOpen(USER, deps)).toEqual({ ok: false, error: { code: "chat.recovery_pending" } });

    now += 24 * MS_PER_HOUR - 1;
    const early = await completePinRecovery(USER, { pin: "5093", confirm: "5093" }, deps);
    expect(early).toMatchObject({ ok: false, error: { code: "chat.recovery_not_ready" } });

    now += 1;
    expect((await completePinRecovery(USER, { pin: "5093", confirm: "5093" }, deps)).ok).toBe(true);
    expect((await unlockChat(USER, "5093", deps)).ok).toBe(true);
  });

  it("can be cancelled with the current PIN", async () => {
    await requestPinRecovery(USER, MATRICULA, deps);
    expect((await cancelPinRecovery(USER, WRONG, deps)).ok).toBe(false);
    expect((await cancelPinRecovery(USER, PIN, deps)).ok).toBe(true);
    expect((await unlockChat(USER, PIN, deps)).ok).toBe(true);
    expect(store.chatEvents.map((e) => e.kind)).toEqual(["created", "recovery_requested", "recovery_cancelled"]);
  });

  it("keeps the original wait when asked twice", async () => {
    await requestPinRecovery(USER, MATRICULA, deps);
    now += MS_PER_HOUR;
    expect(await requestPinRecovery(USER, MATRICULA, deps)).toEqual({ ok: true, value: { readyAt: "2026-11-03T12:00:00.000Z" } });
  });

  it("completing touches only the PIN row", async () => {
    store.results.set(USER, { userId: USER } as never);
    await requestPinRecovery(USER, MATRICULA, deps);
    const before = store.chatPins.get(USER)?.createdAt;
    now += 24 * MS_PER_HOUR;
    await completePinRecovery(USER, { pin: "5093", confirm: "5093" }, deps);
    expect(store.results.has(USER)).toBe(true);
    expect(store.chatPins.get(USER)?.createdAt).toEqual(before);
    expect(store.chatEvents.map((e) => e.kind)).toEqual(["created", "recovery_requested", "recovery_completed"]);
  });
});

describe("status and privacy", () => {
  it("never exposes the PIN or its digest", async () => {
    await create();
    const status = await getChatStatus(USER, true, deps);
    const activity = await getChatActivity(USER, 10, deps);
    const serialized = JSON.stringify([status, activity]);
    expect(serialized).not.toContain(PIN);
    expect(serialized).not.toContain("salt");
    expect(serialized).not.toContain("hash");
  });

  it("deleting my data deletes the PIN and its events", async () => {
    await create();
    const privacy = { profiles: memoryProfiles(store), matches: memoryMatches(store), scheduler: instantScheduler };
    expect((await deleteMyData(USER, privacy)).ok).toBe(true);
    expect(store.chatPins.has(USER)).toBe(false);
    expect(store.chatEvents.filter((e) => e.userId === USER)).toEqual([]);
  });
});
