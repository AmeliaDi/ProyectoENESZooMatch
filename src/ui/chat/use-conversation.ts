"use client";

/**
 * State of one open conversation: first load, calm polling while visible
 * (backing off when nothing changes), and every action. Each reply replaces
 * the whole conversation with what the server returned. Messages carry a
 * client key so a retry after a network error never duplicates them; the
 * pending one is shown as "enviando…/no se envió" until the server confirms.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CHAT_CONFIG } from "@/config";
import type { ConversationDto, ReportReason } from "@/contracts/chat";

import { INVALID_REPLY, LOCKED, NETWORK_FAILURE, NOT_FOUND, conversationApi, type ApiResult } from "./chat-api";
import { CHAT_COPY, CONVERSATION_COPY, errorCopy } from "./chat-copy";
import { useBackoffPoll } from "./use-visible-poll";

export type ConversationState =
  | { kind: "loading" }
  | { kind: "gone" }
  | { kind: "error"; message: string }
  | { kind: "ready"; convo: ConversationDto };

export interface PendingMessage {
  clientKey: string;
  body: string;
  status: "sending" | "failed";
}

export function conversationError(code: string): string {
  if (code === "auth.unauthorized") return CHAT_COPY.noSession;
  if (code === INVALID_REPLY) return CONVERSATION_COPY.invalidReply;
  if (code === "service.unavailable" || code === "service.misconfigured") return CHAT_COPY.unavailable;
  return errorCopy(code) ?? CHAT_COPY.failed;
}

export interface ConversationActions {
  ask(question: { promptId: string } | { customText: string }): Promise<string | null>;
  others(): void;
  answer(round: number, body: string): Promise<string | null>;
  pass(round: number): Promise<string | null>;
  react(round: number, emoji: string | null): Promise<string | null>;
  feedback(round: number, liked: boolean): Promise<string | null>;
  free(ready: boolean): Promise<string | null>;
  send(body: string): Promise<string | null>;
  retry(pending: PendingMessage): Promise<string | null>;
  older(): Promise<void>;
  pause(on: boolean): Promise<string | null>;
  mute(on: boolean): Promise<string | null>;
  deleteMine(): Promise<string | null>;
  exit(kind: "leave" | "block"): Promise<string | null>;
  report(reason: ReportReason): Promise<string | null>;
  reload(): Promise<void>;
}

/** Signature of what matters for polling backoff (new answers, messages or stage). */
const signature = (c: ConversationDto) => `${c.stage}:${c.rounds.length}:${c.rounds.map((r) => `${r.revealed}${r.mine !== null}`).join("")}:${c.messages.at(-1)?.id ?? ""}`;

export function useConversation(id: string, onLocked: () => void) {
  const [state, setState] = useState<ConversationState>({ kind: "loading" });
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [refresh, setRefresh] = useState(0);
  const changed = useRef(false);

  const settle = useCallback((reply: ApiResult<ConversationDto>): string | null => {
    if (reply.ok) {
      setState((prev) => {
        if (prev.kind !== "ready") return { kind: "ready", convo: reply.data };
        changed.current = signature(prev.convo) !== signature(reply.data);
        // Keep older pages already loaded above the newest page.
        const kept = prev.convo.messages.filter((m) => !reply.data.messages.some((n) => n.id === m.id) && m.at < (reply.data.messages[0]?.at ?? ""));
        return { kind: "ready", convo: { ...reply.data, messages: [...kept, ...reply.data.messages], hasOlder: kept.length > 0 ? prev.convo.hasOlder : reply.data.hasOlder } };
      });
      return null;
    }
    if (reply.code === LOCKED) onLocked();
    if (reply.code === NOT_FOUND) setState({ kind: "gone" });
    return conversationError(reply.code);
  }, [onLocked]);

  const reload = useCallback(async () => {
    const message = settle(await conversationApi.conversation(id, { refresh }));
    if (message !== null) setState((prev) => (prev.kind === "loading" || prev.kind === "error" ? { kind: "error", message } : prev));
  }, [id, settle, refresh]);

  useEffect(() => {
    const first = window.setTimeout(() => void reload(), 0);
    return () => window.clearTimeout(first);
  }, [reload]);
  useBackoffPoll(async () => {
    changed.current = false;
    await reload();
    return changed.current;
  }, CHAT_CONFIG.conversation.pollSeconds, CHAT_CONFIG.conversation.pollMaxSeconds, state.kind === "ready");

  const oldestAt = state.kind === "ready" ? (state.convo.messages[0]?.at ?? null) : null;
  const actions = useMemo(
    () => buildActions({
      id, settle, onLocked, reload, setPending, setState,
      // A new refresh value re-creates `reload`, and the effect above fetches the next cards.
      resetCards: () => setRefresh(0),
      nextCards: () => setRefresh((n) => n + 1),
      oldest: () => oldestAt,
    }),
    [id, settle, onLocked, reload, oldestAt],
  );
  return { state, pending, actions };
}

interface ActionDeps {
  id: string;
  settle(reply: ApiResult<ConversationDto>): string | null;
  onLocked(): void;
  reload(): Promise<void>;
  resetCards(): void;
  nextCards(): void;
  setPending: React.Dispatch<React.SetStateAction<PendingMessage[]>>;
  setState: React.Dispatch<React.SetStateAction<ConversationState>>;
  /** ISO time of the oldest message on screen. */
  oldest(): string | null;
}

/** Older page + what is on screen, without duplicates; `hasOlder` comes from the older page. */
export function mergeOlder(current: ConversationDto, older: ConversationDto): ConversationDto {
  const seen = new Set(current.messages.map((m) => m.id));
  return { ...current, messages: [...older.messages.filter((m) => !seen.has(m.id)), ...current.messages], hasOlder: older.hasOlder };
}

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, "0").slice(-12)}`;
}

function buildActions(d: ActionDeps): ConversationActions {
  const { id, settle } = d;
  async function deliver(item: PendingMessage): Promise<string | null> {
    d.setPending((list) => [...list.filter((p) => p.clientKey !== item.clientKey), { ...item, status: "sending" }]);
    const reply = await conversationApi.send(id, item.body, item.clientKey);
    const failure = settle(reply);
    const network = !reply.ok && reply.code === NETWORK_FAILURE;
    d.setPending((list) => (failure === null || !network ? list.filter((p) => p.clientKey !== item.clientKey) : list.map((p) => (p.clientKey === item.clientKey ? { ...p, status: "failed" } : p))));
    return network ? null : failure;
  }
  async function exit(run: () => Promise<ApiResult<true>>): Promise<string | null> {
    const reply = await run();
    if (reply.ok || reply.code === NOT_FOUND) {
      d.setState({ kind: "gone" });
      return null;
    }
    if (reply.code === LOCKED) d.onLocked();
    return conversationError(reply.code);
  }
  return {
    ask: async (question) => {
      d.resetCards();
      return settle(await conversationApi.ask(id, question));
    },
    others: () => d.nextCards(),
    answer: async (round, body) => settle(await conversationApi.answer(id, round, body)),
    pass: async (round) => settle(await conversationApi.pass(id, round)),
    react: async (round, emoji) => settle(await conversationApi.react(id, round, emoji)),
    feedback: async (round, liked) => settle(await conversationApi.feedback(id, round, liked)),
    free: async (ready) => settle(await conversationApi.free(id, ready)),
    send: (body) => deliver({ clientKey: newKey(), body, status: "sending" }),
    retry: (item) => deliver(item),
    older: async () => {
      const oldest = d.oldest();
      if (!oldest) return;
      const reply = await conversationApi.conversation(id, { before: oldest });
      if (!reply.ok) return;
      d.setState((prev) => (prev.kind === "ready" ? { kind: "ready", convo: mergeOlder(prev.convo, reply.data) } : prev));
    },
    pause: async (on) => settle(await conversationApi.pause(id, on)),
    mute: async (on) => settle(await conversationApi.mute(id, on)),
    deleteMine: async () => settle(await conversationApi.deleteMine(id)),
    exit: (kind) => exit(() => (kind === "leave" ? conversationApi.leave(id) : conversationApi.block(id))),
    report: (reason) => exit(() => conversationApi.report(id, reason)),
    reload: d.reload,
  };
}
