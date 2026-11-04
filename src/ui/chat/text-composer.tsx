"use client";

/**
 * Labelled textarea with a discreet "X/300" counter in graphemes (same rule
 * as the server), an emoji picker, and a gentle anonymity notice when the
 * text looks like a phone, e-mail or @handle (the person can still send).
 * The counter is linked by `aria-describedby` (not live); errors go through a
 * polite live region. Ctrl/Cmd + Enter also sends.
 */
import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { contactHints, graphemeCount, normalizeChatText } from "@/domain/chat";
import { Button } from "@/ui/kit/button";

import { CONVERSATION_COPY, charsCounter } from "./chat-copy";
import { CHAT_MODERATION_HINTS } from "./contact-hints";
import { EmojiPicker } from "./emoji-picker";

/** Share of the limit from which the counter turns to the warning colour. */
const NEAR_LIMIT = 0.9;

export interface TextComposerProps {
  label: string;
  submitLabel: string;
  limit: number;
  /** Rows of the textarea before it scrolls. */
  rows: number;
  /** Resolves to an error message, or `null` when sent (the text clears). */
  onSubmit(body: string): Promise<string | null>;
}

export function TextComposer({ label, submitLabel, limit, rows, onSubmit }: TextComposerProps) {
  const id = useId();
  const input = useRef<HTMLTextAreaElement | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [warned, setWarned] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const used = graphemeCount(normalizeChatText(value));
  const counter = charsCounter(used, limit);
  const state = used > limit ? "over" : used >= limit * NEAR_LIMIT ? "near" : undefined;

  async function send(event?: FormEvent) {
    event?.preventDefault();
    if (busy) return;
    const body = normalizeChatText(value);
    if (!body) return setError(CONVERSATION_COPY.emptyText);
    if (used > limit) return setError(CONVERSATION_COPY.tooLong);
    if (warned !== body && contactHints(body, CHAT_MODERATION_HINTS).length > 0) {
      setWarned(body);
      return setError(CONVERSATION_COPY.contactNotice);
    }
    setBusy(true);
    const failure = await onSubmit(body);
    setBusy(false);
    setError(failure);
    if (failure === null) {
      setValue("");
      setWarned(null);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) void send();
  }

  function addEmoji(char: string) {
    setValue((prev) => `${prev}${char}`);
    input.current?.focus();
  }

  const sendLabel = warned !== null && warned === normalizeChatText(value) ? CONVERSATION_COPY.contactSendAnyway : submitLabel;
  return (
    <form className="zm-composer" onSubmit={(e) => void send(e)}>
      <label htmlFor={id} className="zm-field__label">{label}</label>
      <div className="zm-box zm-field__box" data-invalid={error ? "true" : undefined}>
        <textarea
          ref={input}
          id={id}
          className="zm-composer__input"
          rows={rows}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          aria-describedby={`${id}-count ${id}-error`}
          aria-invalid={state === "over" || undefined}
        />
      </div>
      <div className="zm-composer__foot">
        <EmojiPicker onPick={addEmoji} />
        <p id={`${id}-count`} className="zm-composer__count zm-num" data-state={state}>
          <span aria-hidden="true">{counter.visual}</span>
          <span className="zm-sr-only">{counter.spoken}</span>
        </p>
        <Button type="submit" variant="primary" icon="next" busy={busy} disabled={busy}>{sendLabel}</Button>
      </div>
      <p id={`${id}-error`} className="zm-chat__message" role="status" aria-live="polite">{error}</p>
    </form>
  );
}
