/**
 * Browser client of `/api/chat/*`. The lock cookie is httpOnly and scoped to
 * `/api/chat`, so the page learns the state only through `/api/chat/status`.
 */
export interface ChatStatus {
  hasPin: boolean;
  unlocked: boolean;
  resetOnly: boolean;
  recentFailures: number;
  retryAfter?: number;
  recovery?: { readyAt: string; ready: boolean };
}

export type ChatReply =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; code: string; retryAfter?: number; attemptsLeft?: number };

const NETWORK_FAILURE = "network.failed";

async function call(path: string, method: string, body?: unknown): Promise<ChatReply> {
  const init: RequestInit = { method, cache: "no-store", credentials: "same-origin" };
  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`/api/chat/${path}`, init).catch(() => null);
  if (!res) return { ok: false, code: NETWORK_FAILURE };
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok) return { ok: true, body: json };
  const numberOf = (key: string) => (typeof json[key] === "number" ? (json[key] as number) : undefined);
  const retryAfter = numberOf("retryAfter");
  const attemptsLeft = numberOf("attemptsLeft");
  return {
    ok: false,
    code: typeof json.code === "string" ? json.code : "service.unavailable",
    ...(retryAfter === undefined ? {} : { retryAfter }),
    ...(attemptsLeft === undefined ? {} : { attemptsLeft }),
  };
}

export const chatApi = {
  status: () => call("status", "GET"),
  create: (pin: string, confirm: string) => call("pin", "POST", { pin, confirm }),
  change: (current: string, pin: string, confirm: string) => call("pin", "PUT", { current, pin, confirm }),
  unlock: (pin: string) => call("unlock", "POST", { pin }),
  lock: () => call("lock", "POST"),
  requestRecovery: (matricula: string) => call("recovery", "POST", { matricula }),
  cancelRecovery: (pin: string) => call("recovery", "DELETE", { pin }),
  completeRecovery: (pin: string, confirm: string) => call("recovery/complete", "POST", { pin, confirm }),
  activity: () => call("activity", "GET"),
};

export function toStatus(body: Record<string, unknown>): ChatStatus {
  const recovery = body.recovery as { readyAt?: unknown; ready?: unknown } | undefined;
  return {
    hasPin: body.hasPin === true,
    unlocked: body.unlocked === true,
    resetOnly: body.resetOnly === true,
    recentFailures: typeof body.recentFailures === "number" ? body.recentFailures : 0,
    ...(typeof body.retryAfter === "number" ? { retryAfter: body.retryAfter } : {}),
    ...(recovery && typeof recovery.readyAt === "string"
      ? { recovery: { readyAt: recovery.readyAt, ready: recovery.ready === true } }
      : {}),
  };
}

/** Best-effort lock when the page is hidden; the idle expiry is the real guarantee. */
export function lockOnHide(): void {
  if (typeof navigator.sendBeacon === "function") navigator.sendBeacon("/api/chat/lock");
  else void fetch("/api/chat/lock", { method: "POST", keepalive: true }).catch(() => undefined);
}
