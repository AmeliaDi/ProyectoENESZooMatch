import { describe, expect, it } from "vitest";

import { canOpenTrack, isCoolingDown, isSignalLive, signalExpiresAt, signalRefusal } from "./signals";

const POLICY = { expireDays: 7, maxOpen: 5, cooldownDays: 14 };
const T0 = new Date("2026-11-04T10:00:00Z");
const days = (d: number) => new Date(T0.getTime() + d * 86_400_000);
const ctx = { track: "amistad" as const, senderAdult: false, openSignals: 0, blocked: false, closedAt: null };

describe("interest signals", () => {
  it("expire silently after the configured days", () => {
    expect(isSignalLive(T0, days(6.9), POLICY)).toBe(true);
    expect(isSignalLive(T0, days(7), POLICY)).toBe(false);
    expect(signalExpiresAt(T0, POLICY)).toEqual(days(7));
  });

  it("refuse romance without the sender's own 18+ flag, never because of the receiver", () => {
    expect(signalRefusal({ ...ctx, track: "romance" }, T0, POLICY)).toBe("adult_required");
    expect(signalRefusal({ ...ctx, track: "romance", senderAdult: true }, T0, POLICY)).toBeNull();
    expect(canOpenTrack("romance", { a: true, b: false })).toBe(false);
    expect(canOpenTrack("amistad", { a: false, b: false })).toBe(true);
  });

  it("cap open signals and cool down after a close", () => {
    expect(signalRefusal({ ...ctx, openSignals: 5 }, T0, POLICY)).toBe("too_many");
    expect(signalRefusal({ ...ctx, closedAt: days(-3) }, T0, POLICY)).toBe("cooldown");
    expect(isCoolingDown(days(-14), T0, POLICY)).toBe(false);
  });

  it("treat a block before anything else", () => {
    expect(signalRefusal({ ...ctx, blocked: true, openSignals: 9 }, T0, POLICY)).toBe("blocked");
  });
});
