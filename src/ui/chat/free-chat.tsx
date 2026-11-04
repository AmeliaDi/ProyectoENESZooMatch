"use client";

/**
 * Free chat: pixel-frame bubbles with the animal sprite as avatar (yours on
 * the right, also labelled "Tú" so the side is not the only cue), oldest
 * first, in the reading font. `role="log"` announces new messages politely.
 * Pending messages show "enviando…" / "no se envió" (tap to retry). There is
 * never a "visto".
 */
import { useEffect, useRef } from "react";

import type { ChatMessageDto, ConversationDto } from "@/contracts/chat";
import { Button } from "@/ui/kit/button";

import { CONVERSATION_COPY } from "./chat-copy";
import { PeerSprite } from "./peer-sprite";
import { TextComposer } from "./text-composer";
import type { ConversationActions, PendingMessage } from "./use-conversation";

const MESSAGE_ROWS = 2;
const AVATAR_SIZE = 28;
const TIME_FORMAT = new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit" });

function timeOf(at: string): string | null {
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? null : TIME_FORMAT.format(date);
}

function Bubble({ message, convo }: { message: ChatMessageDto; convo: ConversationDto }) {
  const time = timeOf(message.at);
  return (
    <li className="zm-bubble" data-mine={message.mine || undefined}>
      {message.mine ? null : <PeerSprite peer={convo.peer} size={AVATAR_SIZE} />}
      <div className="zm-box zm-bubble__box">
        <p className="zm-bubble__who">
          {message.mine ? CONVERSATION_COPY.mine : convo.peer.alias}
          {time ? <time className="zm-chat__when zm-num" dateTime={message.at}> · {time}</time> : null}
        </p>
        <p className="zm-bubble__text">{message.body}</p>
      </div>
    </li>
  );
}

function PendingBubble({ item, onRetry }: { item: PendingMessage; onRetry(): void }) {
  return (
    <li className="zm-bubble" data-mine="true" data-pending={item.status}>
      <div className="zm-box zm-bubble__box">
        <p className="zm-bubble__who">{CONVERSATION_COPY.mine}</p>
        <p className="zm-bubble__text">{item.body}</p>
        {item.status === "sending" ? (
          <p className="zm-bubble__state">{CONVERSATION_COPY.sending}</p>
        ) : (
          <Button variant="ghost" className="zm-bubble__state" onClick={onRetry}>{CONVERSATION_COPY.sendFailed}</Button>
        )}
      </div>
    </li>
  );
}

export interface FreeChatProps {
  convo: ConversationDto;
  pending: readonly PendingMessage[];
  actions: ConversationActions;
}

export function FreeChat({ convo, pending, actions }: FreeChatProps) {
  const endRef = useRef<HTMLLIElement | null>(null);
  const lastId = convo.messages.at(-1)?.id;
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [lastId, pending.length]);

  return (
    <section className="zm-free" aria-labelledby="free-chat">
      <h3 id="free-chat" className="zm-chat__title">{CONVERSATION_COPY.freeTitle}</h3>
      {convo.hasOlder ? <Button variant="ghost" onClick={() => void actions.older()}>{CONVERSATION_COPY.olderMessages}</Button> : null}
      {convo.messages.length === 0 && pending.length === 0 ? <p className="zm-detail__muted">{CONVERSATION_COPY.freeEmpty}</p> : null}
      <ol className="zm-free__list" role="log" aria-label={CONVERSATION_COPY.messagesLabel} aria-live="polite" aria-relevant="additions">
        {convo.messages.map((message) => <Bubble key={message.id} message={message} convo={convo} />)}
        {pending.map((item) => <PendingBubble key={item.clientKey} item={item} onRetry={() => void actions.retry(item)} />)}
        <li ref={endRef} aria-hidden="true" className="zm-free__end" />
      </ol>
      {convo.stage === "free" ? (
        <TextComposer label={CONVERSATION_COPY.messageLabel} submitLabel={CONVERSATION_COPY.messageSend} limit={convo.limits.messageChars} rows={MESSAGE_ROWS} onSubmit={actions.send} />
      ) : null}
    </section>
  );
}
