"use client";

/**
 * State of one open conversation: first load, calm polling while visible and
 * the four actions. Every reply replaces the whole conversation with what the
 * server returned (no optimistic copies). A closed lock hands control back to
 * the PIN gate; a vanished conversation becomes the neutral "gone" state.
 */
import { useCallback, useEffect, useState } from "react";

import { CHAT_CONFIG } from "@/config";
import type { ConversationDto } from "@/contracts/chat";

import { INVALID_REPLY, LOCKED, NOT_FOUND, conversationApi, type ApiResult } from "./chat-api";
import { CHAT_COPY, CONVERSATION_COPY } from "./chat-copy";
import { useVisiblePoll } from "./use-visible-poll";

export type ConversationState =
  | { kind: "loading" }
  | { kind: "gone" }
  | { kind: "error"; message: string }
  | { kind: "ready"; convo: ConversationDto };

export function conversationError(code: string): string {
  if (code === "auth.unauthorized") return CHAT_COPY.noSession;
  if (code === INVALID_REPLY) return CONVERSATION_COPY.invalidReply;
  if (code === "service.unavailable" || code === "service.misconfigured") return CHAT_COPY.unavailable;
  return CHAT_COPY.failed;
}

export interface ConversationActions {
  answer(round: number, body: string): Promise<string | null>;
  accept(): Promise<string | null>;
  send(body: string): Promise<string | null>;
  leave(): Promise<string | null>;
  reload(): Promise<void>;
}

export function useConversation(id: string, onLocked: () => void) {
  const [state, setState] = useState<ConversationState>({ kind: "loading" });

  /** Applies a reply; resolves to an error message, or `null` on success. */
  const settle = useCallback(
    (reply: ApiResult<ConversationDto>): string | null => {
      if (reply.ok) {
        setState({ kind: "ready", convo: reply.data });
        return null;
      }
      if (reply.code === LOCKED) onLocked();
      if (reply.code === NOT_FOUND) setState({ kind: "gone" });
      return conversationError(reply.code);
    },
    [onLocked],
  );

  const reload = useCallback(async () => {
    const message = settle(await conversationApi.conversation(id));
    // A failed background poll keeps what is on screen.
    if (message !== null) setState((prev) => (prev.kind === "loading" || prev.kind === "error" ? { kind: "error", message } : prev));
  }, [id, settle]);

  useEffect(() => {
    const first = window.setTimeout(() => void reload(), 0);
    return () => window.clearTimeout(first);
  }, [reload]);
  useVisiblePoll(() => void reload(), CHAT_CONFIG.conversation.pollSeconds, state.kind === "ready");

  return { state, actions: buildActions(id, settle, onLocked, reload) };
}

function buildActions(
  id: string,
  settle: (reply: ApiResult<ConversationDto>) => string | null,
  onLocked: () => void,
  reload: () => Promise<void>,
): ConversationActions {
  return {
    answer: async (round, body) => settle(await conversationApi.answer(id, round, body)),
    accept: async () => settle(await conversationApi.accept(id)),
    send: async (body) => settle(await conversationApi.send(id, body)),
    leave: async () => {
      const reply = await conversationApi.leave(id);
      // Already gone counts as done: the goal (no conversation) holds.
      if (reply.ok || reply.code === NOT_FOUND) return null;
      if (reply.code === LOCKED) onLocked();
      return conversationError(reply.code);
    },
    reload,
  };
}
