import { describe, expect, it } from "vitest";

import { CHAT_CONFIG } from "@/config";

import {
  CLEAR_ATTEMPTS,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  assessPin,
  chargeAttempt,
  checkLockSession,
  hasPinFormat,
  isRecoveryReady,
  isRepetition,
  isResetOnly,
  isStepSequence,
  lockSessionMaxAge,
  openLockSession,
  pauseSecondsLeft,
  recoveryReadyAt,
  touchLockSession,
  waitMinutesFor,
  type AttemptState,
} from ".";

const RULES = CHAT_CONFIG.pin;
const POLICY = CHAT_CONFIG.attempts;
const LOCK = CHAT_CONFIG.lock;
const T0 = new Date("2026-11-02T12:00:00.000Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

const ALL_PINS = Array.from({ length: 10_000 }, (_, i) => String(i).padStart(4, "0"));

describe("PIN format", () => {
  it("accepts exactly four ASCII digits and fixes nothing", () => {
    expect(hasPinFormat("4826", 4)).toBe(true);
    for (const bad of ["482", "48261", " 4826", "48 6", "abcd", "４８２６", "-482", ""]) {
      expect(hasPinFormat(bad, 4), bad).toBe(false);
      expect(assessPin(bad, RULES), bad).toBe("format");
    }
  });
});

describe("trivial PIN", () => {
  it("rejects the 10 repetitions", () => {
    const reps = ALL_PINS.filter(isRepetition);
    expect(reps).toEqual(["0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999"]);
    for (const pin of reps) expect(assessPin(pin, RULES)).toBe("weak");
  });

  it("rejects exactly the 14 ±1 sequences", () => {
    const seqs = ALL_PINS.filter(isStepSequence);
    expect(seqs).toHaveLength(14);
    expect(seqs).toEqual(expect.arrayContaining(["0123", "6789", "9876", "3210", "4567", "5432"]));
    for (const pin of seqs) expect(assessPin(pin, RULES)).toBe("weak");
    expect(isStepSequence("0246")).toBe(false);
    expect(isStepSequence("8901")).toBe(false);
  });

  it("rejects the configured blocklist", () => {
    expect(RULES.blocklist).toEqual(["1212", "2580", "1004", "2000", "6969", "1122"]);
    for (const pin of RULES.blocklist) expect(assessPin(pin, RULES)).toBe("weak");
  });

  it("allows years and everything else", () => {
    expect(assessPin("1999", RULES)).toBe("ok");
    expect(assessPin("2007", RULES)).toBe("ok");
    expect(assessPin("4826", RULES)).toBe("ok");
    const weak = ALL_PINS.filter((pin) => assessPin(pin, RULES) === "weak");
    expect(weak).toHaveLength(10 + 14 + RULES.blocklist.length);
  });
});

function failTimes(state: AttemptState, count: number, now: Date): AttemptState {
  let current = state;
  for (let i = 0; i < count; i += 1) current = chargeAttempt(current, now, POLICY).state;
  return current;
}

describe("growing pauses", () => {
  it("pauses 1, 5, 15 and then 60 minutes per block of five failures", () => {
    expect(POLICY.perStep).toBe(5);
    let state: AttemptState = { ...CLEAR_ATTEMPTS };
    let now = T0;
    for (const minutes of [1, 5, 15, 60, 60]) {
      state = failTimes(state, POLICY.perStep - 1, now);
      expect(pauseSecondsLeft(state, now)).toBe(0);
      const charged = chargeAttempt(state, now, POLICY);
      expect(charged.pauses).toBe(true);
      state = charged.state;
      expect(pauseSecondsLeft(state, now)).toBe(minutes * 60);
      now = new Date(now.getTime() + minutes * MS_PER_MINUTE);
      expect(pauseSecondsLeft(state, now)).toBe(0);
    }
  });

  it("repeats the last wait for later steps", () => {
    expect(waitMinutesFor(0, POLICY)).toBe(1);
    expect(waitMinutesFor(3, POLICY)).toBe(60);
    expect(waitMinutesFor(42, POLICY)).toBe(60);
  });

  it("allows only a reset after four pauses of 60 minutes", () => {
    let state: AttemptState = { ...CLEAR_ATTEMPTS };
    for (let pause = 0; pause < 3 + POLICY.resetOnlyAfterMaxPauses; pause += 1) {
      expect(isResetOnly(state, POLICY)).toBe(false);
      state = failTimes(state, POLICY.perStep, T0);
    }
    expect(state.longPauses).toBe(4);
    expect(isResetOnly(state, POLICY)).toBe(true);
  });
});

describe("lock session", () => {
  const session = openLockSession("user-1", T0, LOCK);

  it("is open right after unlocking and only for its user", () => {
    expect(checkLockSession(session, "user-1", T0, LOCK)).toBe("open");
    expect(checkLockSession(session, "user-2", T0, LOCK)).toBe("other_user");
  });

  it("closes after the idle window, renewed by activity", () => {
    const idle = LOCK.idleMinutes * MS_PER_MINUTE;
    expect(checkLockSession(session, "user-1", at(idle - 1), LOCK)).toBe("open");
    expect(checkLockSession(session, "user-1", at(idle), LOCK)).toBe("idle");
    const touched = touchLockSession(session, at(idle - 1));
    expect(checkLockSession(touched, "user-1", at(idle + idle / 2), LOCK)).toBe("open");
  });

  it("closes at the hard maximum even with activity", () => {
    const max = LOCK.maxMinutes * MS_PER_MINUTE;
    const busy = touchLockSession(session, at(max - 1));
    expect(checkLockSession(busy, "user-1", at(max - 1), LOCK)).toBe("open");
    expect(checkLockSession(busy, "user-1", at(max), LOCK)).toBe("expired");
    expect(lockSessionMaxAge(session, T0)).toBe(LOCK.maxMinutes * 60);
  });

  it("rejects timestamps from the future or a stretched expiry", () => {
    expect(checkLockSession({ ...session, iat: at(1).getTime() }, "user-1", T0, LOCK)).toBe("future");
    const stretched = { ...session, exp: session.exp + MS_PER_HOUR };
    expect(checkLockSession(stretched, "user-1", T0, LOCK)).toBe("expired");
  });
});

describe("recovery wait", () => {
  it("is ready exactly after the configured hours", () => {
    const hours = CHAT_CONFIG.recovery.waitHours;
    expect(hours).toBe(24);
    expect(recoveryReadyAt(T0, hours).toISOString()).toBe("2026-11-03T12:00:00.000Z");
    expect(isRecoveryReady(T0, at(hours * MS_PER_HOUR - 1), hours)).toBe(false);
    expect(isRecoveryReady(T0, at(hours * MS_PER_HOUR), hours)).toBe(true);
  });
});
