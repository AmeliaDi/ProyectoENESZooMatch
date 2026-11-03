"use client";

/**
 * Labelled textarea with a calm character counter. The counter is linked by
 * `aria-describedby` (not live, so it does not speak on every key); errors go
 * through a polite live region. Ctrl/Cmd + Enter also sends.
 */
import { useId, useState, type FormEvent, type KeyboardEvent } from "react";

import { Button } from "@/ui/kit/button";

import { CONVERSATION_COPY, charsLeft } from "./chat-copy";

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
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const left = limit - value.length;

  async function send(event?: FormEvent) {
    event?.preventDefault();
    if (busy) return;
    const body = value.trim();
    if (!body) return setError(CONVERSATION_COPY.emptyText);
    if (left < 0) return setError(CONVERSATION_COPY.tooLong);
    setBusy(true);
    const failure = await onSubmit(body);
    setBusy(false);
    setError(failure);
    if (failure === null) setValue("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) void send();
  }

  return (
    <form className="zm-composer" onSubmit={(e) => void send(e)}>
      <label htmlFor={id} className="zm-field__label">{label}</label>
      <div className="zm-box zm-field__box" data-invalid={error ? "true" : undefined}>
        <textarea
          id={id}
          className="zm-composer__input"
          rows={rows}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          aria-describedby={`${id}-count ${id}-error`}
          aria-invalid={error ? true : undefined}
        />
      </div>
      <div className="zm-composer__foot">
        <p id={`${id}-count`} className="zm-composer__count" data-over={left < 0 || undefined}>{charsLeft(left)}</p>
        <Button type="submit" variant="primary" icon="next" busy={busy} disabled={busy}>{submitLabel}</Button>
      </div>
      <p id={`${id}-error`} className="zm-chat__message" role="status" aria-live="polite">{error}</p>
    </form>
  );
}
