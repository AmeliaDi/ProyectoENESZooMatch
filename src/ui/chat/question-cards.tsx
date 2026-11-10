"use client";

/**
 * "Pregunta del turno": three pixel-frame cards to choose from, "otras tres",
 * and (only in free chat) a field for an own question. Cards are a radio-like
 * list of buttons: one tap asks it.
 */
import { useState } from "react";

import type { ConversationDto, PromptCardDto } from "@/contracts/chat";
import { categoryIcon } from "@/ui/design/category-icons";
import { Button } from "@/ui/kit/button";
import { Icon } from "@/ui/kit/icon";

import { CONVERSATION_COPY } from "./chat-copy";
import { TextComposer } from "./text-composer";

const OWN_ROWS = 2;

export interface QuestionCardsProps {
  ask: NonNullable<ConversationDto["ask"]>;
  limit: number;
  onAsk(question: { promptId: string } | { customText: string }): Promise<string | null>;
  onOthers(): void;
}

export function QuestionCards({ ask, limit, onAsk, onOthers }: QuestionCardsProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(card: PromptCardDto) {
    setBusy(card.id);
    setError(await onAsk(card.origin === "coincidence" ? { customText: card.text } : { promptId: card.id }));
    setBusy(null);
  }

  return (
    <section className="zm-box zm-box--frame zm-ask" aria-labelledby="ask-title">
      <h3 id="ask-title" className="zm-chat__title">{CONVERSATION_COPY.askTitle}</h3>
      <p className="zm-detail__muted">{CONVERSATION_COPY.askHint}</p>
      <ul className="zm-ask__cards">
        {ask.suggestions.map((card) => (
          <li key={card.id}>
            <button type="button" className="zm-box zm-ask__card" disabled={busy !== null} aria-busy={busy === card.id || undefined} onClick={() => void choose(card)}>
              <Icon name={categoryIcon(card.category)} />
              <span className="zm-ask__text">{card.text}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="zm-chat__actions">
        <Button variant="ghost" icon="recenter" disabled={busy !== null} onClick={onOthers}>{CONVERSATION_COPY.askOthers}</Button>
      </div>
      {ask.canWriteOwn ? (
        <TextComposer label={CONVERSATION_COPY.askOwnLabel} submitLabel={CONVERSATION_COPY.askOwnSend} limit={limit} rows={OWN_ROWS} onSubmit={(customText) => onAsk({ customText })} />
      ) : null}
      <p className="zm-chat__message" role="status" aria-live="polite">{error}</p>
    </section>
  );
}
