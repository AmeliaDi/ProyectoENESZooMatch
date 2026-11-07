/**
 * The shared interest store is what turns a spoke gold and what the detail
 * sheet reads. The bug it guards: it loaded once per page, so when the other
 * person accepted on their phone the sender's screen stayed "señal enviada"
 * until a full reload (docs/DIAGNOSTICO_CHAT.md §4).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("./chat-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./chat-api")>()),
  request,
}));

const SECOND = 1000;
const CONVERSATION = "3f2b8c14-5d67-4a91-8e03-9b7c2d514a6f";

function served(states: Record<string, unknown>, adult = true): void {
  request.mockResolvedValue({ ok: true, body: { states, adult } });
}

async function store() {
  vi.resetModules();
  return import("./interest-api");
}

let win: EventTarget & { setTimeout(fn: () => void, ms: number): number; clearTimeout(id: number): void };
let doc: EventTarget & { hidden: boolean };

beforeEach(() => {
  vi.useFakeTimers();
  request.mockReset();
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

describe("interest store", () => {
  it("ve la apertura mutua sin recargar la página", async () => {
    const api = await store();
    served({ "amistad:m1": { state: "sent" } });
    const seen: string[] = [];
    const unsubscribe = api.subscribeInterest(() => seen.push(JSON.stringify(api.readInterest())));
    await api.loadInterest();
    expect(api.readInterest()).toMatchObject({ kind: "ready", states: { "amistad:m1": { state: "sent" } } });

    // The other person accepts on their own device.
    served({ "amistad:m1": { state: "open", conversation: CONVERSATION } });
    await vi.advanceTimersByTimeAsync(8 * SECOND);
    expect(api.readInterest()).toMatchObject({
      kind: "ready",
      states: { "amistad:m1": { state: "open", conversation: CONVERSATION } },
    });
    expect(seen.length, "subscribers hear about it").toBeGreaterThan(1);
    unsubscribe();
  });

  it("una invitación que llega mientras miro la constelación aparece sola", async () => {
    const api = await store();
    served({});
    const unsubscribe = api.subscribeInterest(() => {});
    await api.loadInterest();
    served({ "romance:m2": { state: "invited" } });
    await vi.advanceTimersByTimeAsync(8 * SECOND);
    expect(api.readInterest()).toMatchObject({ kind: "ready", states: { "romance:m2": { state: "invited" } } });
    unsubscribe();
  });

  it("un solo sondeo por página aunque haya varias hojas abiertas", async () => {
    const api = await store();
    served({});
    const off = [api.subscribeInterest(() => {}), api.subscribeInterest(() => {}), api.subscribeInterest(() => {})];
    await api.loadInterest();
    request.mockClear();
    await vi.advanceTimersByTimeAsync(8 * SECOND);
    expect(request).toHaveBeenCalledTimes(1);
    for (const stop of off) stop();
  });

  it("deja de sondear cuando se va la última pantalla", async () => {
    const api = await store();
    served({});
    const first = api.subscribeInterest(() => {});
    const second = api.subscribeInterest(() => {});
    await api.loadInterest();
    first();
    request.mockClear();
    await vi.advanceTimersByTimeAsync(8 * SECOND);
    expect(request, "the remaining screen keeps it alive").toHaveBeenCalledTimes(1);
    second();
    request.mockClear();
    await vi.advanceTimersByTimeAsync(120 * SECOND);
    expect(request).not.toHaveBeenCalled();
  });

  it("una lectura idéntica no repinta la constelación", async () => {
    const api = await store();
    served({ "amistad:m1": { state: "sent" } });
    const listener = vi.fn();
    const unsubscribe = api.subscribeInterest(listener);
    await api.loadInterest();
    const before = api.readInterest();
    listener.mockClear();
    await vi.advanceTimersByTimeAsync(8 * SECOND);
    expect(listener).not.toHaveBeenCalled();
    expect(api.readInterest(), "same object, so useSyncExternalStore stays quiet").toBe(before);
    unsubscribe();
  });

  it("un tropiezo de red en segundo plano conserva lo que ya se veía", async () => {
    const api = await store();
    served({ "amistad:m1": { state: "sent" } });
    const unsubscribe = api.subscribeInterest(() => {});
    await api.loadInterest();
    request.mockResolvedValue({ ok: false, code: "network.failed" });
    await vi.advanceTimersByTimeAsync(8 * SECOND);
    expect(api.readInterest()).toMatchObject({ kind: "ready", states: { "amistad:m1": { state: "sent" } } });

    served({ "amistad:m1": { state: "open", conversation: CONVERSATION } });
    await vi.advanceTimersByTimeAsync(16 * SECOND);
    expect(api.readInterest()).toMatchObject({ kind: "ready", states: { "amistad:m1": { state: "open" } } });
    unsubscribe();
  });

  it("si la primera lectura falla sí lo dice, con su código", async () => {
    const api = await store();
    request.mockResolvedValue({ ok: false, code: "auth.unauthorized" });
    const unsubscribe = api.subscribeInterest(() => {});
    await api.loadInterest();
    expect(api.readInterest()).toEqual({ kind: "error", code: "auth.unauthorized" });
    unsubscribe();
  });

  it("refreshInterest avisa si hubo cambio, para reiniciar el backoff", async () => {
    const api = await store();
    served({ "amistad:m1": { state: "sent" } });
    await api.loadInterest();
    expect(await api.refreshInterest()).toBe(false);
    served({ "amistad:m1": { state: "open", conversation: CONVERSATION } });
    expect(await api.refreshInterest()).toBe(true);
    expect(await api.refreshInterest()).toBe(false);
  });
});