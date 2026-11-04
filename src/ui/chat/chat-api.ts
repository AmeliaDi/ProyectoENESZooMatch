/**
 * Browser client of `/api/chat/*`. The lock cookie is httpOnly and scoped to
 * `/api/chat`, so the page learns the state only through `/api/chat/status`.
 */
import type { ConversationDto, InvitationDto, ReportReason } from "@/contracts/chat";

import { isRecord, parseConversation, parseInbox, parseOk, type InboxEntry } from "./chat-parse";

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

/** A reply already parsed into its contract shape. */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; code: string };

const NETWORK_FAILURE = "network.failed";
/** The server answered 2xx but the body did not match the contract. */
export const INVALID_REPLY = "client.invalid_reply";
/** Closed lock (423): the page must go back to the PIN. */
export const LOCKED = "chat.locked";
/** The conversation no longer exists (someone left). */
export const NOT_FOUND = "chat.not_found";
export { NETWORK_FAILURE };

/** Shared by the chat and interest clients: same-origin JSON, never cached. */
export async function request(url: string, method: string, body?: unknown): Promise<ChatReply> {
  const init: RequestInit = { method, cache: "no-store", credentials: "same-origin" };
  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init).catch(() => null);
  if (!res) return { ok: false, code: NETWORK_FAILURE };
  const raw: unknown = await res.json().catch(() => null);
  const json = isRecord(raw) ? raw : {};
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

function call(path: string, method: string, body?: unknown): Promise<ChatReply> {
  return request(`/api/chat/${path}`, method, body);
}

export async function parsed<T>(reply: Promise<ChatReply>, parse: (body: unknown) => T | null): Promise<ApiResult<T>> {
  const settled = await reply;
  if (!settled.ok) return { ok: false, code: settled.code };
  const data = parse(settled.body);
  return data === null ? { ok: false, code: INVALID_REPLY } : { ok: true, data };
}

const conversationPath = (id: string, action = "") => `conversations/${encodeURIComponent(id)}${action ? `/${action}` : ""}`;

type View = Promise<ApiResult<ConversationDto>>;
const post = (id: string, action: string, body: unknown): View => parsed(call(conversationPath(id, action), "POST", body), parseConversation);

export interface ViewQuery {
  refresh?: number;
  before?: string;
}

function viewPath(id: string, query: ViewQuery): string {
  const params = new URLSearchParams();
  if (query.refresh) params.set("refresh", String(query.refresh));
  if (query.before) params.set("before", query.before);
  const search = params.toString();
  return `${conversationPath(id)}${search ? `?${search}` : ""}`;
}

/** Conversations between matches; every route requires the lock to be open. */
export const conversationApi = {
  inbox: (): Promise<ApiResult<{ conversations: InboxEntry[]; invitations: InvitationDto[] }>> => parsed(call("inbox", "GET"), parseInbox),
  conversation: (id: string, query: ViewQuery = {}): View => parsed(call(viewPath(id, query), "GET"), parseConversation),
  ask: (id: string, question: { promptId: string } | { customText: string }): View => post(id, "ask", question),
  answer: (id: string, round: number, body: string): View => post(id, "answer", { round, body }),
  pass: (id: string, round: number): View => post(id, "answer", { round, pass: true }),
  react: (id: string, round: number, emoji: string | null): View => post(id, "react", { round, emoji }),
  feedback: (id: string, round: number, liked: boolean): View => post(id, "feedback", { round, liked }),
  free: (id: string, ready: boolean): View => post(id, "free", { ready }),
  send: (id: string, body: string, clientKey: string): View => post(id, "messages", { body, clientKey }),
  pause: (id: string, on: boolean): View => post(id, "pause", { on }),
  mute: (id: string, on: boolean): View => post(id, "mute", { on }),
  deleteMine: (id: string): View => post(id, "mine", {}),
  leave: (id: string): Promise<ApiResult<true>> => parsed(call(conversationPath(id), "DELETE"), parseOk),
  block: (id: string): Promise<ApiResult<true>> => parsed(call(conversationPath(id, "block"), "POST", {}), parseOk),
  report: (id: string, reason: ReportReason): Promise<ApiResult<true>> => parsed(call(conversationPath(id, "report"), "POST", { reason }), parseOk),
};

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
    ...(recovery && typeof recovery.readyAt === "string" ? { recovery: { readyAt: recovery.readyAt, ready: recovery.ready === true } } : {}),
  };
}

/** Best-effort lock when the page is hidden; the idle expiry is the real guarantee. */
export function lockOnHide(): void {
  if (typeof navigator.sendBeacon === "function") navigator.sendBeacon("/api/chat/lock");
  else void fetch("/api/chat/lock", { method: "POST", keepalive: true }).catch(() => undefined);
}
