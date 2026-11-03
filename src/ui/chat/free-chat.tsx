"use client";

/**
 * Free chat: pixel-frame bubbles (yours on the right, also labelled "Tú" so
 * the side is not the only cue), oldest first. The list is a polite live
 * region, so new messages are announced without stealing focus.
 */
import { useEffect, useRef } from "react";

import type { ChatMessageDto, ConversationDto } from "@/contracts/chat";

import { CONVERSATION_COPY } from "./chat-copy";
import { TextComposer } from "./text-composer";

const MESSAGE_ROWS = 2;
const TIME_FORMAT = new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit" });

function timeOf(at: string): string | null {
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? null : TIME_FORMAT.format(date);
}

function Bubble({ message, alias }: { message: ChatMessageDto; alias: string }) {
  const time = timeOf(message.at);
  return (
    <li className="zm-bubble" data-mine={message.mine || undefined}>
      <div className="zm-box zm-bubble__box">
        <p className="zm-bubble__who">
          {message.mine ? CONVERSATION_COPY.mine : alias}
          {time ? <time className="zm-chat__when" dateTime={message.at}> · {time}</time> : null}
        </p>
        <p className="zm-bubble__text">{message.body}</p>
      </div>
    </li>
  );
}

export interface FreeChatProps {
  convo: ConversationDto;
  onSend(body: string): Promise<string | null>;
}

export function FreeChat({ convo, onSend }: FreeChatProps) {
  const endRef = useRef<HTMLLIElement | null>(null);
  const lastId = convo.messages.at(-1)?.id;
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [lastId]);

  return (
    <section className="zm-free" aria-labelledby="free-chat">
      <h3 id="free-chat" className="zm-chat__title">{CONVERSATION_COPY.freeTitle}</h3>
      {convo.messages.length === 0 ? <p className="zm-detail__muted">{CONVERSATION_COPY.freeEmpty}</p> : null}
      <ol className="zm-free__list" aria-label={CONVERSATION_COPY.messagesLabel} aria-live="polite" aria-relevant="additions">
        {convo.messages.map((message) => (
          <Bubble key={message.id} message={message} alias={convo.peer.alias} />
        ))}
        <li ref={endRef} aria-hidden="true" className="zm-free__end" />
      </ol>
      <TextComposer label={CONVERSATION_COPY.messageLabel} submitLabel={CONVERSATION_COPY.messageSend} limit={convo.limits.messageChars} rows={MESSAGE_ROWS} onSubmit={onSend} />
    </section>
  );
}
