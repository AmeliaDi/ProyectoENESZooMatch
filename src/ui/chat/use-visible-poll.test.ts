/**
 * The poll that replaces Realtime (ADR-039). The bug it guards: a phone coming
 * back to the app fires `focus` without `visibilitychange`, so a poller that
 * only listened for the latter stayed asleep at its longest delay and the chat
 * the other person had just accepted never appeared.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { startBackoffPoll } from "./use-visible-poll";

let win: EventTarget & { setTimeout(fn: () => void, ms: number): number; clearTimeout(id: number): void };
let doc: EventTarget & { hidden: boolean };

beforeEach(() => {
  vi.useFakeTimers();
  win = Object.assign(new EventTarget(), {
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms) as unknown as number,
    clearTimeout: (id: number) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>),
  });
  doc = Object.assign(new EventTarget(), { hidden: false });
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const SECOND = 1000;

describe("startBackoffPoll", () => {
  it("espera el intervalo antes de la primera lectura", async () => {
    const tick = vi.fn(async () => false);
    const stop = startBackoffPoll(tick, 8, 60);
    await vi.advanceTimersByTimeAsync(7 * SECOND);
    expect(tick).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1 * SECOND);
    expect(tick).toHaveBeenCalledTimes(1);
    stop();
  });

  it("duplica el intervalo cuando no hay novedad y se topa en el máximo", async () => {
    const tick = vi.fn(async () => false);
    const stop = startBackoffPoll(tick, 2, 8);
    for (const wait of [2, 4, 8, 8, 8]) {
      await vi.advanceTimersByTimeAsync(wait * SECOND);
    }
    expect(tick).toHaveBeenCalledTimes(5);
    await vi.advanceTimersByTimeAsync(7 * SECOND);
    expect(tick).toHaveBeenCalledTimes(5);
    stop();
  });

  it("vuelve al intervalo corto en cuanto hay novedad", async () => {
    let novelty = false;
    const tick = vi.fn(async () => novelty);
    const stop = startBackoffPoll(tick, 2, 16);
    await vi.advanceTimersByTimeAsync(2 * SECOND);
    await vi.advanceTimersByTimeAsync(4 * SECOND);
    await vi.advanceTimersByTimeAsync(8 * SECOND);
    expect(tick).toHaveBeenCalledTimes(3);
    novelty = true;
    await vi.advanceTimersByTimeAsync(16 * SECOND);
    novelty = false;
    await vi.advanceTimersByTimeAsync(2 * SECOND);
    expect(tick).toHaveBeenCalledTimes(5);
    stop();
  });

  it("despierta con focus aunque la pestaña nunca se haya ocultado", async () => {
    const tick = vi.fn(async () => false);
    const stop = startBackoffPoll(tick, 8, 60);
    await vi.advanceTimersByTimeAsync(8 * SECOND);
    expect(tick).toHaveBeenCalledTimes(1);
    // Backoff already pushed the next read 16 s away; focus must not wait.
    win.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(0);
    expect(tick).toHaveBeenCalledTimes(2);
    // Nothing new, so the calm backoff resumes from the short interval.
    await vi.advanceTimersByTimeAsync(16 * SECOND);
    expect(tick).toHaveBeenCalledTimes(3);
    stop();
  });

  it("despierta al volver la pestaña y al volver la red", async () => {
    const tick = vi.fn(async () => false);
    const stop = startBackoffPoll(tick, 8, 60);
    doc.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(tick).toHaveBeenCalledTimes(1);
    win.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);
    expect(tick).toHaveBeenCalledTimes(2);
    stop();
  });

  it("no lee mientras la pestaña está oculta, ni siquiera al recibir focus", async () => {
    const tick = vi.fn(async () => false);
    const stop = startBackoffPoll(tick, 2, 8);
    doc.hidden = true;
    win.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(60 * SECOND);
    expect(tick).not.toHaveBeenCalled();
    doc.hidden = false;
    doc.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(tick).toHaveBeenCalledTimes(1);
    stop();
  });

  it("dos despertares seguidos no lanzan dos lecturas a la vez", async () => {
    let release: () => void = () => {};
    const tick = vi.fn(() => new Promise<boolean>((resolve) => { release = () => resolve(true); }));
    const stop = startBackoffPoll(tick, 8, 60);
    win.dispatchEvent(new Event("focus"));
    win.dispatchEvent(new Event("online"));
    doc.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(tick).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(0);
    stop();
  });

  it("un fallo de la lectura cuenta como sin novedad y no rompe el ciclo", async () => {
    const tick = vi.fn(async () => { throw new Error("red caída"); });
    const stop = startBackoffPoll(tick, 2, 4);
    await vi.advanceTimersByTimeAsync(2 * SECOND);
    await vi.advanceTimersByTimeAsync(4 * SECOND);
    expect(tick).toHaveBeenCalledTimes(2);
    stop();
  });

  it("al parar cancela el temporizador y suelta los tres despertares", async () => {
    const tick = vi.fn(async () => false);
    const stop = startBackoffPoll(tick, 2, 8);
    stop();
    win.dispatchEvent(new Event("focus"));
    win.dispatchEvent(new Event("online"));
    doc.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(60 * SECOND);
    expect(tick).not.toHaveBeenCalled();
  });
});