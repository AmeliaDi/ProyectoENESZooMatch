"use client";

/**
 * Own light emoji picker (docs/CHAT.md §12.6): system emoji, Spanish search,
 * recent favourites. A disclosure (not a modal) so the composer keeps focus
 * order; every emoji is a button named in Spanish for screen readers.
 */
import { useId, useState } from "react";

import { CHAT_EMOJI } from "@/config";
import { Button } from "@/ui/kit/button";

import { CONVERSATION_COPY } from "./chat-copy";
import { emojiName, pushRecent, readRecent, saveRecent, searchEmoji } from "./emoji-search";

function EmojiButton({ char, name, onPick }: { char: string; name: string; onPick(char: string): void }) {
  return (
    <li>
      <button type="button" className="zm-emoji__item" aria-label={name} title={name} onClick={() => onPick(char)}>
        <span aria-hidden="true">{char}</span>
      </button>
    </li>
  );
}

export function EmojiPicker({ onPick }: { onPick(char: string): void }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>([]);

  function toggle() {
    if (!open) setRecent(readRecent());
    setOpen(!open);
  }

  function pick(char: string) {
    const next = pushRecent(recent, char);
    setRecent(next);
    saveRecent(next);
    onPick(char);
  }

  const results = searchEmoji(query);
  return (
    <div className="zm-emoji">
      <Button variant="ghost" aria-expanded={open} aria-controls={id} onClick={toggle}>{CONVERSATION_COPY.emojiOpen}</Button>
      {open ? (
        <div id={id} className="zm-box zm-emoji__panel" role="group" aria-label={CONVERSATION_COPY.emojiOpen}>
          <label className="zm-field__label" htmlFor={`${id}-q`}>{CONVERSATION_COPY.emojiSearch}</label>
          <input id={`${id}-q`} className="zm-box zm-emoji__search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
          {recent.length > 0 && !query ? (
            <>
              <p className="zm-eyebrow">{CONVERSATION_COPY.emojiRecent}</p>
              <ul className="zm-emoji__grid">
                {recent.map((char) => <EmojiButton key={char} char={char} name={emojiName(char) ?? char} onPick={pick} />)}
              </ul>
            </>
          ) : null}
          {query ? null : <p className="zm-eyebrow">{CHAT_EMOJI.grupos.map((g) => g.nombre).join(" · ")}</p>}
          <ul className="zm-emoji__grid">
            {results.map((e) => <EmojiButton key={e.char} char={e.char} name={e.name} onPick={pick} />)}
          </ul>
          {results.length === 0 ? <p className="zm-detail__muted" role="status">{CONVERSATION_COPY.emojiNone}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
